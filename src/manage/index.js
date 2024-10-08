import {$, $$, setupLivePrefs} from '/js/dom';
import {t, tBody} from '/js/localization';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import router from '/js/router';
import '/js/themer';
import {CHROME} from '/js/toolbox';
import {fltMode} from './filters';
import {showStyles, switchUI} from './render';
import * as sorter from './sorter';
import {newUI} from './util';
import './manage.css';
import './manage-newui.css';

tBody();

const query = router.getSearch('search');
Promise.all([
  API.styles.getAll(),
  query && API.styles.searchDB({query, mode: router.getSearch(fltMode)}),
  prefs.ready.then(onPrefsReady),
]).then(async ([styles, ids]) => {
  router.update();
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
  import('./lazy-init');
});

function onPrefsReady() {
  setupLivePrefs();
  newUI.readPrefs();
  newUI.renderClass();
  prefs.subscribe(newUI.ids.map(newUI.prefKeyForId), () => switchUI(), true);
  prefs.subscribe('newStyleAsUsercss', (key, val) => {
    $('#add-style-label').textContent =
      t(val ? 'optionsAdvancedNewStyleAsUsercss' : 'addStyleLabel');
  }, true);
  switchUI({styleOnly: true});
  sorter.init();
  if (newUI.hasFavs()) return newUI.readBadFavs();
}
