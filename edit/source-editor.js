/* global
  $
  $$
  $create
  API
  chromeSync
  cmFactory
  CodeMirror
  createLivePreview
  createMetaCompiler
  debounce
  editor
  linter
  messageBox
  MozSectionFinder
  MozSectionWidget
  prefs
  sectionsToMozFormat
  sessionStore
  t
*/

'use strict';

/* exported SourceEditor */

function SourceEditor() {
  const {style, dirty} = editor;
  let savedGeneration;
  let placeholderName = '';
  let prevMode = NaN;

  $$.remove('.sectioned-only');
  $('#header').on('wheel', headerOnScroll);
  $('#sections').textContent = '';
  $('#sections').appendChild($create('.single-editor'));

  if (!style.id) setupNewStyle(style);

  const cm = cmFactory.create($('.single-editor'));
  const sectionFinder = MozSectionFinder(cm);
  const sectionWidget = MozSectionWidget(cm, sectionFinder, editor.updateToc);
  const livePreview = createLivePreview(preprocess, style.id);
  /** @namespace SourceEditor */
  Object.assign(editor, {
    sections: sectionFinder.sections,
    replaceStyle,
    getEditors: () => [cm],
    scrollToEditor: () => {},
    getEditorTitle: () => '',
    save,
    prevEditor: nextPrevSection.bind(null, -1),
    nextEditor: nextPrevSection.bind(null, 1),
    jumpToEditor(i) {
      const sec = sectionFinder.sections[i];
      if (sec) {
        sectionFinder.updatePositions(sec);
        cm.jumpToPos(sec.start);
      }
    },
    closestVisible: () => cm,
    getSearchableInputs: () => [],
    updateLivePreview,
  });
  createMetaCompiler(cm, meta => {
    style.usercssData = meta;
    style.name = meta.name;
    style.url = meta.homepageURL || style.installationUrl;
    updateMeta();
  });
  updateMeta();
  cm.setValue(style.sourceCode);
  prefs.subscribeMany({
    'editor.linter': updateLinterSwitch,
    'editor.appliesToLineWidget': (k, val) => sectionWidget.toggle(val),
    'editor.toc.expanded': (k, val) => sectionFinder.onOff(editor.updateToc, val),
  }, {now: true});
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
    linter.run();
    updateLinterSwitch();
  });
  setTimeout(linter.enableForEditor, 0, cm);
  if (!$.isTextInput(document.activeElement)) {
    cm.focus();
  }

  function preprocess(style) {
    return API.buildUsercss({
      styleId: style.id,
      sourceCode: style.sourceCode,
      assignVars: true,
    })
      .then(({style: newStyle}) => {
        delete newStyle.enabled;
        return Object.assign(style, newStyle);
      });
  }

  function updateLivePreview() {
    if (!style.id) {
      return;
    }
    livePreview.update(Object.assign({}, style, {sourceCode: cm.getValue()}));
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

  async function setupNewStyle(style) {
    style.sections[0].code = ' '.repeat(prefs.get('editor.tabSize')) +
      `/* ${t('usercssReplaceTemplateSectionBody')} */`;
    let section = sectionsToMozFormat(style);
    if (!section.includes('@-moz-document')) {
      style.sections[0].domains = ['example.com'];
      section = sectionsToMozFormat(style);
    }
    const DEFAULT_CODE = `
      /* ==UserStyle==
      @name           ${''/* a trick to preserve the trailing spaces */}
      @namespace      github.com/openstyles/stylus
      @version        1.0.0
      @description    A new userstyle
      @author         Me
      ==/UserStyle== */
    `.replace(/^\s+/gm, '');

    dirty.clear('sourceGeneration');
    style.sourceCode = '';

    placeholderName = `${style.name || t('usercssReplaceTemplateName')} - ${new Date().toLocaleString()}`;
    let code = await chromeSync.getLZValue(chromeSync.LZ_KEY.usercssTemplate);
    code = code || DEFAULT_CODE;
    code = code.replace(/@name(\s*)(?=[\r\n])/, (str, space) =>
      `${str}${space ? '' : ' '}${placeholderName}`);
    // strip the last dummy section if any, add an empty line followed by the section
    style.sourceCode = code.replace(/\s*@-moz-document[^{]*{[^}]*}\s*$|\s+$/g, '') + '\n\n' + section;
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
    if (name !== placeholderName) {
      $('#name').value = name;
    }
    $('#enabled').checked = style.enabled;
    $('#url').href = style.url;
    editor.updateName();
    cm.setPreprocessor((style.usercssData || {}).preprocessor);
  }

  function replaceStyle(newStyle, codeIsUpdated) {
    dirty.clear('name');
    const sameCode = newStyle.sourceCode === cm.getValue();
    if (sameCode) {
      savedGeneration = cm.changeGeneration();
      dirty.clear('sourceGeneration');
    }
    if (codeIsUpdated === false || sameCode) {
      updateEnvironment();
      dirty.clear('enabled');
      updateLivePreview();
      return;
    }

    Promise.resolve(messageBox.confirm(t('styleUpdateDiscardChanges'))).then(ok => {
      if (!ok) return;
      updateEnvironment();
      if (!sameCode) {
        const cursor = cm.getCursor();
        cm.setValue(style.sourceCode);
        cm.setCursor(cursor);
        savedGeneration = cm.changeGeneration();
      }
      if (sameCode) {
        // the code is same but the environment is changed
        updateLivePreview();
      }
      dirty.clear();
    });

    function updateEnvironment() {
      if (style.id !== newStyle.id) {
        history.replaceState({}, '', `?id=${newStyle.id}`);
      }
      sessionStore.justEditedStyleId = newStyle.id;
      Object.assign(style, newStyle);
      $('#preview-label').classList.remove('hidden');
      updateMeta();
      livePreview.show(Boolean(style.id));
    }
  }

  function save() {
    if (!dirty.isDirty()) return;
    const code = cm.getValue();
    return ensureUniqueStyle(code)
      .then(() => API.editSaveUsercss({
        id: style.id,
        enabled: style.enabled,
        sourceCode: code,
        customName: style.customName,
      }))
      .then(replaceStyle)
      .catch(err => {
        if (err.handled) return;
        const contents = Array.isArray(err) ?
          $create('pre', err.join('\n')) :
          [err.message || String(err)];
        if (Number.isInteger(err.index)) {
          const pos = cm.posFromIndex(err.index);
          const meta = drawLinePointer(pos);

          // save template
          if (err.code === 'missingValue' && meta.includes('@name')) {
            const key = chromeSync.LZ_KEY.usercssTemplate;
            messageBox.confirm(t('usercssReplaceTemplateConfirmation')).then(ok => ok &&
              chromeSync.setLZValue(key, code)
                .then(() => chromeSync.getLZValue(key))
                .then(saved => saved !== code && messageBox.alert(t('syncStorageErrorSaving'))));
            return;
          }
          contents[0] += ` (line ${pos.line + 1} col ${pos.ch + 1})`;
          contents.push($create('pre', meta));
        }
        messageBox.alert(contents, 'pre');
      });
  }

  function ensureUniqueStyle(code) {
    return style.id ? Promise.resolve() :
      API.buildUsercss({
        sourceCode: code,
        checkDup: true,
        metaOnly: true,
      }).then(({dup}) => {
        if (dup) {
          messageBox.alert(t('usercssAvoidOverwriting'), 'danger', t('genericError'));
          return Promise.reject({handled: true});
        }
      });
  }

  function drawLinePointer(pos) {
    const SIZE = 60;
    const line = cm.getLine(pos.line);
    const numTabs = pos.ch + 1 - line.slice(0, pos.ch + 1).replace(/\t/g, '').length;
    const pointer = ' '.repeat(pos.ch) + '^';
    const start = Math.max(Math.min(pos.ch - SIZE / 2, line.length - SIZE), 0);
    const end = Math.min(Math.max(pos.ch + SIZE / 2, SIZE), line.length);
    const leftPad = start !== 0 ? '...' : '';
    const rightPad = end !== line.length ? '...' : '';
    return (
      leftPad +
      line.slice(start, end).replace(/\t/g, ' '.repeat(cm.options.tabSize)) +
      rightPad +
      '\n' +
      ' '.repeat(leftPad.length + numTabs * cm.options.tabSize) +
      pointer.slice(start, end)
    );
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
}
