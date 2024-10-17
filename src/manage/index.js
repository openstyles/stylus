import {$, $$, setupLivePrefs} from '/js/dom';
import {t, tBody} from '/js/localization';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import * as router from '/js/router';
import {CHROME} from '/js/toolbox';
import {fltMode} from './filters';
import {readBadFavs, showStyles} from './render';
import * as sorter from './sorter';
import {newUI} from './util';
import './manage.css';
import './manage-newui.css';

tBody();

(async () => {
  /** @type {StylusClientData} */
  const clientData = process.env.MV3 && global.clientData;
  const query = !process.env.MV3 && router.getSearch('search');
  const [styles, ids] = process.env.MV3 ? [
    clientData.styles,
    clientData.ids,
    init(clientData.badFavs),
  ] : await Promise.all([
    API.styles.getAll(),
    query && API.styles.searchDb({query, mode: router.getSearch(fltMode)}),
    prefs.ready.then(init),
  ]);
  // translate CSS manually
  document.styleSheets[0].insertRule(
    `:root {${[
      'genericDisabledLabel',
      'updateAllCheckSucceededSomeEdited',
      'filteredStylesAllHidden',
    ].map(id => `--${id}:"${CSS.escape(t(id))}";`).join('')
    }}`);
  if (!process.env.MV3 && CHROME >= 80 && CHROME <= 88) {
    // Wrong checkboxes are randomly checked after going back in history, https://crbug.com/1138598
    window.on('pagehide', () => {
      $$('input[type=checkbox]').forEach((el, i) => (el.name = `bug${i}`));
    });
  }
  showStyles(styles, ids);
  await new Promise(setTimeout);
  import('./lazy-init');
})();

function init(badFavs) {
  setupLivePrefs();
  // newUI.readPrefs();
  newUI.render(true);
  prefs.subscribe(newUI.ids.map(newUI.prefKeyForId), () => newUI.render());
  prefs.subscribe('newStyleAsUsercss', (key, val) => {
    $('#add-style-label').textContent =
      t(val ? 'optionsAdvancedNewStyleAsUsercss' : 'addStyleLabel');
  }, true);
  sorter.init();
  router.update();
  return newUI.hasFavs() && readBadFavs(badFavs);
}
