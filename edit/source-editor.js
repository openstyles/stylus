/* global CodeMirror dirtyReporter initLint */
/* global showToggleStyleHelp goBackToManage updateLintReportIfEnabled */
/* global editors linterConfig updateLinter regExpTester mozParser */
/* global createAppliesToLineWidget messageBox */
'use strict';

function createSourceEditor(style) {
  // a flag for isTouched()
  let hadBeenSaved = false;
  let savedGeneration = 0;

  $('#name').disabled = true;
  $('#save-button').disabled = true;
  $('#mozilla-format-container').remove();
  $('#sections').textContent = '';
  $('#sections').appendChild($create('.single-editor'));

  const dirty = dirtyReporter();
  dirty.onChange(() => {
    document.body.classList.toggle('dirty', dirty.isDirty());
    $('#save-button').disabled = !dirty.isDirty();
    updateTitle();
  });

  // normalize style
  if (!style.id) {
    setupNewStyle(style);
  } else {
    // style might be an object reference to background page
    style = deepCopy(style);
  }

  const cm = CodeMirror($('.single-editor'), {value: style.sourceCode});
  editors.push(cm);
  savedGeneration = cm.changeGeneration();

  cm.operation(initAppliesToLineWidget);
  updateMeta().then(() => {
    initLint();
    initLinterSwitch();
    initHooks();
    setTimeout(() => {
      if ((document.activeElement || {}).localName !== 'input') {
        cm.focus();
      }
    });
  });

  function initAppliesToLineWidget() {
    const PREF_NAME = 'editor.appliesToLineWidget';
    const widget = createAppliesToLineWidget(cm);
    widget.toggle(prefs.get(PREF_NAME));
    prefs.subscribe([PREF_NAME], (key, value) => widget.toggle(value));
  }

  function initLinterSwitch() {
    const linterEl = $('#editor.linter');
    let prevMode = NaN;
    cm.on('optionChange', (cm, option) => {
      if (option !== 'mode') {
        return;
      }
      const mode = cm.doc.mode;
      if (mode === prevMode || mode && mode.name === prevMode) {
        return;
      }
      prevMode = mode;
      updateLinter();
      update();
    });
    linterEl.addEventListener('change', update);
    update();

    function update() {
      linterEl.value = linterConfig.getName();

      const cssLintOption = linterEl.querySelector('[value="csslint"]');
      if (cm.getOption('mode') !== 'css') {
        cssLintOption.disabled = true;
        cssLintOption.title = t('linterCSSLintIncompatible', cm.getOption('mode'));
      } else {
        cssLintOption.disabled = false;
        cssLintOption.title = '';
      }
    }
  }

  function setupNewStyle(style) {
    style.sections[0].code = ' '.repeat(prefs.get('editor.tabSize')) + '/* Insert code here... */';
    let section = mozParser.format(style);
    if (!section.includes('@-moz-document')) {
      style.sections[0].domains = ['example.com'];
      section = mozParser.format(style);
    }

    const DEFAULT_CODE = `
      /* ==UserStyle==
      @name           ${t('usercssReplaceTemplateName') + ' - ' + new Date().toLocaleString()}
      @namespace      github.com/openstyles/stylus
      @version        0.1.0
      @description    A new userstyle
      @author         Me
      ==/UserStyle== */
      
      ${section}
    `.replace(/^\s+/gm, '');
    dirty.clear('sourceGeneration');
    style.sourceCode = '';
    chromeSync.getLZValue('usercssTemplate').then(code => {
      style.sourceCode = code || DEFAULT_CODE;
      cm.startOperation();
      cm.setValue(style.sourceCode);
      cm.clearHistory();
      cm.markClean();
      cm.endOperation();
      dirty.clear('sourceGeneration');
      savedGeneration = cm.changeGeneration();
    });
  }

  function initHooks() {
    $('#save-button').onclick = save;
    $('#toggle-style-help').onclick = showToggleStyleHelp;

    $('#enabled').onchange = function () {
      const value = this.checked;
      dirty.modify('enabled', style.enabled, value);
      style.enabled = value;
    };

    $('#header').addEventListener('wheel', headerOnScroll, {passive: true});

    cm.on('changes', () => {
      dirty.modify('sourceGeneration', savedGeneration, cm.changeGeneration());
      updateLintReportIfEnabled(cm);
    });

    cm.on('focus', () => cm.rerouteHotkeys(false));
    cm.on('blur', () => cm.rerouteHotkeys(true));

    CodeMirror.commands.prevEditor = cm => nextPrevMozDocument(cm, -1);
    CodeMirror.commands.nextEditor = cm => nextPrevMozDocument(cm, 1);
    CodeMirror.commands.toggleStyle = toggleStyle;
    CodeMirror.commands.save = save;

    CodeMirror.closestVisible = () => cm;
  }

  function updateMeta() {
    $('#name').value = style.name;
    $('#enabled').checked = style.enabled;
    $('#url').href = style.url;
    const {usercssData: {preprocessor} = {}} = style;
    // beautify only works with regular CSS
    $('#beautify').disabled = cm.getOption('mode') !== 'css';
    updateTitle();
    return cm.setPreprocessor(preprocessor);
  }

  function updateTitle() {
    const newTitle = (dirty.isDirty() ? '* ' : '') +
      (style.id ? t('editStyleTitle', [style.name]) : t('addStyleTitle'));
    if (document.title !== newTitle) {
      document.title = newTitle;
    }
  }

  function replaceStyle(newStyle, codeIsUpdated) {
    const sameCode = newStyle.sourceCode === cm.getValue();
    hadBeenSaved = sameCode;
    if (sameCode) {
      savedGeneration = cm.changeGeneration();
      dirty.clear('sourceGeneration');
    }
    if (codeIsUpdated === false || sameCode) {
      updateEnvironment();
      dirty.clear('enabled');
      return;
    }

    Promise.resolve(messageBox.confirm(t('styleUpdateDiscardChanges'))).then(ok => {
      if (!ok) {
        return;
      }
      updateEnvironment();
      if (!sameCode) {
        const cursor = cm.getCursor();
        cm.setValue(style.sourceCode);
        cm.setCursor(cursor);
        savedGeneration = cm.changeGeneration();
      }
      dirty.clear();
    });

    function updateEnvironment() {
      if (style.id !== newStyle.id) {
        history.replaceState({}, '', `?id=${newStyle.id}`);
      }
      sessionStorage.justEditedStyleId = newStyle.id;
      style = deepCopy(newStyle);
      updateMeta();
    }
  }

  function toggleStyle() {
    const value = !style.enabled;
    dirty.modify('enabled', style.enabled, value);
    style.enabled = value;
    updateMeta();
    // save when toggle enable state?
    save();
  }

  function save() {
    if (!dirty.isDirty()) {
      return;
    }
    const code = cm.getValue();
    return (
      API.saveUsercss({
        reason: 'editSave',
        id: style.id,
        enabled: style.enabled,
        sourceCode: code,
      }))
      .then(replaceStyle)
      .then(() => cm.setOption('mode', cm.doc.mode))
      .catch(err => {
        if (err.message === t('styleMissingMeta', 'name')) {
          messageBox.confirm(t('usercssReplaceTemplateConfirmation')).then(ok => ok &&
            chromeSync.setLZValue('usercssTemplate', code)
              .then(() => chromeSync.getLZValue('usercssTemplate'))
              .then(saved => saved !== code && messageBox.alert(t('syncStorageErrorSaving'))));
          return;
        }
        const contents = Array.isArray(err) ?
          $create('pre', err.join('\n')) :
          [String(err)];
        if (Number.isInteger(err.index)) {
          const pos = cm.posFromIndex(err.index);
          contents[0] += ` (line ${pos.line + 1} col ${pos.ch + 1})`;
          contents.push($create('pre', drawLinePointer(pos)));
        }
        messageBox.alert(contents);
      });

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
  }

  function isTouched() {
    // indicate that the editor had been touched by the user
    return dirty.isDirty() || hadBeenSaved;
  }

  function nextPrevMozDocument(cm, dir) {
    const MOZ_DOC = '@-moz-document';
    const cursor = cm.getCursor();
    const usePrevLine = dir < 0 && cursor.ch <= MOZ_DOC.length;
    let line = cursor.line + (usePrevLine ? -1 : 0);
    let start = usePrevLine ? 1e9 : cursor.ch + (dir > 0 ? 1 : -MOZ_DOC.length);
    let found;
    if (dir > 0) {
      cm.doc.iter(cursor.line, cm.doc.size, goFind);
      if (!found && cursor.line > 0) {
        line = 0;
        cm.doc.iter(0, cursor.line + 1, goFind);
      }
    } else {
      let handle, parentLines;
      let passesRemain = line < cm.doc.size - 1 ? 2 : 1;
      let stopAtLine = 0;
      while (passesRemain--) {
        let indexInParent = 0;
        while (line >= stopAtLine) {
          if (!indexInParent--) {
            handle = cm.getLineHandle(line);
            parentLines = handle.parent.lines;
            indexInParent = parentLines.indexOf(handle);
          } else {
            handle = parentLines[indexInParent];
          }
          if (goFind(handle)) {
            return true;
          }
        }
        line = cm.doc.size - 1;
        stopAtLine = cursor.line;
      }
    }
    function goFind({text}) {
      // use the initial 'start' on cursor row...
      let ch = start;
      // ...and reset it for the rest
      start = dir > 0 ? 0 : 1e9;
      while (true) {
        // indexOf is 1000x faster than toLowerCase().indexOf() so we're trying it first
        ch = dir > 0 ? text.indexOf('@-', ch) : text.lastIndexOf('@-', ch);
        if (ch < 0) {
          line += dir;
          return;
        }
        if (text.substr(ch, MOZ_DOC.length).toLowerCase() === MOZ_DOC &&
            cm.getTokenTypeAt({line, ch: ch + 1}) === 'def') {
          break;
        }
        ch += dir * 3;
      }
      cm.setCursor(line, ch);
      if (cm.cursorCoords().bottom > cm.display.scroller.clientHeight - 100) {
        const margin = Math.min(100, cm.display.scroller.clientHeight / 4);
        line += prefs.get('editor.appliesToLineWidget') ? 1 : 0;
        cm.scrollIntoView({line, ch}, margin);
      }
      found = true;
      return true;
    }
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
      deltaMode === 1 ? deltaY * cm.display.cachedTextHeight :
      // WheelEvent.DOM_DELTA_PAGE
      deltaMode === 2 || shiftKey ? Math.sign(deltaY) * cm.display.scroller.clientHeight :
      // WheelEvent.DOM_DELTA_PIXEL
      deltaY;
  }

  return {
    replaceStyle,
    save,
    toggleStyle,
    isDirty: dirty.isDirty,
    getStyle: () => style,
    isTouched
  };
}
