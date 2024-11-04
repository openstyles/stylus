import {CodeMirror, extraKeys} from '/cm';
import {$, $$} from '/js/dom';
import {setInputValue, setupLivePrefs} from '/js/dom-util';
import {t} from '/js/localization';
import * as prefs from '/js/prefs';
import {sleep} from '/js/util';
import {initBeautifyButton} from './beautify';
import editor from './editor';

export default function EditorHeader() {
  initBeautifyButton($('#beautify'));
  initNameArea();
  setupLivePrefs();
  window.on('load', () => {
    prefs.subscribe('editor.keyMap', showHotkeyInTooltip, true);
    window.on('showHotkeyInTooltip', showHotkeyInTooltip);
  }, {once: true});
  for (const el of $$('#header details')) {
    el.on('contextmenu', peekDetails);
  }
}

function findKeyForCommand(command, map) {
  if (typeof map === 'string') map = CodeMirror.keyMap[map];
  let key = Object.keys(map).find(k => map[k] === command);
  if (key) {
    return key;
  }
  for (const ft of Array.isArray(map.fallthrough) ? map.fallthrough : [map.fallthrough]) {
    key = ft && findKeyForCommand(command, ft);
    if (key) {
      return key;
    }
  }
  return '';
}

function initNameArea() {
  const nameEl = $('#name');
  const resetEl = $('#reset-name');
  const isCustomName = editor.style.updateUrl || editor.isUsercss;
  editor.nameTarget = isCustomName ? 'customName' : 'name';
  nameEl.placeholder = t(editor.isUsercss ? 'usercssEditorNamePlaceholder' : 'styleMissingName');
  nameEl.title = isCustomName ? t('customNameHint') : '';
  nameEl.on('input', () => {
    editor.updateName(true);
    resetEl.hidden = !editor.style.customName;
  });
  resetEl.hidden = !editor.style.customName;
  resetEl.onclick = () => {
    setInputValue(nameEl, editor.style.name);
    editor.style.customName = null; // to delete it from db
    resetEl.hidden = true;
  };
  const enabledEl = $('#enabled');
  enabledEl.onchange = () => editor.updateEnabledness(enabledEl.checked);
}

async function peekDetails(evt) {
  evt.preventDefault();
  this.open = true;
  while (this.matches(':hover, :active')) {
    await sleep(500);
    await new Promise(cb => this.on('mouseleave', cb, {once: true}));
  }
  this.open = false;
}

function showHotkeyInTooltip(_, mapName = prefs.get('editor.keyMap')) {
  for (const el of $$('[data-hotkey-tooltip]')) {
    if (el._hotkeyTooltipKeyMap !== mapName) {
      el._hotkeyTooltipKeyMap = mapName;
      const title = el._hotkeyTooltipTitle = el._hotkeyTooltipTitle || el.title;
      const cmd = el.dataset.hotkeyTooltip;
      const key = cmd[0] === '=' ? cmd.slice(1) :
        findKeyForCommand(cmd, mapName) ||
        findKeyForCommand(cmd, extraKeys);
      const newTitle = title + (title && key ? '\n' : '') + (key || '');
      if (el.title !== newTitle) el.title = newTitle;
    }
  }
}
