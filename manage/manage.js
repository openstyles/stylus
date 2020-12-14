'use strict';

define(async require => {
  const {API, msg} = require('/js/msg');
  const {
    CHROME,
    VIVALDI,
    debounce,
  } = require('/js/toolbox');
  const t = require('/js/localization');
  const {
    $,
    $$,
    $create,
    animateElement,
    setupLivePrefs,
  } = require('/js/dom');
  const prefs = require('/js/prefs');
  const newUI = require('./new-ui');
  const router = require('/js/router');
  const {
    BULK_THROTTLE_MS,
    bulkChangeQueue,
    containerPromise,
    fitSelectBoxInOpenDetails,
    showStyles,
    switchUI,
  } = require('./render');
  const sorter = require('./sorter');
  const {
    Events,
    handleBulkChange,
    handleVisibilityChange,
  } = require('./events');

  msg.onExtension(onRuntimeMessage);
  router.watch({hash: '#stylus-options'}, toggleEmbeddedOptions);
  window.on('closeOptions', () => router.updateHash(''));

  const query = router.getSearch('search');
  const [styles, ids, container] = await Promise.all([
    API.styles.getAll(),
    query && API.searchDB({query, mode: router.getSearch('searchMode')}),
    containerPromise,
    prefs.initializing,
  ]);

  container.on('click', Events.entryClicked);
  container.on('mouseover', Events.lazyAddEntryTitle, {passive: true});
  container.on('mouseout', Events.lazyAddEntryTitle, {passive: true});
  $('#manage-options-button').onclick = () => router.updateHash('#stylus-options');
  $('#sync-styles').onclick = () => router.updateHash('#stylus-options');
  $$('#header a[href^="http"]').forEach(a => (a.onclick = Events.external));
  document.on('visibilitychange', handleVisibilityChange);

  setupLivePrefs();
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
    fitSelectBoxInOpenDetails($('#filters'));
  }
  if (CHROME >= 80 && CHROME <= 88) {
    // Wrong checkboxes are randomly checked after going back in history, https://crbug.com/1138598
    window.on('pagehide', () => {
      $$('input[type=checkbox]').forEach((el, i) => (el.name = `bug${i}`));
    });
  }

  showStyles(styles, ids);

  require([
    './import-export',
    './incremental-search',
  ]);

  function onRuntimeMessage(msg) {
    switch (msg.method) {
      case 'styleUpdated':
      case 'styleAdded':
      case 'styleDeleted':
        bulkChangeQueue.push(msg);
        if (performance.now() - (bulkChangeQueue.time || 0) < BULK_THROTTLE_MS) {
          debounce(handleBulkChange, BULK_THROTTLE_MS);
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
});
