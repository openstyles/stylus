/* global $ $$remove $create $isTextInput messageBoxProxy */// dom.js
/* global API */// msg.js
/* global CodeMirror */
/* global MozDocMapper */// util.js
/* global MozSectionFinder */
/* global MozSectionWidget */
/* global RX_META debounce */// toolbox.js
/* global chromeSync */// storage-util.js
/* global cmFactory */
/* global editor */
/* global linterMan */
/* global prefs */
/* global t */// localization.js
'use strict';

/* exported SourceEditor */
async function SourceEditor() {
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

  $$remove('.sectioned-only');
  $('#header').on('wheel', headerOnScroll);
  $('#sections').textContent = '';
  $('#sections').appendChild($create('.single-editor'));
  $('#save-button').on('split-btn', saveTemplate);

  const cm = cmFactory.create($('.single-editor'));
  const sectionFinder = MozSectionFinder(cm);
  const sectionWidget = MozSectionWidget(cm, sectionFinder);
  editor.livePreview.init(preprocess);
  if (!style.id) setupNewStyle(await editor.template);
  createMetaCompiler(meta => {
    style.usercssData = meta;
    style.name = meta.name;
    style.url = meta.homepageURL || style.installationUrl;
    updateMeta();
  });
  updateMeta();
  cm.setValue(style.sourceCode);

  /** @namespace Editor */
  Object.assign(editor, {
    sections: sectionFinder.sections,
    replaceStyle,
    updateLivePreview,
    updateMeta,
    closestVisible: () => cm,
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
      try {
        const {customName, enabled, id} = style;
        let res = !id && await API.usercss.build({sourceCode, checkDup: true, metaOnly: true});
        if (res && res.dup) {
          messageBoxProxy.alert(t('usercssAvoidOverwriting'), 'danger', t('genericError'));
        } else {
          res = await API.usercss.editSave({customName, enabled, id, sourceCode});
          // Awaiting inside `try` so that exceptions go to our `catch`
          await replaceStyle(res.style);
        }
        showLog(res);
      } catch (err) {
        showSaveError(err);
      }
    },
    scrollToEditor: () => {},
  });

  prefs.subscribeMany({
    'editor.linter': updateLinterSwitch,
    'editor.appliesToLineWidget': (k, val) => sectionWidget.toggle(val),
    'editor.toc.expanded': (k, val) => sectionFinder.onOff(editor.updateToc, val),
  }, {runNow: true});

  editor.applyScrollInfo(cm);
  cm.clearHistory();
  cm.markClean();
  savedGeneration = cm.changeGeneration();
  cm.on('changes', () => {
    dirty.modify('sourceGeneration', savedGeneration, cm.changeGeneration());
    debounce(updateLivePreview, editor.previewDelay);
  });
  cm.on('optionChange', (cm, option) => {
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

  async function preprocess(style) {
    const res = await API.usercss.build({
      styleId: style.id,
      sourceCode: style.sourceCode,
      assignVars: true,
    });
    showLog(res);
    delete res.style.enabled;
    return Object.assign(style, res.style);
  }

  /** Shows the console.log output from the background worker stored in `log` property */
  function showLog(data) {
    if (data.log) data.log.forEach(args => console.log(...args));
    return data;
  }

  function updateLivePreview() {
    if (!style.id) {
      return;
    }
    editor.livePreview.update(Object.assign({}, style, {sourceCode: cm.getValue()}));
  }

  function updateLinterSwitch() {
    const el = $('#editor.linter');
    el.value = getCurrentLinter();
    const cssLintOption = $('[value="csslint"]', el);
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
    const name = prefs.get('editor.linter');
    if (cm.getOption('mode') !== 'css' && name === 'csslint') {
      return 'stylelint';
    }
    return name;
  }

  function setupNewStyle(tpl) {
    const comment = `/* ${t('usercssReplaceTemplateSectionBody')} */`;
    const sec0 = style.sections[0];
    sec0.code = ' '.repeat(prefs.get('editor.tabSize')) + comment;
    if (Object.keys(sec0).length === 1) { // the only key is 'code'
      sec0.domains = ['example.com'];
    }
    style.name = [style.name, new Date().toLocaleString()].filter(Boolean).join(' - ');
    style.sourceCode = (tpl || DEFAULT_TEMPLATE)
      .replace(/(@name)(?:([\t\x20]+).*|\n)/, (_, k, space) => `${k}${space || ' '}${style.name}`)
      .replace(/\s*@-moz-document[^{]*{([^}]*)}\s*$/g, // stripping dummy sections
        (s, body) => body.trim() === comment ? '\n\n' : s)
      .trim() +
      '\n\n' +
      MozDocMapper.styleToCss(style);
    cm.startOperation();
    cm.setValue(style.sourceCode);
    cm.clearHistory();
    cm.markClean();
    cm.endOperation();
    dirty.clear('sourceGeneration');
    savedGeneration = cm.changeGeneration();
  }

  function updateMeta() {
    const name = style.customName || style.name;
    $('#name').value = name;
    $('#enabled').checked = style.enabled;
    $('#url').href = style.url;
    editor.updateName();
    cm.setPreprocessor((style.usercssData || {}).preprocessor);
  }

  async function replaceStyle(newStyle, draft) {
    dirty.clear('name');
    const sameCode = newStyle.sourceCode === cm.getValue();
    if (sameCode) {
      savedGeneration = cm.changeGeneration();
      dirty.clear('sourceGeneration');
      editor.useSavedStyle(newStyle);
      dirty.clear('enabled');
      updateLivePreview();
      return;
    }

    if (draft || await messageBoxProxy.confirm(t('styleUpdateDiscardChanges'))) {
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
    const res = await messageBoxProxy.show({
      contents: t('usercssReplaceTemplateConfirmation'),
      className: 'center',
      buttons: [t('confirmYes'), t('confirmNo'), {
        textContent: t('genericResetLabel'),
        title: t('restoreTemplate'),
      }],
    });
    if (res.enter || res.button !== 1) {
      const key = chromeSync.LZ_KEY.usercssTemplate;
      const code = res.button === 2 ? DEFAULT_TEMPLATE : cm.getValue();
      await chromeSync.setLZValue(key, code);
      if (await chromeSync.getLZValue(key) !== code) {
        messageBoxProxy.alert(t('syncStorageErrorSaving'));
      }
    }
  }

  function showSaveError(err) {
    err = Array.isArray(err) ? err : [err];
    const text = err.map(e => e.message || e).join('\n');
    const points = err.map(e =>
      e.index >= 0 && cm.posFromIndex(e.index) || // usercss meta parser
      e.offset >= 0 && {line: e.line - 1, ch: e.col - 1} // csslint code parser
    ).filter(Boolean);
    cm.setSelections(points.map(p => ({anchor: p, head: p})));
    messageBoxProxy.alert($create('pre', text), 'pre');
  }

  function nextPrevSection(dir) {
    // ensure the data is ready in case the user wants to jump around a lot in a large style
    sectionFinder.keepAliveFor(nextPrevSection, 10e3);
    sectionFinder.updatePositions();
    const {sections} = sectionFinder;
    const num = sections.length;
    if (!num) return;
    dir = dir < 0 ? -1 : 0;
    const pos = cm.getCursor();
    let i = sections.findIndex(sec => CodeMirror.cmpPos(sec.start, pos) > Math.min(dir, 0));
    if (i < 0 && (!dir || CodeMirror.cmpPos(sections[num - 1].start, pos) < 0)) {
      i = 0;
    }
    cm.jumpToPos(sections[(i + dir + num) % num].start);
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
    let meta = null;
    let metaIndex = null;
    let cache = [];
    linterMan.register(async (text, options, _cm) => {
      if (_cm !== cm) {
        return;
      }
      const match = text.match(RX_META);
      if (!match) {
        return [];
      }
      if (match[0] === meta && match.index === metaIndex) {
        return cache;
      }
      const {metadata, errors} = await linterMan.worker.metalint(match[0]);
      if (errors.every(err => err.code === 'unknownMeta')) {
        onUpdated(metadata);
      }
      cache = errors.map(({code, index, args, message}) => {
        const isUnknownMeta = code === 'unknownMeta';
        const typo = isUnknownMeta && args[1] ? 'Typo' : ''; // args[1] may be present but undefined
        return ({
          from: cm.posFromIndex((index || 0) + match.index),
          to: cm.posFromIndex((index || 0) + match.index),
          message: code && t(`meta_${code}${typo}`, args, false) || message,
          severity: isUnknownMeta ? 'warning' : 'error',
          rule: code,
        });
      });
      meta = match[0];
      metaIndex = match.index;
      return cache;
    });
  }
}
