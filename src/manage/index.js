import '@/js/dom-init';
import {$toggleDataset} from '@/js/dom';
import {setupLivePrefs} from '@/js/dom-util';
import {tBody} from '@/js/localization';
import {onMessage} from '@/js/msg';
import * as prefs from '@/js/prefs';
import * as syncUtil from '@/js/sync-util';
import {t} from '@/js/util';
import {showStyles} from './render';
import * as router from './router';
import * as sorter from './sorter';
import {UI} from './util';
import './manage.css';
import './manage-table.css';
import '@/css/target-site.css';

tBody();

(async () => {
  const data = __.MV3 ? prefs.clientData : await prefs.clientData;
  setupLivePrefs();
  UI.render(true);
  sorter.init();
  router.update();
  showStyles(data.styles, data.ids);
  initSyncButton(data.sync);
  import('./lazy-init');
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
    const drive = syncUtil.DRIVE_NAMES[val.drive || prefs.__values['sync.enabled']];
    const msg = drive ? syncUtil.getStatusText(val) : '';
    el.title = t('optionsCustomizeSync');
    $toggleDataset(el, 'cloud', drive);
    elMsg.textContent = msg === syncUtil.pending || msg === syncUtil.connected ? '' : msg;
  };
  onMessage.set(e => {
    if (e.method === 'syncStatusUpdate') render(e.status);
  });
  render(sync);
}
