/* global $ $$ moveFocus setupLivePrefs */// dom.js
/* global API */// msg.js
/* global editor */
/* global helpPopup */// util.js
/* global t */// localization.js
/* global debounce */// toolbox.js
/* exported StyleSettings */
'use strict';

async function StyleSettings() {
  const AUTOSAVE_DELAY = 500; // same as config-dialog.js
  const SS_ID = 'styleSettings';
  await t.fetchTemplate('/edit/settings.html', SS_ID);
  const {style} = editor;
  const ui = t.template[SS_ID].cloneNode(true);
  const elAuto = $('#config\\.autosave', ui);
  const elSave = $('#ss-save', ui);
  const pendingSetters = new Map();
  const updaters = [
    initInput('#ss-update-url', () => style.updateUrl || '',
      val => API.styles.config(style.id, 'updateUrl', val)),
    initRadio('ss-scheme', () => style.preferScheme || 'none',
      val => API.styles.config(style.id, 'preferScheme', val)),
    initArea('inclusions'),
    initArea('exclusions'),
  ];
  update();
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
    const selector = `#ss-${type}`;
    const el = $(selector, ui);
    el.oninput = () => {
      const val = el.value;
      el.rows = val.match(/^/gm).length + !val.endsWith('\n');
    };
    return initInput(selector,
      () => {
        const list = style[type] || [];
        const text = list.join('\n');
        el.rows = (list.length || 1) + 1;
        return text;
      },
      val => API.styles.config(style.id, type, textToList(val))
    );
  }

  function initInput(selector, getter, setter) {
    const el = $(selector, ui);
    el.oninput = () => autosave(el, setter);
    return () => {
      const val = getter();
      // Skipping if unchanged to preserve the Undo history of the input
      if (el.value !== val) el.value = val;
    };
  }

  function initRadio(name, getter, setter) {
    for (const el of $$(`[name="${name}"]`, ui)) {
      el.onchange = () => {
        if (el.checked) autosave(el, setter);
      };
    }
    return () => {
      $(`[name="${name}"][value="${getter()}"]`, ui).checked = true;
    };
  }

  function save() {
    pendingSetters.forEach((fn, el) => fn(el.value));
    pendingSetters.clear();
    helpPopup.div.classList.remove('dirty');
    elSave.disabled = true;
  }

  function textToList(text) {
    return text.split(/\n/).map(s => s.trim()).filter(Boolean);
  }

  function update() {
    updaters.forEach(fn => fn());
  }
}
