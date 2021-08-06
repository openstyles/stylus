/* global $ $create moveFocus */// dom.js
/* global CodeMirror */
/* global createHotkeyInput helpPopup */// util.js
/* global editor */
/* global prefs */
/* global t */// localization.js
'use strict';

CodeMirror.commands.beautify = cm => {
  // using per-section mode when code editor or applies-to block is focused
  const isPerSection = cm.display.wrapper.parentElement.contains(document.activeElement);
  beautify(isPerSection ? [cm] : editor.getEditors(), false);
};

prefs.subscribe('editor.beautify.hotkey', (key, value) => {
  const {extraKeys} = CodeMirror.defaults;
  for (const [key, cmd] of Object.entries(extraKeys)) {
    if (cmd === 'beautify') {
      delete extraKeys[key];
      break;
    }
  }
  if (value) {
    extraKeys[value] = 'beautify';
  }
}, {runNow: true});

/**
 * @name beautify
 * @param {CodeMirror[]} scope
 * @param {boolean} [ui=true]
 */
async function beautify(scope, ui = true) {
  await require(['/vendor-overwrites/beautify/beautify-css-mod']); /* global css_beautify */
  const tabs = prefs.get('editor.indentWithTabs');
  const options = Object.assign(prefs.defaults['editor.beautify'], prefs.get('editor.beautify'));
  options.indent_size = tabs ? 1 : prefs.get('editor.tabSize');
  options.indent_char = tabs ? '\t' : ' ';
  if (ui) {
    createBeautifyUI(scope, options);
  }
  for (const cm of scope) {
    setTimeout(beautifyEditor, 0, cm, options, ui);
  }
}

function beautifyEditor(cm, options, ui) {
  const pos = options.translate_positions =
    [].concat.apply([], cm.doc.sel.ranges.map(r =>
      [Object.assign({}, r.anchor), Object.assign({}, r.head)]));
  const text = cm.getValue();
  const newText = css_beautify(text, options);
  if (newText !== text) {
    if (!cm.beautifyChange || !cm.beautifyChange[cm.changeGeneration()]) {
      // clear the list if last change wasn't a css-beautify
      cm.beautifyChange = {};
    }
    cm.setValue(newText);
    const selections = [];
    for (let i = 0; i < pos.length; i += 2) {
      selections.push({anchor: pos[i], head: pos[i + 1]});
    }
    const {scrollX, scrollY} = window;
    cm.setSelections(selections);
    window.scrollTo(scrollX, scrollY);
    cm.beautifyChange[cm.changeGeneration()] = true;
    if (ui) {
      $('#help-popup button[role="close"]').disabled = false;
    }
  }
}

function createBeautifyUI(scope, options) {
  helpPopup.show(t('styleBeautify'),
    $create([
      $create('.beautify-options', [
        $createOption('.selector1,', 'selector_separator_newline'),
        $createOption('.selector2', 'newline_before_open_brace'),
        $createOption('{', 'newline_after_open_brace'),
        $createOption('border: none;', 'newline_between_properties', true),
        $createOption('display: block;', 'newline_before_close_brace', true),
        $createOption('}', 'newline_between_rules'),
        $createLabeledCheckbox('preserve_newlines', 'styleBeautifyPreserveNewlines'),
        $createLabeledCheckbox('indent_conditional', 'styleBeautifyIndentConditional'),
      ]),
      $create('p.beautify-hint', [
        $create('span', t('styleBeautifyHint') + '\u00A0'),
        createHotkeyInput('editor.beautify.hotkey', {
          buttons: false,
          onDone: () => moveFocus($('#help-popup'), 0),
        }),
      ]),
      $create('.buttons', [
        $create('button', {
          attributes: {role: 'close'},
          onclick: helpPopup.close,
        }, t('confirmClose')),
        $create('button', {
          attributes: {role: 'undo'},
          onclick() {
            let undoable = false;
            for (const cm of scope) {
              const data = cm.beautifyChange;
              if (!data || !data[cm.changeGeneration()]) continue;
              delete data[cm.changeGeneration()];
              const {scrollX, scrollY} = window;
              cm.undo();
              cm.scrollIntoView(cm.getCursor());
              window.scrollTo(scrollX, scrollY);
              undoable |= data[cm.changeGeneration()];
            }
            this.disabled = !undoable;
          },
        }, t(scope.length === 1 ? 'undo' : 'undoGlobal')),
      ]),
    ]));

  $('#help-popup').className = 'wide';

  $('.beautify-options').onchange = ({target}) => {
    const value = target.type === 'checkbox' ? target.checked : target.selectedIndex > 0;
    prefs.set('editor.beautify', Object.assign(options, {[target.dataset.option]: value}));
    if (target.parentNode.hasAttribute('newline')) {
      target.parentNode.setAttribute('newline', value.toString());
    }
    beautify(scope, false);
  };

  function $createOption(label, optionName, indent) {
    const value = options[optionName];
    return (
      $create('div', {attributes: {newline: value}}, [
        $create('span', indent ? {attributes: {indent: ''}} : {}, label),
        $create('div.select-resizer', [
          $create('select', {dataset: {option: optionName}}, [
            $create('option', {selected: !value}, '\xA0'),
            $create('option', {selected: value}, '\\n'),
          ]),
          $create('SVG:svg.svg-icon.select-arrow', {viewBox: '0 0 1792 1792'}, [
            $create('SVG:path', {
              'fill-rule': 'evenodd',
              'd': 'M1408 704q0 26-19 45l-448 448q-19 19-45 ' +
                   '19t-45-19l-448-448q-19-19-19-45t19-45 45-19h896q26 0 45 19t19 45z',
            }),
          ]),
        ]),
      ])
    );
  }

  function $createLabeledCheckbox(optionName, i18nKey) {
    return (
      $create('label', {style: 'display: block; clear: both;'}, [
        $create('input', {
          type: 'checkbox',
          dataset: {option: optionName},
          checked: options[optionName] !== false,
        }),
        $create('SVG:svg.svg-icon.checked',
          $create('SVG:use', {'xlink:href': '#svg-icon-checked'})),
        t(i18nKey),
      ])
    );
  }
}

/* exported initBeautifyButton */
function initBeautifyButton(btn, scope) {
  btn.onclick = btn.oncontextmenu = e => {
    e.preventDefault();
    beautify(scope || editor.getEditors(), e.type === 'click');
  };
}
