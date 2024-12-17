import {CodeMirror, THEMES} from '@/cm';
import {$, $create} from '@/js/dom';
import {setupLivePrefs} from '@/js/dom-util';
import {t, template} from '@/js/localization';
import {API} from '@/js/msg';
import * as prefs from '@/js/prefs';
import {debounce, tryURL} from '@/js/util';
import editor from './editor';
import {createHotkeyInput, helpPopup} from './util';
import './settings.css';

// TODO: allow the user to customize which options are always shown
// TODO: decide which options are shown by default
// TODO: show all opts in a helpPopup or a dockable/movable panel

for (const [id, init, tpl] of [
  ['#options', EditorSettings, 'editorSettings'],
  ['#styleOpts', StyleSettings, 'styleSettings'],
]) {
  const el = $(id, template.body);
  const mo = new MutationObserver(() => {
    mo.disconnect();
    el.append($create('main', template[tpl]));
    template[tpl] = undefined;
    init(el);
  });
  mo.observe(el, {attributes: true, attributeFilter: ['open']});
}

function StyleSettings(ui) {
  const AUTOSAVE_DELAY = 500; // same as config-dialog.js
  const PASS = val => val;
  const {style} = editor;
  const elAuto = $('#config\\.autosave', ui);
  const elSave = $('#ss-save', ui);
  const elUpd = $('#ss-updatable', ui);
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
  window.on('styleSettings', update);
  elSave.onclick = save;
  setupLivePrefs(ui);

  function autosave(el, setter) {
    pendingSetters.set(el, setter);
    ui.classList.add('dirty');
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
    ui.classList.remove('dirty');
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

function EditorSettings(ui) {
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
  const selector = $('#editor\\.keyMap', ui);
  selector.textContent = '';
  selector.appendChild(fragment);

  $('#editor\\.theme', ui).append(...[
    $create('option', {value: 'default'}, t('defaultTheme')),
    ...Object.keys(THEMES).map(s => $create('option', s)),
  ]);

  $('#colorpicker-settings', ui).onclick = function (event) {
    event.preventDefault();
    const bounds = this.getBoundingClientRect();
    const input = createHotkeyInput('editor.colorpicker.hotkey', {onDone: helpPopup.close});
    const popup = helpPopup.show(t('helpKeyMapHotkey'), input);
    popup.style = `top: ${bounds.bottom}px; left: ${bounds.left}px; right: auto;`;
    $('input', popup).focus();
  };

  setupLivePrefs(ui);
  prefs.subscribe('editor.linter', editor.updateLinterSwitch, true);
}
