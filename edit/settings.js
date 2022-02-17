/* global $ moveFocus setupLivePrefs */// dom.js
/* global API */// msg.js
/* global editor */
/* global helpPopup */// util.js
/* global prefs */
/* global t */// localization.js
/* global debounce tryURL */// toolbox.js
'use strict';

/* exported StyleSettings */
async function StyleSettings() {
  const AUTOSAVE_DELAY = 500; // same as config-dialog.js
  const SS_ID = 'styleSettings';
  const PASS = val => val;
  await t.fetchTemplate('/edit/settings.html', SS_ID);
  const {style} = editor;
  const ui = t.template[SS_ID].cloneNode(true);
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
  }, {runNow: true});
  window.on(SS_ID, update);
  window.on('closeHelp', () => window.off(SS_ID, update), {once: true});
  helpPopup.show(t(SS_ID), ui, {
    className: 'style-settings-popup',
  });
  elSave.onclick = save;
  $('#ss-close', ui).onclick = helpPopup.close;
  setupLivePrefs([elAuto.id]);
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
      if (el[dom] !== val) el[dom] = val;
      validate(el);
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
