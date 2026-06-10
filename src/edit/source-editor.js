import {kLineComment} from '@/cm/util';
import {getLZValue, LZ_KEY, setLZValue} from '@/js/chrome-sync';
import {mimeLESS, UCD} from '@/js/consts';
import {$create, $createLink, $isTextInput} from '@/js/dom';
import {messageBox} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {styleToCss} from '@/js/sections-util';
import {makeUserCssFindFilter, NOP, reuseStyleVars, RX_META, t} from '@/js/util';
import {CodeMirror} from '@/cm';
import cmFactory from './codemirror-factory';
import editor, {failRegexp} from './editor';
import * as linterMan from './linter';
import {livePreview, livePreviewNow} from './live-preview';
import MozSectionFinder from './moz-section-finder';
import MozSectionWidget from './moz-section-widget';
import {worker} from './util';

export default function SourceEditor() {
  const {style, /** @type DirtyReporter */dirty} = editor;
  let lintingEnabled;
  let savedGeneration;
  let prevMode = NaN;
  let /** @type {Promise} */ pendingMeta;
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
  const metaCompiler = createMetaCompiler(meta => {
    const {vars} = meta;
    if (vars) reuseStyleVars(vars, style);
    style[UCD] = meta;
    style.name = meta.name;
    style.url = meta.homepageURL || style.installationUrl;
    updateMeta();
  });
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
          showLog(res.log);
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

  /** Shows the console.log output from the background worker stored in `log` property */
  function showLog(log) {
    if (log) for (const args of log) console.log(...args);
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
    // stylelint chokes on line comments a lot
    cm.setPreprocessor(style[UCD]?.preprocessor)[kLineComment] = '';
  }

  async function replaceStyle(newStyle, draft) {
    dirty.clear('name');
    const sameCode = editor.isSame(newStyle);
    if (sameCode) {
      savedGeneration = cm.changeGeneration();
      editor.useSavedStyle(newStyle);
      dirty.clear('sourceGeneration');
      dirty.clear('enabled');
      livePreviewNow();
      return;
    }

    if (draft || await messageBox.confirm(t('styleUpdateDiscardChanges'))) {
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
        livePreviewNow();
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
    const pp = errStyle[UCD]?.preprocessor;
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

  function getModeName() {
    const mode = cm.doc.mode;
    if (!mode) return '';
    return (mode.name || mode || '') +
           (mode.helperType || '');
  }

  function createMetaCompiler(onUpdated) {
    let meta, done, iFrom, iTo, lineTo, chTo;
    let prevRes = [];
    const [rxMetaStart, rxMetaEnd] = RX_META.source.split(/(?=\(\?:)/).map(s => RegExp(s, 'yi'));
    /** @param {CodeMirror.EditorChange} change */
    const isAfterMeta = ({from}) => (from.line - lineTo || from.ch - chTo) >= 0;
    linterMan.register(run);
    return run;

    async function run(text, linterOptions, linterCM) {
      if (pendingMeta || (linterCM ? linterCM !== cm : text.every(isAfterMeta)))
        return;
      let iFromNew = 0;
      let iToNew = 0;
      if (!linterCM) {
        text = '';
        let line = -1;
        let inComment, inMeta;
        cm.eachLine(({text: str}) => {
          line++;
          let i = -15; // minimal length of meta start
          let j, m;
          while (true) {
            if (!inComment) {
              inComment = (i = str.indexOf('/*', i)) >= 0;
              if (!inComment)
                break;
              rxMetaStart.lastIndex = i;
              inMeta = rxMetaStart.test(str);
              if (inMeta) iFromNew += i;
            }
            inComment = (j = str.indexOf('*/', i + 2)) < 0;
            if (inComment) {
              if (inMeta) {
                if (text) text += '\n';
                text += str;
              }
              break;
            }
            j += 2;
            inMeta &&= j - i >= 31 &&
              ((str.indexOf('==/', i + 15) + 1 || j) < j) &&
              (rxMetaEnd.lastIndex = i + 15, m = rxMetaEnd.exec(str)) &&
              (m.index + m[0].length === j);
            if (inMeta) {
              if (text) text += '\n';
              text += str.slice(i < 0 ? 0 : i, j);
              lineTo = line;
              chTo = j;
              iToNew += j;
              return true;
            }
            i = j;
          }
          i = str.length + 1;
          iToNew += i;
          if (!inMeta) iFromNew += i;
        });
      } else if (
        (!meta
          || text.charCodeAt(iFrom) !== meta.charCodeAt(iFrom)
          || text.charCodeAt(iTo) !== meta.charCodeAt(iTo)
          || text.slice(iFrom, iTo) !== meta
        ) && (text = text.match(RX_META))
      ) {
        iFromNew = text.index;
        text = text[0];
        iToNew = iFromNew + text.length;
      }
      if (!text) {
        return [];
      }
      if (text === meta) {
        if (iFromNew !== iFrom) {
          for (const r of prevRes) {
            r.from = r.to = cm.posFromIndex(r.i - iFrom + iFromNew);
            r.i = iFromNew;
          }
        }
        iFrom = iFromNew;
        iTo = iToNew;
        return prevRes;
      }
      pendingMeta = new Promise(cb => (done = cb));
      const {metadata, errors} = await worker.metalint(text);
      if (errors.every(err => err.code === 'unknownMeta')) {
        onUpdated(metadata);
      }
      meta = text;
      iFrom = iFromNew;
      iTo = iToNew;
      prevRes = errors.map(({code, index, args, message}) => {
        const isUnknownMeta = code === 'unknownMeta';
        const typo = isUnknownMeta && args[1] ? 'Typo' : ''; // args[1] may be present but undefined
        const i = (index || 0) + iFromNew;
        const pos = cm.posFromIndex(i);
        return {
          i,
          from: pos,
          to: pos,
          message: code && t(`meta_${code}${typo}`, args, false) || message,
          severity: isUnknownMeta ? 'warning' : 'error',
          rule: code,
        };
      });
      done(prevRes);
      pendingMeta = null;
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
