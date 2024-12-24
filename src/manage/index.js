import '@/js/dom-init';
import {$} from '@/js/dom';
import {setupLivePrefs} from '@/js/dom-util';
import {tBody} from '@/js/localization';
import {onExtension} from '@/js/msg';
import * as prefs from '@/js/prefs';
import * as syncUtil from '@/js/sync-util';
import {t} from '@/js/util';
import {readBadFavs, showStyles} from './render';
import * as router from './router';
import * as sorter from './sorter';
import {newUI} from './util';
import './manage.css';
import './manage-newui.css';

tBody();

(async () => {
  const {badFavs, ids, styles, sync} = __.MV3 ? prefs.clientData : await prefs.clientData;
  const rerenderNewUI = () => newUI.render();
  setupLivePrefs();
  newUI.render(true);
  prefs.subscribe(newUI.ids.map(newUI.prefKeyForId), rerenderNewUI);
  sorter.init();
  router.update();
  if (newUI.hasFavs()) readBadFavs(badFavs);
  showStyles(styles, ids);
  renderSyncStatus(sync);
  onExtension(e => { // returning `undefined` by default to avoid breaking bg::onRuntimeMessage
    if (e.method === 'syncStatusUpdate') renderSyncStatus(e.status);
  });
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

function renderSyncStatus(val) {
  const drive = syncUtil.DRIVE_NAMES[val.drive || prefs.__values['sync.enabled']];
  const msg = drive ? syncUtil.getStatusText(val) : '';
  $('#sync-styles').textContent = drive ? t('syncCloud', drive) : t('optionsCustomizeSync');
  $('#backup p').textContent = msg === syncUtil.pending ? '' : msg;
}
