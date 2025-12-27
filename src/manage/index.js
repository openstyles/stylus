import '@/js/dom-init';
import {kSidebar} from '@/js/consts';
import {$create, $toggleDataset, isSidebar} from '@/js/dom';
import {animateElement, setupLiveDetails, setupLivePrefs} from '@/js/dom-util';
import {onMessage} from '@/js/msg';
import * as prefs from '@/js/prefs';
import * as syncUtil from '@/js/sync-util';
import {CHROME} from '@/js/ua';
import {favicon} from '@/js/urls';
import {t} from '@/js/util';
import InjectionOrder from './injection-order';
import {showStyles} from './render';
import * as router from './router';
import * as sorter from './sorter';
import UpdateHistory from './updater-ui';
import {UI} from './util';
import './events';
import './incremental-search';
import './manage.css';
import './manage-table.css';
import '@/css/target-site.css';

(async () => {
  const data = __.MV3 ? prefs.clientData : await prefs.clientData;
  const selectorOpts = '#manage-options-button, #sync-styles';
  setupLiveDetails();
  setupLivePrefs();
  UI.render(true);
  sorter.init();
  if (isSidebar) {
    for (const el of $$(selectorOpts))
      el.on('click', () => location.assign(`/options.html?${kSidebar}#${el.id}`));
  } else {
    router.makeToggle(selectorOpts, 'stylus-options', EmbeddedOptions);
  }
  router.makeToggle('#injection-order-button', 'injection-order', InjectionOrder);
  router.makeToggle('#update-history-button', 'update-history', UpdateHistory);
  router.update();
  showStyles(data.styles, data.ids);
  initSyncButton(data.sync);
  if (!__.MV3 && __.BUILD !== 'firefox' && CHROME >= 80 && CHROME <= 88) {
    // Wrong checkboxes are randomly checked after going back in history, https://crbug.com/1138598
    window.on('pagehide', () => {
      $$('input[type=checkbox]').forEach((el, i) => (el.name = `bug${i}`));
    });
  }
  import('./import-export');
})();

// translate CSS manually
document.styleSheets[0].insertRule(
  `:root {${[
    'genericDisabledLabel',
    'updateAllCheckSucceededSomeEdited',
    'filteredStylesAllHidden',
  ].map(id => `--${id}:"${CSS.escape(t(id))}";`).join('')
  }}`);

function initSyncButton(sync) {
  const el = $id('sync-styles');
  const elMsg = $('#backup p');
  const render = val => {
    const driveId = val.drive || prefs.__values['sync.enabled'];
    const drive = syncUtil.DRIVE_NAMES[driveId];
    const hasFav = drive && driveId !== 'webdav';
    const img = el.$('img');
    const msg = drive ? syncUtil.getStatusText(val) : '';
    el.title = t('optionsCustomizeSync');
    el.classList.toggle('icon', !hasFav);
    $toggleDataset(el, 'cloud', drive);
    elMsg.textContent = msg === syncUtil.pending || msg === syncUtil.connected ? '' : msg;
    img.hidden = !hasFav;
    img.src = hasFav ? favicon(driveId + '.com') : '';
    el.$('i').hidden = hasFav;
  };
  onMessage.set(e => {
    if (e.method === 'syncStatusUpdate') render(e.status);
  });
  render(sync);
}

async function EmbeddedOptions(show, el, selector, toggler) {
  document.title = t(show ? 'optionsHeading' : 'styleManager');
  // TODO: use messageBox() or a dockable sidepanel or the chrome.sidePanel API
  if (show) {
    el = $root.appendChild($create('iframe' + selector, {src: '/options.html#' + toggler.id}));
    el.focus();
    await new Promise(resolve => (window.closeOptions = resolve));
  } else {
    el.contentDocument.activeElement?.blur(); // auto-save text input on closing
    await animateElement(el, 'fadeout');
    el.remove();
  }
}
