import {$, $$, $create, animateElement, setupLivePrefs} from '/js/dom';
import {t} from '/js/localization';
import {API, onExtension} from '/js/msg';
import * as prefs from '/js/prefs';
import router from '/js/router';
import {CHROME, debounce} from '/js/toolbox';
import {Events, handleBulkChange, handleVisibilityChange} from './events';
import {fltMode} from './filters';
import {showStyles, switchUI} from './render';

t.body();

const installed = $('#installed');

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
  readPrefs(dest = newUI, cb) {
    for (const id of newUI.ids) {
      const val = dest[id] = prefs.get(newUI.prefKeyForId(id));
      if (cb) cb(id, val);
    }
  },
  renderClass: () => {
    const on = !!newUI.enabled;
    const el = $('#newUI');
    $.rootCL.toggle('newUI', on);
    $.rootCL.toggle('oldUI', !on);
    if (on !== !el.media) el.media = on ? '' : '?';
  },
  hasFavs: () => newUI.enabled && newUI.favicons,
  badFavsKey: 'badFavs',
  async readBadFavs() {
    const key = newUI.badFavsKey;
    const val = await API.prefsDb.get(key);
    return (newUI[key] = Array.isArray(val) ? val : []);
  },
});

(async function init() {
  const query = router.getSearch('search');
  const [styles, ids] = await Promise.all([
    API.styles.getAll(),
    query && API.styles.searchDB({query, mode: router.getSearch(fltMode)}),
    newUI.hasFavs() && newUI.readBadFavs(),
    prefs.ready.then(() => {
      newUI.readPrefs();
      newUI.renderClass();
    }),
  ]);
  installed.on('click', Events.entryClicked);
  installed.on('contextmenu', Events.entryClicked);
  installed.on('mouseover', Events.lazyAddEntryTitle, {passive: true});
  installed.on('mouseout', Events.lazyAddEntryTitle, {passive: true});
  $('#sync-styles').onclick =
  $('#manage-options-button').onclick =
    router.makeToggle('stylus-options', toggleEmbeddedOptions);
  $('#injection-order-button').onclick =
    router.makeToggle('injection-order', null,
      () => import('/injection-order'));
  $('#update-history-button').onclick =
    router.makeToggle('update-history', null,
      () => import('./updater-ui'));
  $$('#header a[href^="http"]').forEach(a => (a.onclick = Events.external));
  window.on('pageshow', handleVisibilityChange);
  window.on('pagehide', handleVisibilityChange);
  setupLivePrefs();
  sorter.init();
  router.update();
  prefs.subscribe(newUI.ids.map(newUI.prefKeyForId), () => switchUI());
  prefs.subscribe('newStyleAsUsercss', (key, val) => {
    $('#add-style-label').textContent =
      t(val ? 'optionsAdvancedNewStyleAsUsercss' : 'addStyleLabel');
  }, true);
  switchUI({styleOnly: true});
  // translate CSS manually
  document.styleSheets[0].insertRule(
    `:root {${[
      'genericDisabledLabel',
      'updateAllCheckSucceededSomeEdited',
      'filteredStylesAllHidden',
    ].map(id => `--${id}:"${CSS.escape(t(id))}";`).join('')
    }}`);
  if (CHROME >= 80 && CHROME <= 88) {
    // Wrong checkboxes are randomly checked after going back in history, https://crbug.com/1138598
    window.on('pagehide', () => {
      $$('input[type=checkbox]').forEach((el, i) => (el.name = `bug${i}`));
    });
  }

  showStyles(styles, ids);

  await new Promise(setTimeout);
  import('./import-export');
  import('./incremental-search');
})();

onExtension(onRuntimeMessage);

function onRuntimeMessage(msg) {
  switch (msg.method) {
    case 'styleUpdated':
    case 'styleAdded':
    case 'styleDeleted':
      Events.queue.push(msg);
      if (!Events.queue.time) handleBulkChange(Events.queue);
      else debounce(handleBulkChange, Events.queue.THROTTLE);
  }
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
