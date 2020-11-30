'use strict';

define(require => {
  const {$} = require('/js/dom');
  const t = require('/js/localization');
  const prefs = require('/js/prefs');

  const newUI = {
    enabled: null, // the global option should come first
    favicons: null,
    faviconsGray: null,
    sliders: null,
    targets: null,
  };

  // ...add utility functions
  Object.assign(newUI, {

    ids: Object.keys(newUI),

    prefKeyForId: id =>
      id === 'sliders' ? `ui.${id}` :
        id === 'enabled' ? 'manage.newUI' :
          `manage.newUI.${id}`,

    renderClass: () => {
      const cl = document.documentElement.classList;
      cl.toggle('newUI', newUI.enabled);
      cl.toggle('oldUI', !newUI.enabled);
    },

    tpl: {
      getToggle() {
        return t.template[newUI.sliders ? 'toggleSlider' : 'toggleChecker'].cloneNode(true);
      },
      getEntry() {
        const tpl = t.template[newUI.enabled ? 'styleNewUI' : 'style'].cloneNode(true);
        if (newUI.enabled) {
          const slot = $('toggle', tpl);
          slot.parentElement.replaceChild(newUI.tpl.getToggle(), slot);
        }
        return tpl;
      },
    },
  });

  for (const id of newUI.ids) {
    newUI[id] = prefs.get(newUI.prefKeyForId(id));
  }
  newUI.renderClass();

  return newUI;
});
