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

const query = router.getSearch('search');
Promise.all([
  API.styles.getAll(),
  query && API.styles.searchDb({query, mode: router.getSearch(fltMode)}),
  prefs.ready.then(() => {
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
    return newUI.hasFavs() && readBadFavs();
  }),
]).then(async ([styles, ids]) => {
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
