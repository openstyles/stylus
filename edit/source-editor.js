/* global CodeMirror dirtyReporter initLint beautify showKeyMapHelp */
/* global showToggleStyleHelp goBackToManage updateLintReportIfEnabled */
/* global hotkeyRerouter setupAutocomplete */

'use strict';

function createSourceEditor(style) {
  // draw HTML
  $('#sections').innerHTML = '';
  $('#name').disabled = true;
  $('#mozilla-format-heading').parentNode.remove();

  $('#sections').appendChild(tHTML(`
    <div class="single-editor">
      <textarea></textarea>
    </div>
  `));

  // draw CodeMirror
  $('#sections textarea').value = style.source;
  const cm = CodeMirror.fromTextArea($('#sections textarea'));
  // too many functions depend on this global
  editors.push(cm);

  // dirty reporter
  const dirty = dirtyReporter();
  dirty.onChange(() => {
    const DIRTY = dirty.isDirty();
    document.title = (DIRTY ? '* ' : '') + t('editStyleTitle', [style.name]);
    document.body.classList.toggle('dirty', DIRTY);
    $('#save-button').disabled = !DIRTY;
  });

  // draw metas info
  updateMetas();
  initHooks();
  initLint();

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
      dirty.modify('source', style.source, value);
      style.source = value;

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

  function updateMetas() {
    $('#name').value = style.name;
    $('#enabled').checked = style.enabled;
    $('#url').href = style.url;
    cm.setOption('mode', style.preprocessor || 'css');
    CodeMirror.autoLoadMode(cm, style.preprocessor || 'css');
    // beautify only works with regular CSS
    $('#beautify').disabled = Boolean(style.preprocessor);
  }

  function replaceStyle(_style) {
    style = _style;
    updateMetas();
    if (style.source !== cm.getValue()) {
      const cursor = cm.getCursor();
      cm.setValue(style.source);
      cm.setCursor(cursor);
    }
    dirty.clear();
  }

  function toggleStyle() {
    const value = !style.enabled;
    dirty.modify('enabled', style.enabled, value);
    style.enabled = value;
    updateMetas();
    // save when toggle enable state?
    save();
  }

  function save() {
    if (!dirty.isDirty()) {
      return;
    }
    const req = {
      method: 'saveUsercss',
      reason: 'editSave',
      id: style.id,
      enabled: style.enabled,
      edited: dirty.has('source'),
      source: style.source
    };
    return onBackgroundReady().then(() => BG.saveUsercss(req))
      .then(result => {
        if (result.status === 'error') {
          throw new Error(result.error);
        }
        return result;
      })
      .then(({style}) => {
        replaceStyle(style);
      })
      .catch(err => {
        console.error(err);
        alert(err);
      });
  }

  return {replaceStyle, save, toggleStyle};
}
