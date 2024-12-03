import '/js/dom-init';
import {$, $$} from '/js/dom';
import {setupLivePrefs} from '/js/dom-util';
import {t, tBody} from '/js/localization';
import * as prefs from '/js/prefs';
import {CHROME} from '/js/ua';
import {sleep} from '/js/util';
import {readBadFavs, showStyles} from './render';
import * as router from './router';
import * as sorter from './sorter';
import {newUI} from './util';
import './manage.css';
import './manage-newui.css';

tBody();

(async () => {
  const {badFavs, ids, styles} = process.env.MV3 ? prefs.clientData : await prefs.clientData;
  init(badFavs);
  showStyles(styles, ids);
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
  await sleep();
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
