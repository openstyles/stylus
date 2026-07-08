import {CodeMirror} from '@/cm';
import {getLZValue, LZ_KEY, setLZValue} from '@/js/chrome-sync';
import {pEditorLinter, UCD} from '@/js/consts';
import {$create, $isTextInput} from '@/js/dom';
import showUnhandledError, {elError} from '@/js/dom-error';
import {messageBox} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {getPreprocessorMode, styleToCss} from '@/js/style-util';
import {makeUserCssFindFilter, NOP, reuseStyleVars, t} from '@/js/util';
import cmFactory from './codemirror-factory';
import editor, {failRegexp} from './editor';
import * as linterMan from './linter';
import {curLinter, linterOn, overrideCurLinter} from './linter/engines';
import {linters, onLinterPref} from './linter/store';
import livePreview from './live-preview';
import MozSectionFinder from './moz-section-finder';
import MozSectionWidget from './moz-section-widget';
import {initMetaCompiler, metaCompiler, pendingMeta} from './source-editor-meta';

export default function SourceEditor() {
  const style = editor.style;
  const dirty = editor.dirty;
  let savedGeneration;
  let prevMode = NaN;
  let prevSel;
  let saving;
  let updateTocFocusPending;

  $id('save-button').on('split-btn', saveTemplate);

  const cmpPos = CodeMirror.cmpPos;
  const [DEFAULT_TEMPLATE, TEMPLATE, TEMPLATE_DATA] = editor.template;
  const initialCode = style.id ? style.sourceCode : setupNewStyle(TEMPLATE || DEFAULT_TEMPLATE);
  const cm = cmFactory.create($('#sections').appendChild($create('.single-editor')), {
    mode: getPreprocessorMode(style[UCD] ||= TEMPLATE_DATA),
    value: initialCode,
  }, me => {
    const si = editor.applyScrollInfo(me) || {};
    editor.viewTo = si.viewTo;
    Object.assign(me.curOp, si.scroll);
    editor.viewTo = 0;
  });
  /**
   * @param {boolean|string} asObject - string is the code to use
   * @return {Partial<StyleObj> | string}
   */
  const getStyleValue = asObject => !asObject ? cm.getValue() : {
    ...style,
    sourceCode: typeof asObject === 'string' ? asObject : cm.getValue(),
    sections: undefined, [UCD]: undefined,
  };
  const kToc = 'editor.toc.expanded';
  const kWidget = 'editor.appliesToLineWidget';
  const sectionFinder = MozSectionFinder(cm);
  const sectionWidget = MozSectionWidget(cm, sectionFinder);
  const mozSections = editor.sections = sectionFinder.sections;
  const pvErr = $id('preview-error');
  prevSel = cm.doc.sel;
  livePreview._then = showLog;
  livePreview._catch = showError;
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
  updateMeta(/*init=*/true);
  linters.add(metaCompiler);
  onLinterPref.add(updateLinterSwitch);

  /** @namespace Editor */
  Object.assign(editor, {
    cm,
    loading: false,
    replaceStyle,
    updateMeta,
    closestVisible: () => cm,
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
      saving = true;
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
          showLog(res.logs);
          // Awaiting inside `try` so that exceptions go to our `catch`
          await replaceStyle(savedStyle);
        }
        elError?.remove();
      } catch (err) {
        showError(err);
      }
      saving = false;
    },
    scrollToEditor: NOP,
  });

  savedGeneration = cm.changeGeneration();
  cm.on('changes', (_, changes) => {
    dirty.modify('sourceGeneration', savedGeneration, cm.changeGeneration());
    livePreview();
    metaCompiler(changes).then(!linterOn && spoofLinter);
  });
  setTimeout(linterMan.enableForEditor, 0, cm, initialCode, /*force=*/true);
  if (!$isTextInput()) {
    cm.focus();
  }

  function showLog([log, warn]) {
    pvErr.hidden = true;
    if (log) for (const v of log) console.log(v);
    if (warn) for (const v of warn) console.warn(v);
  }

  function updateLinterSwitch() {
    const select = $(`[id="${pEditorLinter}"]`);
    const option = select.$('[value="csslint"]');
    const fancyCss = prevMode !== 'css';
    const ovr = fancyCss && 'stylelint';
    option.disabled = fancyCss;
    option.title = fancyCss ? t('linterCSSLintIncompatible', fancyCss) : '';
    select.value = ovr || curLinter;
    if (ovr) overrideCurLinter(ovr);
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

  function updateMeta(init) {
    $id('name').value = style.customName || style.name;
    $id('enabled').checked = style.enabled;
    $id('url').href = style.url;
    editor.updateName();
    const meta = style[UCD];
    const mode = cm.setPreprocessor(meta);
    if (mode !== prevMode) {
      prevMode = mode;
      if (!init) {
        updateLinterSwitch();
        linterMan.run();
      }
    }
  }

  async function replaceStyle(newStyle, draft) {
    dirty.clear('name');
    const code = newStyle.sourceCode;
    const sameCode = editor.isSame(newStyle);
    if (sameCode) {
      savedGeneration = cm.changeGeneration();
      editor.useSavedStyle(newStyle);
      dirty.clear('sourceGeneration');
      dirty.clear('enabled');
      return livePreview(code);
    }

    if (draft || await messageBox.confirm(t('styleUpdateDiscardChanges'))) {
      newStyle[UCD] ||= await metaCompiler(code, {}, cm, /*force=*/true);
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
      if (!draft)
        dirty.clear();
      if (sameCode) // the code is same but the environment is changed
        await livePreview(code);
    }
  }

  async function saveTemplate() {
    const res = await messageBox.alert(t('usercssReplaceTemplateConfirmation'), {
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

  function showError(err) {
    const pp = style[UCD].preprocessor;
    let pos, line, ch;
    if (typeof err === 'string')
      err = pos = new Error(err);
    pos ||= (err.line ??= err.lineno) && (err.col ??= err.column)
      ? {line: line = err.line - 1, ch: ch = err.col - 1}
      : err.index ?? err.offset;
    let str = err.message || `${err}`;
    if (pos >= 0) {
      // FIXME: this would fail if editors[0].getValue() !== data.sourceCode
      ({line, ch} = pos = cm.posFromIndex(pos));
    } else if (!pos && pp === 'stylus' && (
      pos = str.match(/^\w+:(\d+):(\d+)(?:\n.+)+\s+(.+)/)
    )) {
      str = pos[3];
      line = pos[1] - 1;
      ch = pos[2] - 1;
    }
    if (!pos || saving)
      showUnhandledError(err);
    if (!pos)
      return;
    pvErr.title = str;
    const url = editor.ppDemo[pp];
    pvErr[`${url ? 'set' : 'remove'}Attribute`]('href', url);
    pvErr.hidden = false;
    if (!linterOn) { // the linter can show the error by itself hopefully
      spoofLinter([{
        message: str.replace(/^\d+:\d+\s*/, ''),
        from: pos, to: {line, ch: ch + 1}, severity: 'error',
      }]);
    }
  }

  function spoofLinter(annos) {
    const {options} = cm.state.lint;
    const fnKey = 'getAnnotations';
    const fn = options[fnKey];
    const inOp = cm.curOp || cm.startOperation();
    options[fnKey] = () => annos;
    cm.getValue = NOP;
    cm.performLint();
    options[fnKey] = fn;
    delete cm.getValue;
    if (!inOp) cm.endOperation();
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
