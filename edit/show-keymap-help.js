/* global CodeMirror showHelp */
'use strict';

onDOMready().then(() => {
  $('#keyMap-help').addEventListener('click', showKeyMapHelp);
});

function showKeyMapHelp() {
  const keyMap = mergeKeyMaps({}, prefs.get('editor.keyMap'), CodeMirror.defaults.extraKeys);
  const keyMapSorted = Object.keys(keyMap)
    .map(key => ({key: key, cmd: keyMap[key]}))
    .concat([{key: 'Shift-Ctrl-Wheel', cmd: 'scrollWindow'}])
    .sort((a, b) => (a.cmd < b.cmd || (a.cmd === b.cmd && a.key < b.key) ? -1 : 1));
  showHelp(t('cm_keyMap') + ': ' + prefs.get('editor.keyMap'),
    '<table class="keymap-list">' +
      '<thead><tr><th><input placeholder="' + t('helpKeyMapHotkey') + '" type="search"></th>' +
        '<th><input placeholder="' + t('helpKeyMapCommand') + '" type="search"></th></tr></thead>' +
      '<tbody>' + keyMapSorted.map(value =>
        '<tr><td>' + value.key + '</td><td>' + value.cmd + '</td></tr>'
      ).join('') +
      '</tbody>' +
    '</table>');

  const table = $('#help-popup table');
  table.addEventListener('input', filterTable);

  const inputs = $$('input', table);
  inputs[0].addEventListener('keydown', hotkeyHandler);
  inputs[1].focus();

  function hotkeyHandler(event) {
    const keyName = CodeMirror.keyName(event);
    if (keyName === 'Esc' || keyName === 'Tab' || keyName === 'Shift-Tab') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // normalize order of modifiers,
    // for modifier-only keys ('Ctrl-Shift') a dummy main key has to be temporarily added
    const keyMap = {};
    keyMap[keyName.replace(/(Shift|Ctrl|Alt|Cmd)$/, '$&-dummy')] = '';
    const normalizedKey = Object.keys(CodeMirror.normalizeKeyMap(keyMap))[0];
    this.value = normalizedKey.replace('-dummy', '');
    filterTable(event);
  }

  function filterTable(event) {
    const input = event.target;
    const col = input.parentNode.cellIndex;
    inputs[1 - col].value = '';
    table.tBodies[0].childNodes.forEach(row => {
      const cell = row.children[col];
      const text = cell.textContent;
      const query = stringAsRegExp(input.value, 'gi');
      const test = query.test(text);
      row.style.display = input.value && test === false ? 'none' : '';
      if (input.value && test) {
        cell.textContent = '';
        let offset = 0;
        text.replace(query, (match, index) => {
          if (index > offset) {
            cell.appendChild(document.createTextNode(text.substring(offset, index)));
          }
          cell.appendChild($element({tag: 'mark', textContent: match}));
          offset = index + match.length;
        });
        if (offset + 1 !== text.length) {
          cell.appendChild(document.createTextNode(text.substring(offset)));
        }
      } else {
        cell.textContent = text;
      }
      // clear highlight from the other column
      const otherCell = row.children[1 - col];
      if (otherCell.children.length) {
        const text = otherCell.textContent;
        otherCell.textContent = text;
      }
    });
  }
  function mergeKeyMaps(merged, ...more) {
    more.forEach(keyMap => {
      if (typeof keyMap === 'string') {
        keyMap = CodeMirror.keyMap[keyMap];
      }
      Object.keys(keyMap).forEach(key => {
        let cmd = keyMap[key];
        // filter out '...', 'attach', etc. (hotkeys start with an uppercase letter)
        if (!merged[key] && !key.match(/^[a-z]/) && cmd !== '...') {
          if (typeof cmd === 'function') {
            // for 'emacs' keymap: provide at least something meaningful (hotkeys and the function body)
            // for 'vim*' keymaps: almost nothing as it doesn't rely on CM keymap mechanism
            cmd = cmd.toString().replace(/^function.*?\{[\s\r\n]*([\s\S]+?)[\s\r\n]*\}$/, '$1');
            merged[key] = cmd.length <= 200 ? cmd : cmd.substr(0, 200) + '...';
          } else {
            merged[key] = cmd;
          }
        }
      });
      if (keyMap.fallthrough) {
        merged = mergeKeyMaps(merged, keyMap.fallthrough);
      }
    });
    return merged;
  }
}
