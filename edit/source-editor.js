/* global CodeMirror dirtyReporter initLint beautify showKeyMapHelp */
/* global showToggleStyleHelp goBackToManage updateLintReportIfEnabled */
/* global hotkeyRerouter setupAutocomplete setupOptionsExpand */
/* global editors linterConfig updateLinter regExpTester mozParser */
/* global makeLink createAppliesToLineWidget messageBox */
'use strict';

function createSourceEditor(style) {
  // a flag for isTouched()
  let hadBeenSaved = false;

  // draw HTML
  $('#sections').textContent = '';
  $('#name').disabled = true;
  $('#mozilla-format-heading').parentNode.remove();

  $('#sections').appendChild(
    $element({className: 'single-editor', appendChild: [
      $element({tag: 'textarea'})
    ]})
  );

  $('#header').appendChild($element({
    id: 'footer',
    appendChild: makeLink('https://github.com/openstyles/stylus/wiki/Usercss', t('externalUsercssDocument'))
  }));

  setupOptionsExpand();

  // dirty reporter
  const dirty = dirtyReporter();
  dirty.onChange(() => {
    const DIRTY = dirty.isDirty();
    document.body.classList.toggle('dirty', DIRTY);
    $('#save-button').disabled = !DIRTY;
    updateTitle();
  });

  // normalize style
  if (!style.id) {
    setupNewStyle(style);
  } else {
    // style might be an object reference to background page
    style = deepCopy(style);
  }

  // draw CodeMirror
  $('#sections textarea').value = style.sourceCode;
  const cm = CodeMirror.fromTextArea($('#sections textarea'));
  // too many functions depend on this global
  editors.push(cm);
  cm.focus();

  // draw metas info
  updateMeta();
  initHooks();
  initAppliesToLineWidget();

  // setup linter
  initLint();
  initLinterSwitch();

  function initAppliesToLineWidget() {
    const PREF_NAME = 'editor.appliesToLineWidget';
    const widget = createAppliesToLineWidget(cm);
    const optionEl = buildOption();

    $('#options').insertBefore(optionEl, $('#options > .option.aligned'));
    widget.toggle(prefs.get(PREF_NAME));
    prefs.subscribe([PREF_NAME], (key, value) => {
      widget.toggle(value);
      optionEl.checked = value;
    });
    optionEl.addEventListener('change', e => {
      prefs.set(PREF_NAME, e.target.checked);
    });

    function buildOption() {
      return $element({className: 'option', appendChild: [
        $element({
          tag: 'input',
          type: 'checkbox',
          id: PREF_NAME,
          checked: prefs.get(PREF_NAME)
        }),
        $element({
          tag: 'label',
          htmlFor: PREF_NAME,
          textContent: ' ' + t('appliesLineWidgetLabel'),
          title: t('appliesLineWidgetWarning')
        })
      ]});
    }
  }

  function initLinterSwitch() {
    const linterEl = $('#editor.linter');
    cm.on('optionChange', (cm, option) => {
      if (option !== 'mode') {
        return;
      }
      updateLinter();
      update();
    });
    linterEl.addEventListener('change', update);

    function update() {
      linterEl.value = linterConfig.getDefault();

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

    const sourceCode = `/* ==UserStyle==
@name New Style - ${Date.now()}
@namespace github.com/openstyles/stylus
@version 0.1.0
@description A new userstyle
@author Me
==/UserStyle== */

${section}
`;
    dirty.modify('source', '', sourceCode);
    style.sourceCode = sourceCode;
  }

  function initHooks() {
    // sidebar commands
    $('#save-button').onclick = save;
    $('#beautify').onclick = beautify;
    $('#keyMap-help').onclick = showKeyMapHelp;
    $('#toggle-style-help').onclick = showToggleStyleHelp;
    $('#cancel-button').onclick = goBackToManage;

    // enable
    $('#enabled').onchange = e => {
      const value = e.target.checked;
      dirty.modify('enabled', style.enabled, value);
      style.enabled = value;
    };

    // source
    cm.on('change', () => {
      const value = cm.getValue();
      dirty.modify('source', style.sourceCode, value);
      style.sourceCode = value;

      updateLintReportIfEnabled(cm);
    });

    // hotkeyRerouter
    cm.on('focus', () => {
      hotkeyRerouter.setState(false);
    });
    cm.on('blur', () => {
      hotkeyRerouter.setState(true);
    });

    // autocomplete
    if (prefs.get('editor.autocompleteOnTyping')) {
      setupAutocomplete(cm);
    }
  }

  function updateMeta() {
    $('#name').value = style.name;
    $('#enabled').checked = style.enabled;
    $('#url').href = style.url;
    const {usercssData: {preprocessor} = {}} = style;
    cm.setPreprocessor(preprocessor);
    // beautify only works with regular CSS
    $('#beautify').disabled = cm.getOption('mode') !== 'css';
    updateTitle();
  }

  function updateTitle() {
    // title depends on dirty and style meta
    if (!style.id) {
      document.title = t('addStyleTitle');
    } else {
      document.title = (dirty.isDirty() ? '* ' : '') + t('editStyleTitle', [style.name]);
    }
  }

  function replaceStyle(newStyle) {
    if (!style.id && newStyle.id) {
      history.replaceState({}, '', `?id=${newStyle.id}`);
    }
    style = deepCopy(newStyle);
    updateMeta();
    if (style.sourceCode !== cm.getValue()) {
      const cursor = cm.getCursor();
      cm.setValue(style.sourceCode);
      cm.setCursor(cursor);
    }
    dirty.clear();
    hadBeenSaved = false;
  }

  function setStyleDirty(newStyle) {
    dirty.clear();
    dirty.modify('source', newStyle.sourceCode, style.sourceCode);
    dirty.modify('enabled', newStyle.enabled, style.enabled);
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
    return onBackgroundReady()
      .then(() => BG.usercssHelper.save({
        reason: 'editSave',
        id: style.id,
        enabled: style.enabled,
        sourceCode: style.sourceCode
      }))
      .then(replaceStyle)
      .then(() => {
        hadBeenSaved = true;
      })
      .catch(err => {
        const contents = [String(err)];
        if (Number.isInteger(err.index)) {
          const pos = cm.posFromIndex(err.index);
          contents[0] += ` (line ${pos.line + 1} col ${pos.ch + 1})`;
          contents.push($element({
            tag: 'pre',
            textContent: drawLinePointer(pos)
          }));
        }
        console.error(err);
        messageBox.alert(contents);
      });

    function drawLinePointer(pos) {
      const SIZE = 60;
      const line = cm.getLine(pos.line);
      const pointer = ' '.repeat(pos.ch) + '^';
      const start = Math.max(Math.min(pos.ch - SIZE / 2, line.length - SIZE), 0);
      const end = Math.min(Math.max(pos.ch + SIZE / 2, SIZE), line.length);
      const leftPad = start !== 0 ? '...' : '';
      const rightPad = end !== line.length ? '...' : '';
      return leftPad + line.slice(start, end) + rightPad + '\n' +
        ' '.repeat(leftPad.length) + pointer.slice(start, end);
    }
  }

  function isTouched() {
    // indicate that the editor had been touched by the user
    return dirty.isDirty() || hadBeenSaved;
  }

  function replaceMeta(newStyle) {
    style.enabled = newStyle.enabled;
    dirty.clear('enabled');
    updateMeta();
  }

  return {
    replaceStyle,
    replaceMeta,
    setStyleDirty,
    save,
    toggleStyle,
    isDirty: dirty.isDirty,
    getStyle: () => style,
    isTouched
  };
}
