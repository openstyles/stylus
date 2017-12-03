/*
global CodeMirror loadScript css_beautify
global editors getSectionForChild showHelp
*/
'use strict';

function beautify(event) {
  loadScript('/vendor-overwrites/beautify/beautify-css-mod.js')
    .then(() => {
      if (!window.css_beautify && window.exports) {
        window.css_beautify = window.exports.css_beautify;
      }
    })
    .then(doBeautify);

  function doBeautify() {
    const tabs = prefs.get('editor.indentWithTabs');
    const options = prefs.get('editor.beautify');
    options.indent_size = tabs ? 1 : prefs.get('editor.tabSize');
    options.indent_char = tabs ? '\t' : ' ';

    const section = getSectionForChild(event.target);
    const scope = section ? [section.CodeMirror] : editors;

    showHelp(t('styleBeautify'), '<div class="beautify-options">' +
      optionHtml('.selector1,', 'selector_separator_newline') +
      optionHtml('.selector2,', 'newline_before_open_brace') +
      optionHtml('{', 'newline_after_open_brace') +
      optionHtml('border: none;', 'newline_between_properties', true) +
      optionHtml('display: block;', 'newline_before_close_brace', true) +
      optionHtml('}', 'newline_between_rules') +
      `<label style="display: block; clear: both;"><input data-option="indent_conditional" type="checkbox"
        ${options.indent_conditional !== false ? 'checked' : ''}>` +
        t('styleBeautifyIndentConditional') + '</label>' +
      '</div>' +
      '<div><button role="undo"></button></div>');

    const undoButton = $('#help-popup button[role="undo"]');
    undoButton.textContent = t(scope.length === 1 ? 'undo' : 'undoGlobal');
    undoButton.addEventListener('click', () => {
      let undoable = false;
      scope.forEach(cm => {
        if (cm.beautifyChange && cm.beautifyChange[cm.changeGeneration()]) {
          delete cm.beautifyChange[cm.changeGeneration()];
          cm.undo();
          cm.scrollIntoView(cm.getCursor());
          undoable |= cm.beautifyChange[cm.changeGeneration()];
        }
      });
      undoButton.disabled = !undoable;
    });

    scope.forEach(cm => {
      setTimeout(() => {
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
          cm.setSelections(selections);
          cm.beautifyChange[cm.changeGeneration()] = true;
          undoButton.disabled = false;
        }
      }, 0);
    });

    $('.beautify-options').onchange = ({target}) => {
      const value = target.type === 'checkbox' ? target.checked : target.selectedIndex > 0;
      prefs.set('editor.beautify', Object.assign(options, {[target.dataset.option]: value}));
      if (target.parentNode.hasAttribute('newline')) {
        target.parentNode.setAttribute('newline', value.toString());
      }
      doBeautify();
    };

    function optionHtml(label, optionName, indent) {
      const value = options[optionName];
      return '<div newline="' + value.toString() + '">' +
        '<span' + (indent ? ' indent' : '') + '>' + label + '</span>' +
        '<select data-option="' + optionName + '">' +
          '<option' + (value ? '' : ' selected') + '>&nbsp;</option>' +
          '<option' + (value ? ' selected' : '') + '>\\n</option>' +
        '</select></div>';
    }
  }
}
