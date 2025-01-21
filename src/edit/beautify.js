import {CodeMirror, extraKeys} from '@/cm';
import {$create} from '@/js/dom';
import {moveFocus} from '@/js/dom-util';
import * as prefs from '@/js/prefs';
import {t} from '@/js/util';
import editor from './editor';
import {createHotkeyInput, helpPopup} from './util';

let cssBeautifyMod;

CodeMirror.commands.beautify = cm => {
  // using per-section mode when code editor or applies-to block is focused
  const isPerSection = cm.display.wrapper.parentElement.contains(document.activeElement);
  beautify(isPerSection ? [cm] : editor.getEditors(), false);
};

prefs.subscribe('editor.beautify.hotkey', (_key, value) => {
  for (const [key, cmd] of Object.entries(extraKeys)) {
    if (cmd === 'beautify') {
      delete extraKeys[key];
      break;
    }
  }
  if (value) {
    extraKeys[value] = 'beautify';
  }
}, true);

/**
 * @param {CodeMirror[]} scope
 * @param {?} [ui]
 */
async function beautify(scope, ui = true) {
  if (!cssBeautifyMod) {
    cssBeautifyMod = (await import('@/vendor-overwrites/beautify/beautify-css-mod')).default;
  }
  const tabs = prefs.__values['editor.indentWithTabs'];
  const options = Object.assign(prefs.defaults['editor.beautify'],
    prefs.__values['editor.beautify']);
  options.indent_size = tabs ? 1 : prefs.__values['editor.tabSize'];
  options.indent_char = tabs ? '\t' : ' ';
  if (ui) {
    ui = createBeautifyUI(scope, options);
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
  const newText = cssBeautifyMod(text, options);
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
      ui.$('button[role="close"]').disabled = false;
    }
  }
}

function createBeautifyUI(scope, options) {
  const popup = helpPopup.show(t('styleBeautify'),
    $create('div', [
      $create('.beautify-options', [
        $createOption('.selector1,', 'selector_separator_newline'),
        $createOption('.selector2', 'newline_before_open_brace'),
        $createOption('{', 'newline_after_open_brace'),
        $createOption('border: none;', 'newline_between_properties', true),
        $createOption('display: block;', 'newline_before_close_brace', true),
        $createOption('}', 'newline_between_rules'),
        $createLabeledCheckbox('space_around_combinator', '', 'selector + selector',
          'selector+selector'),
        $createLabeledCheckbox('space_around_cmp', '', '[attribute = "1"]', '[attribute="1"]'),
        $createLabeledCheckbox('preserve_newlines', 'styleBeautifyPreserveNewlines'),
        $createLabeledCheckbox('indent_conditional', 'styleBeautifyIndentConditional'),
        editor.isUsercss && $createLabeledCheckbox('indent_mozdoc', '', '... @-moz-document'),
      ].filter(Boolean)),
      $create('p.beautify-hint', [
        $create('span', t('styleBeautifyHint') + '\u00A0'),
        createHotkeyInput('editor.beautify.hotkey', {
          buttons: false,
          onDone: () => moveFocus(popup, 0),
        }),
      ]),
      $create('.buttons', [
        $create('button[role=close]', {onclick: helpPopup.close}, t('confirmClose')),
        $create('button[role=undo]', {
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
    ]),
    {
      className: 'wide',
    });

  $('.beautify-options').onchange = ({target}) => {
    const value = target.type === 'checkbox' ? target.checked : target.selectedIndex > 0;
    const elLine = target.closest('[newline]');
    if (elLine) elLine.setAttribute('newline', value);
    else if (target._) target._.node.textContent = target._[value ? 'text' : 'textOff'];
    options[target.dataset.option] = value;
    prefs.set('editor.beautify', Object.assign({}, options, {translate_positions: undefined}));
    beautify(scope, false);
  };

  return popup;

  function $createOption(label, optionName, indent) {
    const value = options[optionName];
    return (
      $create(`div[newline=${value}]`, [
        $create('span' + (indent ? '[indent]' : ''), label),
        $create('div.select-wrapper', [
          $create(`select[data-option=${optionName}]`, [
            $create('option', {selected: !value}, '\xA0'),
            $create('option', {selected: value}, '\\n'),
          ]),
        ]),
      ])
    );
  }

  function $createLabeledCheckbox(optionName, i18nKey, text, textOff) {
    const checked = options[optionName] !== false;
    const textNode = textOff && document.createTextNode(checked ? text : textOff);
    return (
      $create('label', {style: 'display: block; clear: both;'}, [
        $create(`input[data-option=${optionName}]`, {
          type: 'checkbox',
          _: textOff && {node: textNode, text, textOff},
          checked,
        }),
        i18nKey ? t(i18nKey) : textNode || text,
      ])
    );
  }
}

export function initBeautifyButton(btn, scope) {
  btn.onclick = btn.oncontextmenu = e => {
    e.preventDefault();
    beautify(scope || editor.getEditors(), e.type === 'click');
  };
}
