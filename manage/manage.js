/* global API msg */// msg.js
/* global CHROME UA debounce */// toolbox.js
/* global Events handleBulkChange handleVisibilityChange */// events.js
/* global fitSelectBoxesIn switchUI showStyles */// render.js
/* global prefs */
/* global router */
/* global sorter */
/* global t */// localization.js
/* global $ $$ $create animateElement setupLivePrefs */// dom.js
'use strict';

document.body.appendChild(t.template.body);

const installed = $('#installed');

const changeQueue = [];
changeQueue.THROTTLE = 100; // ms
changeQueue.time = 0;

// define pref-mapped ids separately
const newUI = {
  enabled: null, // the global option should come first
  favicons: null,
  faviconsGray: null,
  targets: null,
};
// ...add utility functions
Object.assign(newUI, {
  ids: Object.keys(newUI),
  prefKeyForId: id => `manage.newUI.${id}`.replace(/\.enabled$/, ''),
  renderClass: () => {
    $.rootCL.toggle('newUI', newUI.enabled);
    $.rootCL.toggle('oldUI', !newUI.enabled);
  },
  hasFavs: () => newUI.enabled && newUI.favicons,
  badFavsKey: 'badFavs',
  async readBadFavs() {
    const key = newUI.badFavsKey;
    const val = await API.prefsDb.get(key);
    return (newUI[key] = Array.isArray(val) ? val : []);
  },
});
// ...read the actual values
for (const id of newUI.ids) {
  newUI[id] = prefs.get(newUI.prefKeyForId(id));
}
newUI.renderClass();

(async function init() {
  const query = router.getSearch('search');
  const [styles, ids] = await Promise.all([
    API.styles.getAll(),
    query && API.styles.searchDB({query, mode: router.getSearch('searchMode')}),
    newUI.hasFavs() && newUI.readBadFavs(),
    prefs.ready,
  ]);
  installed.on('click', Events.entryClicked);
  installed.on('contextmenu', Events.entryClicked);
  installed.on('mouseover', Events.lazyAddEntryTitle, {passive: true});
  installed.on('mouseout', Events.lazyAddEntryTitle, {passive: true});
  $('#sync-styles').onclick =
  $('#manage-options-button').onclick =
    router.makeToggle('stylus-options', toggleEmbeddedOptions);
  $('#injection-order-button').onclick =
    router.makeToggle('injection-order', (...args) => InjectionOrder(...args), [
      '/vendor/draggable-list/draggable-list.iife.min.js',
      '/injection-order/injection-order.css',
      '/injection-order/injection-order', /* global InjectionOrder */
    ]);
  $('#update-history-button').onclick =
    router.makeToggle('update-history', (...args) => showUpdateHistory(...args), [
      '/manage/updater-ui', /* global showUpdateHistory */
    ]);
  $$('#header a[href^="http"]').forEach(a => (a.onclick = Events.external));
  window.on('pageshow', handleVisibilityChange);
  window.on('pagehide', handleVisibilityChange);
  setupLivePrefs();
  sorter.init();
  router.update();
  prefs.subscribe(newUI.ids.map(newUI.prefKeyForId), () => switchUI());
  switchUI({styleOnly: true});
  // translate CSS manually
  document.styleSheets[0].insertRule(
    `:root {${[
      'genericDisabledLabel',
      'updateAllCheckSucceededSomeEdited',
      'filteredStylesAllHidden',
    ].map(id => `--${id}:"${CSS.escape(t(id))}";`).join('')
    }}`);

  if (!UA.vivaldi) {
    fitSelectBoxesIn($('#filters'));
  }
  if (CHROME >= 80 && CHROME <= 88) {
    // Wrong checkboxes are randomly checked after going back in history, https://crbug.com/1138598
    window.on('pagehide', () => {
      $$('input[type=checkbox]').forEach((el, i) => (el.name = `bug${i}`));
    });
  }

  showStyles(styles, ids);

  setTimeout(require, 0, [
    '/manage/import-export',
    '/manage/incremental-search',
    '/manage/updater-ui',
  ]);
})();

msg.onExtension(onRuntimeMessage);

function onRuntimeMessage(msg) {
  switch (msg.method) {
    case 'styleUpdated':
    case 'styleAdded':
    case 'styleDeleted':
      changeQueue.push(msg);
      if (performance.now() - (changeQueue.time || 0) < changeQueue.THROTTLE) {
        debounce(handleBulkChange, changeQueue.THROTTLE);
      } else {
        handleBulkChange();
      }
      break;
    case 'styleApply':
    case 'styleReplaceAll':
      break;
    default:
      return;
  }
  setTimeout(sorter.updateStripes, 0, {onlyWhenColumnsChanged: true});
}

async function toggleEmbeddedOptions(show, el, selector) {
  if (show) {
    $.root.appendChild($create('iframe' + selector, {src: '/options.html'}))
      .focus();
    await new Promise(resolve => window.on('closeOptions', resolve, {once: true}));
  } else {
    el.contentDocument.body.classList.add('scaleout');
    await animateElement(el, 'fadeout');
    el.remove();
  }
}
