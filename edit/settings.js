/* global $ $create moveFocus setupLivePrefs */// dom.js
/* global API */// msg.js
/* global CodeMirror */
/* global CODEMIRROR_THEMES */
/* global editor */
/* global helpPopup createHotkeyInput */// util.js
/* global linterMan */
/* global prefs */
/* global t */// localization.js
/* global debounce tryURL */// toolbox.js
'use strict';

/* exported StyleSettings */
async function StyleSettings(btnOpen) {
  const AUTOSAVE_DELAY = 500; // same as config-dialog.js
  const SS_ID = 'styleSettings';
  const PASS = val => val;
  await t.fetchTemplate('/edit/settings.html', SS_ID);
  let ui = t.template[SS_ID].cloneNode(true);
  const {style} = editor;
  const elForm = $('.settings', ui);
  const elAuto = $('#config\\.autosave', ui);
  const elSave = $('#ss-save', ui);
  const elUpd = $('#ss-updatable', ui);
  const textWidths = {};
  const pendingSetters = new Map();
  const updaters = [
    initCheckbox(elUpd, 'updatable', tryURL(style.updateUrl).href),
    initInput('#ss-update-url', 'updateUrl', '', {
      validate(el) {
        elUpd.disabled = !el.value || !el.validity.valid;
        return el.validity.valid;
      },
    }),
    initRadio('ss-scheme', 'preferScheme', 'none'),
    initArea('inclusions'),
    initArea('exclusions'),
  ];
  update();
  prefs.subscribe('schemeSwitcher.enabled', (_, val) => {
    $('#ss-scheme-off', ui).hidden = val !== 'never';
  }, true);
  window.on(SS_ID, update);
  ui = helpPopup.show(true, ui);
  ui.dataset.type = 'settings';
  ui.onClose.add(() => {
    btnOpen.disabled = false;
    window.off(SS_ID, update);
  });
  elSave.onclick = save;
  $('#ss-close', ui).onclick = helpPopup.close;
  setupLivePrefs(ui);
  EditorSettings(ui);
  moveFocus(ui, 0);

  function autosave(el, setter) {
    pendingSetters.set(el, setter);
    helpPopup.div.classList.add('dirty');
    elSave.disabled = false;
    if (elAuto.checked) debounce(save, AUTOSAVE_DELAY);
  }

  function initArea(type) {
    return initInput(`#ss-${type}`, type, [], {
      get: textToList,
      set: list => list.join('\n'),
      validate(el) {
        const val = el.value;
        el.rows = val.match(/^/gm).length + !val.endsWith('\n');
        requestAnimationFrame(() => {
          textWidths[type] = (el.scrollWidth | 0x7F) + 2;
          elForm.style.width = Math.max(...Object.values(textWidths)) + 'px';
        });
      },
    });
  }

  function initCheckbox(el, key, defVal) {
    return initInput(el, key, Boolean(defVal), {dom: 'checked'});
  }

  function initInput(el, key, defVal, {
    dom = 'value', // DOM property name
    get = PASS, // transformer function(val) after getting DOM value
    set = PASS, // transformer function(val) before setting DOM value
    validate = PASS, // function(el) - return `false` to prevent saving
  } = {}) {
    if (typeof el === 'string') {
      el = $(el, ui);
    }
    el.oninput = () => {
      if (validate(el) !== false) {
        autosave(el, {dom, get, key});
      }
    };
    return () => {
      let val = style[key];
      val = set(val != null ? val : defVal);
      // Skipping if unchanged to preserve the Undo history of the input
      if (el[dom] !== val) {
        el[dom] = val;
        validate(el);
      }
    };
  }

  function initRadio(name, key, defVal) {
    $(`#${name}`, ui).oninput = e => {
      if (e.target.checked) {
        autosave(e.target, {key});
      }
    };
    return () => {
      const val = style[key] || defVal;
      const el = $(`[name="${name}"][value="${val}"]`, ui);
      el.checked = true;
    };
  }

  function save() {
    pendingSetters.forEach(saveValue);
    pendingSetters.clear();
    helpPopup.div.classList.remove('dirty');
    elSave.disabled = true;
  }

  function saveValue({dom = 'value', get = PASS, key}, el) {
    return API.styles.config(style.id, key, get(el[dom]));
  }

  function textToList(text) {
    return text.split(/\n/).map(s => s.trim()).filter(Boolean);
  }

  function update() {
    updaters.forEach(fn => fn());
  }
}

function EditorSettings() {
  prefs.subscribe('editor.linter', editor.updateLinterSwitch, true);

  //#region Keymap
  // move 'pc' or 'mac' prefix to the end of the displayed label
  const maps = Object.keys(CodeMirror.keyMap)
    .map(name => ({
      value: name,
      name: name.replace(/^(pc|mac)(.+)/, (s, arch, baseName) =>
        baseName.toLowerCase() + '-' + (arch === 'mac' ? 'Mac' : 'PC')),
    }))
    .sort((a, b) => a.name < b.name && -1 || a.name > b.name && 1);
  const fragment = document.createDocumentFragment();
  let bin = fragment;
  let groupName;
  // group suffixed maps in <optgroup>
  maps.forEach(({value, name}, i) => {
    groupName = !name.includes('-') ? name : groupName;
    const groupWithNext = maps[i + 1] && maps[i + 1].name.startsWith(groupName);
    if (groupWithNext) {
      if (bin === fragment) {
        bin = fragment.appendChild($create('optgroup', {label: name.split('-')[0]}));
      }
    }
    const el = bin.appendChild($create('option', {value}, name));
    if (value === prefs.defaults['editor.keyMap']) {
      el.dataset.default = '';
      el.title = t('defaultTheme');
    }
    if (!groupWithNext) bin = fragment;
  });
  const selector = $('#editor.keyMap');
  selector.textContent = '';
  selector.appendChild(fragment);
  selector.value = prefs.get('editor.keyMap');
  //#endregion

  //#region Theme
  $('#editor.theme').append(...[
    $create('option', {value: 'default'}, t('defaultTheme')),
    ...Object.keys(CODEMIRROR_THEMES).map(s => $create('option', s)),
  ]);
  //#endregion

  //#region Buttons
  $('#colorpicker-settings').onclick = function (event) {
    event.preventDefault();
    const bounds = this.getBoundingClientRect();
    const input = createHotkeyInput('editor.colorpicker.hotkey', {onDone: () => helpPopup.close()});
    const popup = helpPopup.show(t('helpKeyMapHotkey'), input);
    popup.style.top = bounds.bottom + 'px';
    $('input', popup).focus();
  };
  $('#keyMap-help').onclick = () => {
    require(['/edit/show-keymap-help'], () => showKeymapHelp()); /* global showKeymapHelp */
  };
  $('#linter-settings').onclick = () => {
    require(['/edit/linter-dialogs'], () => linterMan.showLintConfig());
  };
  //#endregion
}
