import {getLZValue, LZ_KEY, setLZValue} from '@/js/chrome-sync';
import {UCD} from '@/js/consts';
import {$$remove, $create, $createLink, $isTextInput} from '@/js/dom';
import {messageBox} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {styleToCss} from '@/js/sections-util';
import {RX_META, t} from '@/js/util';
import {CodeMirror} from '@/cm';
import cmFactory from './codemirror-factory';
import editor, {failRegexp} from './editor';
import * as linterMan from './linter';
import MozSectionFinder from './moz-section-finder';
import MozSectionWidget from './moz-section-widget';
import {worker} from './util';

export default function SourceEditor() {
  const {style, /** @type DirtyReporter */dirty} = editor;
  const DEFAULT_TEMPLATE = `
    /* ==UserStyle==
    @name           ${''/* a trick to preserve the trailing spaces */}
    @namespace      github.com/openstyles/stylus
    @version        1.0.0
    @description    A new userstyle
    @author         Me
    ==/UserStyle== */
  `.replace(/^\s+/gm, '');
  let savedGeneration;
  let prevMode = NaN;
  let prevSel;
  /** @type {MozSectionFinder} */
  let sectionFinder;
  let sectionWidget;
  /** @type {MozSection[]} */
  let mozSections;
  let updateTocFocusPending;

  $$remove('.sectioned-only');
  $id('header').on('wheel', headerOnScroll);
  $id('sections').textContent = '';
  $id('sections').appendChild($create('.single-editor'));
  $id('save-button').on('split-btn', saveTemplate);

  const cmpPos = CodeMirror.cmpPos;
  const cm = cmFactory.create($('.single-editor'), {
    value: style.id ? style.sourceCode : setupNewStyle(editor.template),
    finishInit(me) {
      const kToc = 'editor.toc.expanded';
      const kWidget = 'editor.appliesToLineWidget';
      const si = editor.applyScrollInfo(me) || {};
      editor.viewTo = si.viewTo;
      sectionFinder = MozSectionFinder(me);
      sectionWidget = MozSectionWidget(me, sectionFinder);
      mozSections = editor.sections = sectionFinder.sections;
      prevSel = me.doc.sel;
      prefs.subscribe([kToc, kWidget], (k, val) => {
        sectionFinder.onOff(updateToc, prefs.__values[kToc] || prefs.__values[kWidget]);
        if (k === kWidget) sectionWidget.toggle(val);
        if (k === kToc) me[val ? 'on' : 'off']('cursorActivity', onCursorActivity);
      }, true);
      Object.assign(me.curOp, si.scroll);
      editor.viewTo = 0;
    },
  });
  const metaCompiler = createMetaCompiler(meta => {
    const {vars} = style[UCD] || {};
    if (vars) {
      let v;
      for (const [key, val] of Object.entries(meta.vars || {})) {
        if ((v = vars[key]) && v.type === val.type && (v = v.value) != null) {
          val.value = v; // TODO: check min/max? reuse assignVars?
        }
      }
    }
    style[UCD] = meta;
    style.name = meta.name;
    style.url = meta.homepageURL || style.installationUrl;
    updateMeta();
  });
  updateMeta();
  // Subsribing outside of finishInit() because it uses `cm` that's still not initialized
  prefs.subscribe('editor.linter', updateLinterSwitch, true);

  /** @namespace Editor */
  Object.assign(editor, {
    replaceStyle,
    updateLinterSwitch,
    updateLivePreview,
    updateMeta,
    closestVisible: () => cm,
    getCurrentLinter,
    getEditors: () => [cm],
    getEditorTitle: () => '',
    getValue: asObject => asObject
      ? {
        customName: style.customName,
        enabled: style.enabled,
        sourceCode: cm.getValue(),
      }
      : cm.getValue(),
    getSearchableInputs: () => [],
    isSame: styleObj => styleObj.sourceCode === cm.getValue(),
    prevEditor: nextPrevSection.bind(null, -1),
    nextEditor: nextPrevSection.bind(null, 1),
    jumpToEditor(i) {
      const sec = sectionFinder.sections[i];
      if (sec) {
        sectionFinder.updatePositions(sec);
        cm.jumpToPos(sec.start);
        cm.focus();
      }
    },
    async saveImpl() {
      const sourceCode = cm.getValue();
      let res;
      try {
        const {customName, enabled, id} = style;
        res = !id && await API.usercss.build({sourceCode, checkDup: true, metaOnly: true});
        if (res && res.dup) {
          messageBox.alert(t('usercssAvoidOverwriting'), 'danger', t('genericError'));
        } else {
          res = await API.usercss.editSave({customName, enabled, id, sourceCode});
          // Awaiting inside `try` so that exceptions go to our `catch`
          await replaceStyle(res.style);
          if ((res.badRe = getBadRegexps(res.style))) {
            messageBox.alert(res.badRe, 'danger pre', t('styleBadRegexp'));
          }
        }
        showLog(res.log);
      } catch (err) {
        showSaveError(err, res && res.style || style);
      }
    },
    scrollToEditor: () => {},
  });

  savedGeneration = cm.changeGeneration();
  cm.on('changes', (_, changes) => {
    dirty.modify('sourceGeneration', savedGeneration, cm.changeGeneration());
    editor.livePreviewLazy(updateLivePreview);
    metaCompiler(changes);
  });
  cm.on('optionChange', (_cm, option) => {
    if (option !== 'mode') return;
    const mode = getModeName();
    if (mode === prevMode) return;
    prevMode = mode;
    linterMan.run();
    updateLinterSwitch();
  });
  setTimeout(linterMan.enableForEditor, 0, cm);
  if (!$isTextInput(document.activeElement)) {
    cm.focus();
  }

  /** Shows the console.log output from the background worker stored in `log` property */
  function showLog(log) {
    if (log) for (const args of log) console.log(...args);
  }

  function updateLivePreview() {
    if (!style.id) {
      return;
    }
    showLog(editor.livePreview(Object.assign({}, style, {sourceCode: cm.getValue()})));
  }

  function updateLinterSwitch() {
    const el = $id('editor.linter');
    if (!el) return;
    el.value = getCurrentLinter();
    const cssLintOption = el.$('[value="csslint"]');
    const mode = getModeName();
    if (mode !== 'css') {
      cssLintOption.disabled = true;
      cssLintOption.title = t('linterCSSLintIncompatible', mode);
    } else {
      cssLintOption.disabled = false;
      cssLintOption.title = '';
    }
  }

  function getCurrentLinter() {
    const name = prefs.__values['editor.linter'];
    if (cm.getOption('mode') !== 'css' && name === 'csslint') {
      return 'stylelint';
    }
    return name;
  }

  function setupNewStyle(tpl) {
    const comment = `/* ${t('usercssReplaceTemplateSectionBody')} */`;
    const sec0 = style.sections[0];
    sec0.code = ' '.repeat(prefs.__values['editor.tabSize']) + comment;
    if (Object.keys(sec0).length === 1) { // the only key is 'code'
      sec0.domains = ['example.com'];
    }
    return (style.sourceCode = (tpl || DEFAULT_TEMPLATE)
      .replace(/(@name)(?:([\t\x20]+).*|\n)/, (_, k, space) => `${k}${space || ' '}${style.name}`)
      .replace(/\s*@-moz-document[^{]*{([^}]*)}\s*$/g, // stripping dummy sections
        (s, body) => body.trim() === comment ? '\n\n' : s)
      .trim() +
      '\n\n' +
      styleToCss(style)
    );
  }

  function updateMeta() {
    const name = style.customName || style.name;
    $id('name').value = name;
    $id('enabled').checked = style.enabled;
    $id('url').href = style.url;
    editor.updateName();
    cm.setPreprocessor(style[UCD]?.preprocessor);
  }

  async function replaceStyle(newStyle, draft) {
    dirty.clear('name');
    const sameCode = editor.isSame(newStyle);
    if (sameCode) {
      savedGeneration = cm.changeGeneration();
      editor.useSavedStyle(newStyle);
      dirty.clear('sourceGeneration');
      dirty.clear('enabled');
      updateLivePreview();
      return;
    }

    if (draft || await messageBox.confirm(t('styleUpdateDiscardChanges'))) {
      editor.useSavedStyle(newStyle);
      if (!sameCode) {
        const si0 = draft && draft.si.cms[0];
        const cursor = !si0 && cm.getCursor();
        cm.setValue(style.sourceCode);
        if (si0) {
          editor.applyScrollInfo(cm, si0);
        } else {
          cm.setCursor(cursor);
        }
        savedGeneration = cm.changeGeneration();
      }
      if (sameCode) {
        // the code is same but the environment is changed
        updateLivePreview();
      }
      if (!draft) {
        dirty.clear();
      }
    }
  }

  async function saveTemplate() {
    const res = await messageBox.show({
      contents: t('usercssReplaceTemplateConfirmation'),
      className: 'center',
      buttons: [t('confirmYes'), t('confirmNo'), {
        textContent: t('genericResetLabel'),
        title: t('restoreTemplate'),
      }],
    });
    if (res.enter || res.button !== 1) {
      const key = LZ_KEY.usercssTemplate;
      const code = res.button === 2 ? DEFAULT_TEMPLATE : cm.getValue();
      await setLZValue(key, code);
      if (await getLZValue(key) !== code) {
        messageBox.alert(t('syncStorageErrorSaving'));
      }
    }
  }

  function showSaveError(err, errStyle) {
    const shift = (err._varLines - 1) || 0;
    err = Array.isArray(err) ? err : [err];
    const text = err.map(e => e.message || e).join('\n');
    const points = err.map(e =>
      e.index >= 0 && cm.posFromIndex(e.index) || // usercss meta parser
      e.offset >= 0 && {line: e.line - 1, ch: e.col - 1} // csslint code parser
    ).filter(Boolean);
    const pp = errStyle[UCD].preprocessor;
    const ppUrl = editor.ppDemo[pp];
    cm.setSelections(points.map(p => ({anchor: p, head: p})));
    messageBox.show({
      title: t('genericError'),
      className: 'center pre danger',
      contents: $create('pre',
        pp === 'stylus' && shift
          ? text.replace(/^.+\n/, '').replace(/^(\s*)(\d+)/gm, (s, a, b) => a + (b - shift))
          : text),
      buttons: [
        t('confirmClose'),
        ppUrl && $createLink({className: 'icon', href: ppUrl}, [
          t('genericTest'),
          $create('i.i-external', {style: 'line-height:0'}),
        ]),
      ],
    });
  }

  function nextPrevSection(dir) {
    // ensure the data is ready in case the user wants to jump around a lot in a large style
    sectionFinder.keepAliveFor(nextPrevSection, 10e3);
    sectionFinder.updatePositions();
    const num = mozSections.length;
    if (!num) return;
    dir = dir < 0 ? -1 : 0;
    const pos = cm.getCursor();
    let i = mozSections.findIndex(sec => CodeMirror.cmpPos(sec.start, pos) > Math.min(dir, 0));
    if (i < 0 && (!dir || CodeMirror.cmpPos(mozSections[num - 1].start, pos) < 0)) {
      i = 0;
    }
    cm.jumpToPos(mozSections[(i + dir + num) % num].start);
  }

  function headerOnScroll({target, deltaY, deltaMode, shiftKey}) {
    while ((target = target.parentElement)) {
      if (deltaY < 0 && target.scrollTop ||
          deltaY > 0 && target.scrollTop + target.clientHeight < target.scrollHeight) {
        return;
      }
    }
    cm.display.scroller.scrollTop +=
      // WheelEvent.DOM_DELTA_LINE
      deltaMode === 1 ? deltaY * cm.defaultTextHeight() :
      // WheelEvent.DOM_DELTA_PAGE
      deltaMode === 2 || shiftKey ? Math.sign(deltaY) * cm.display.scroller.clientHeight :
      // WheelEvent.DOM_DELTA_PIXEL
      deltaY;
  }

  function getBadRegexps({sections}) {
    const res = [];
    for (const {regexps} of sections) {
      if (regexps) {
        for (const r of regexps) {
          const err = failRegexp(r);
          if (err) res.push(`${err}: ${r}`);
        }
      }
    }
    return res.join('\n\n');
  }

  function getModeName() {
    const mode = cm.doc.mode;
    if (!mode) return '';
    return (mode.name || mode || '') +
           (mode.helperType || '');
  }

  function createMetaCompiler(onUpdated) {
    let meta, iFrom, iTo, min, max;
    let prevRes, busy, done;
    linterMan.register(run);
    return run;

    async function run(text, options, cm2) {
      if (cm2 && cm2 !== cm) return;
      if (busy) return busy;
      if (meta && !cm2) {
        for (const change of /**@type{CodeMirror.EditorChange[]}*/text) {
          const a = change.from;
          const b = CodeMirror.changeEnd(change);
          if (cmpPos(a, min) < 0 ? ((min = a), cmpPos(b, min) >= 0) : cmpPos(a, max) <= 0) {
            if (cmpPos(b, max) > 0) max = b;
            text = '';
          }
        }
        // Exit if all changes are outside the metadata range
        if (text) return;
        /* Get the entire text because the current meta's ending may have been removed,
           while another existing ending may be outside the changed range. */
        text = cm.getValue();
      }
      // Comparing even if there are changes as the user may have typed the same text over
      if (meta
        && text.charCodeAt(iFrom) === meta.charCodeAt(iFrom)
        && text.charCodeAt(iTo) === meta.charCodeAt(iTo)
        && text.slice(iFrom, iTo + 1) === meta) {
        return prevRes;
      }
      const match = text.match(RX_META);
      if (!match) {
        return [];
      }
      busy = new Promise(cb => (done = cb));
      const {metadata, errors} = await worker.metalint(match[0]);
      if (errors.every(err => err.code === 'unknownMeta')) {
        onUpdated(metadata);
      }
      meta = match[0];
      iFrom = match.index; min = cm.posFromIndex(iFrom);
      iTo = iFrom + meta.length - 1; max = cm.posFromIndex(iTo);
      for (let i = 0; i < errors.length; i++) {
        const {code, index, args, message} = errors[i];
        const isUnknownMeta = code === 'unknownMeta';
        const typo = isUnknownMeta && args[1] ? 'Typo' : ''; // args[1] may be present but undefined
        errors[i] = {
          from: cm.posFromIndex((index || 0) + i),
          to: cm.posFromIndex((index || 0) + i),
          message: code && t(`meta_${code}${typo}`, args, false) || message,
          severity: isUnknownMeta ? 'warning' : 'error',
          rule: code,
        };
      }
      prevRes = errors;
      done(prevRes);
      return prevRes;
    }
  }

  function onCursorActivity() {
    if (prevSel !== cm.doc.sel) {
      prevSel = cm.doc.sel;
      updateTocFocusPending ??= Promise.resolve().then(updateTocFocus);
    }
  }

  function updateToc(...args) {
    editor.updateToc(...args);
    updateTocFocus();
  }

  function updateTocFocus() {
    updateTocFocusPending = null;
    const pos = prevSel.ranges[0].head;
    const toc = editor.toc;
    let end = mozSections.length;
    let a = 0;
    let b = end--;
    let c = pos.line && Math.min(toc.i ?? (a + b) >> 1, end);
    let c0, sec;
    while (a < b && c0 !== c) {
      sec = mozSections[c];
      if (cmpPos(sec.start, pos) > 0)
        b = c;
      else if (c < end && cmpPos(mozSections[c + 1].start, pos) <= 0)
        a = c;
      else
        return c !== toc.i && editor.updateToc({focus: true, 0: sec});
      c0 = c;
      c = (a + b) >> 1;
    }
    toc.el.$('.' + toc.cls)?.classList.remove(toc.cls);
    toc.i = null;
  }
}
