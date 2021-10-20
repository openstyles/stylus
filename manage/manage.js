/* global API msg */// msg.js
/* global CHROME VIVALDI debounce */// toolbox.js
/* global Events handleBulkChange handleVisibilityChange */// events.js
/* global fitSelectBoxesIn switchUI showStyles */// render.js
/* global prefs */
/* global router */
/* global sorter */
/* global t */// localization.js
/* global
  $
  $$
  $create
  animateElement
  setupLivePrefs
  waitForSelector
  waitForSheet
*/// dom.js
'use strict';

/** @type {HTMLElement} */
let installed;

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
    const cl = document.documentElement.classList;
    cl.toggle('newUI', newUI.enabled);
    cl.toggle('oldUI', !newUI.enabled);
  },
});
// ...read the actual values
for (const id of newUI.ids) {
  newUI[id] = prefs.get(newUI.prefKeyForId(id));
}
newUI.renderClass();

(async function init() {
  const query = router.getSearch('search');
  const [styles, ids, el] = await Promise.all([
    API.styles.getAll(),
    query && API.styles.searchDB({query, mode: router.getSearch('searchMode')}),
    // needed to avoid flicker due to an extra frame and layout shift
    waitForSelector('#installed'),
    prefs.ready,
  ]);
  installed = el;
  installed.on('click', Events.entryClicked);
  installed.on('mouseover', Events.lazyAddEntryTitle, {passive: true});
  installed.on('mouseout', Events.lazyAddEntryTitle, {passive: true});
  $('#manage-options-button').onclick = () => router.updateHash('#stylus-options');
  $('#sync-styles').onclick = () => router.updateHash('#stylus-options');
  $$('#header a[href^="http"]').forEach(a => (a.onclick = Events.external));
  document.on('visibilitychange', handleVisibilityChange);
  setupLivePrefs();
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

  if (!VIVALDI) {
    waitForSheet().then(() => {
      fitSelectBoxesIn($('#filters'));
    });
  }
  if (CHROME >= 80 && CHROME <= 88) {
    // Wrong checkboxes are randomly checked after going back in history, https://crbug.com/1138598
    window.on('pagehide', () => {
      $$('input[type=checkbox]').forEach((el, i) => (el.name = `bug${i}`));
    });
  }

  showStyles(styles, ids);

  require([
    '/manage/import-export',
    '/manage/incremental-search',
    '/manage/updater-ui',
  ]);
})();

msg.onExtension(onRuntimeMessage);
window.on('closeOptions', () => router.updateHash(''));
router.watch({hash: '#stylus-options'}, toggleEmbeddedOptions);

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

async function toggleEmbeddedOptions(state) {
  const el = $('#stylus-embedded-options') ||
    state && document.documentElement.appendChild($create('iframe', {
      id: 'stylus-embedded-options',
      src: '/options.html',
    }));
  if (state) {
    el.focus();
  } else if (el) {
    el.contentDocument.body.classList.add('scaleout');
    await animateElement(el, 'fadeout');
    el.remove();
  }
}
