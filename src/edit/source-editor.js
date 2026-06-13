import {CodeMirror} from '@/cm';
import {getLZValue, LZ_KEY, setLZValue} from '@/js/chrome-sync';
import {mimeLESS, UCD} from '@/js/consts';
import {$create, $createLink, $isTextInput} from '@/js/dom';
import {messageBox} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {styleToCss} from '@/js/sections-util';
import {makeUserCssFindFilter, NOP, reuseStyleVars, t} from '@/js/util';
import cmFactory from './codemirror-factory';
import editor, {failRegexp} from './editor';
import * as linterMan from './linter';
import livePreview from './live-preview';
import MozSectionFinder from './moz-section-finder';
import MozSectionWidget from './moz-section-widget';
import {initMetaCompiler, metaCompiler, pendingMeta} from './source-editor-meta';

export default function SourceEditor() {
  const {style, /** @type DirtyReporter */dirty} = editor;
  let lintingEnabled;
  let savedGeneration;
  let prevMode = NaN;
  let prevSel;
  let updateTocFocusPending;

  $id('header').on('wheel', headerOnScroll);
  $id('save-button').on('split-btn', saveTemplate);

  const cmpPos = CodeMirror.cmpPos;
  const [DEFAULT_TEMPLATE, TEMPLATE, TEMPLATE_DATA] = editor.template;
  const pp0 = (style[UCD] ||= TEMPLATE_DATA).preprocessor;
  const cm = cmFactory.create($('#sections').appendChild($create('.single-editor')), {
    mode: pp0 === 'less' ? mimeLESS : pp0 === 'stylus' ? pp0 : 'css',
    value: style.id ? style.sourceCode : setupNewStyle(TEMPLATE || DEFAULT_TEMPLATE),
  }, me => {
    const si = editor.applyScrollInfo(me) || {};
    editor.viewTo = si.viewTo;
    Object.assign(me.curOp, si.scroll);
    editor.viewTo = 0;
  });
  const getStyleValue = asObject => asObject
    ? {...style, sourceCode: cm.getValue(), sections: undefined, [UCD]: undefined}
    : cm.getValue();
  const kToc = 'editor.toc.expanded';
  const kWidget = 'editor.appliesToLineWidget';
  const sectionFinder = MozSectionFinder(cm);
  const sectionWidget = MozSectionWidget(cm, sectionFinder);
  const mozSections = editor.sections = sectionFinder.sections;
  prevSel = cm.doc.sel;
  livePreview._then = showLog;
  prefs.subscribe([kToc, kWidget], (k, val) => {
    sectionFinder.onOff(updateToc, prefs.__values[kToc] || prefs.__values[kWidget]);
    // TODO: detect global sections
    if (!mozSections.length) editor.updateToc([]);
    if (k === kWidget) sectionWidget.toggle(val);
    if (k === kToc) cm[val ? 'on' : 'off']('cursorActivity', onCursorActivity);
  }, true);
  initMetaCompiler(cm, meta => {
    const {vars} = meta;
    if (vars) reuseStyleVars(vars, style);
    style[UCD] = meta;
    style.name = meta.name;
    style.url = meta.homepageURL || style.installationUrl;
    updateMeta();
  });
  linterMan.register(metaCompiler);
  updateMeta();
  // Subsribing outside of finishInit() because it uses `cm` that's still not initialized
  prefs.subscribe('editor.linter', updateLinterSwitch, true);

  /** @namespace Editor */
  Object.assign(editor, {
    replaceStyle,
    updateLinterSwitch,
    updateMeta,
    closestVisible: () => cm,
    getCurrentLinter,
    getEditors: () => [cm],
    getEditorTitle: () => '',
    getValue: getStyleValue,
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
      if (pendingMeta)
        await pendingMeta;
      let savedStyle;
      try {
        if (!style.id && await API.usercss.find({
          id: style.id,
          [UCD]: makeUserCssFindFilter(style[UCD]),
        })) {
          messageBox.alert(t('usercssAvoidOverwriting'), 'danger', t('genericError'));
        } else {
          const res = await API.usercss.editSave(getStyleValue(true), editor.msg);
          const badRe = (savedStyle = res.style).sections
            .flatMap(sec => sec.regexps || [])
            .map((r, _) => (_ = failRegexp(r)) && `${_}: ${r}`)
            .filter(Boolean)
            .join('\n\n');
          if (badRe) messageBox.alert(badRe, 'danger pre', t('styleBadRegexp'));
          showLog(res);
          // Awaiting inside `try` so that exceptions go to our `catch`
          await replaceStyle(savedStyle);
        }
      } catch (err) {
        showSaveError(err, savedStyle || style);
      }
    },
    scrollToEditor: NOP,
  });

  savedGeneration = cm.changeGeneration();
  cm.on('changes', (_, changes) => {
    dirty.modify('sourceGeneration', savedGeneration, cm.changeGeneration());
    livePreview();
    if (!lintingEnabled) metaCompiler(changes);
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
  if (!$isTextInput()) {
    cm.focus();
  }

  function showLog({log, warn}) {
    if (log) for (const v of log) console.log(v);
    if (warn) for (const v of warn) console.warn(v);
  }

  function updateLinterSwitch(key, val) {
    lintingEnabled = val;
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

  function setupNewStyle(code) {
    const comment = `/* ${t('usercssReplaceTemplateSectionBody')} */`;
    const sec0 = style.sections[0];
    sec0.code = ' '.repeat(prefs.__values['editor.tabSize']) + comment;
    if (Object.keys(sec0).length === 1) { // the only key is 'code'
      sec0.domains = ['example.com'];
    }
    return (style.sourceCode = code
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
      livePreview(true);
      return;
    }

    if (draft || await messageBox.confirm(t('styleUpdateDiscardChanges'))) {
      newStyle[UCD] ||= await metaCompiler(newStyle.sourceCode, {}, cm, /*force=*/true);
      editor.useSavedStyle(newStyle);
      if (!sameCode) {
        const si0 = draft && draft.si.cms[0];
        const cursor = !si0 && cm.getCursor();
        cm.setValue(style.sourceCode); // `style` is merged with `newStyle` by useSavedStyle
        if (si0) {
          editor.applyScrollInfo(cm, si0);
        } else {
          cm.setCursor(cursor);
        }
        savedGeneration = cm.changeGeneration();
      }
      if (sameCode) {
        // the code is same but the environment is changed
        livePreview(true);
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
    err = Array.isArray(err) ? err : [err];
    const text = err.map(e => e.message || e).join('\n');
    const points = err.map(e =>
      e.index >= 0 && cm.posFromIndex(e.index) || // usercss meta parser
      e.offset >= 0 && {line: e.line - 1, ch: (e.col || e.column) - 1} // csslint code parser
    ).filter(Boolean);
    const pp = errStyle[UCD]?.preprocessor;
    const ppUrl = editor.ppDemo[pp];
    if (points[0]) cm.operation(() => {
      cm.jumpToPos(points[0]);
      cm.setSelections(points.map(p => ({anchor: p, head: p})));
    });
    messageBox.show({
      title: t('genericError'),
      className: 'center pre danger',
      contents: $create('pre', text),
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

  function getModeName() {
    const mode = cm.doc.mode;
    if (!mode) return '';
    return (mode.name || mode || '') +
           (mode.helperType || '');
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
