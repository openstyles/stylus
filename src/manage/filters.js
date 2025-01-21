import {$create} from '@/js/dom';
import {messageBox} from '@/js/dom-util';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {debounce, t} from '@/js/util';
import {fitNameColumn, fitSizeColumn} from './render';
import * as router from './router';
import {updateStripes} from './sorter';
import {installed} from './util';

export const filtersSelector = {
  hide: '',
  unhide: '',
  numShown: 0,
  numTotal: 0,
};
const fltSearch = 'search';
export const fltMode = 'searchMode';
const fltModePref = 'manage.searchMode';
let elSearch, elSearchMode;

router.watch({search: [fltSearch, fltMode]}, ([search, mode]) => {
  const firstRun = !elSearch;
  if (firstRun) initFilters();
  elSearch.value = search || '';
  elSearchMode.value = mode || prefs.__values[fltModePref];
  if (firstRun) filterOnChange({forceRefilter: true});
  else searchStyles();
});

function initFilters() {
  elSearch = $id('search');
  elSearchMode = $id(fltModePref);
  elSearchMode.on('change', e => {
    if (elSearchMode.value === 'url') { // `url` mode shouldn't be saved
      e.stopPropagation();
    }
  }, true);
  elSearch.oninput = () => router.updateSearch(fltSearch, elSearch.value);
  elSearchMode.oninput = () => router.updateSearch(fltMode, elSearchMode.value);

  $id('search-help').onclick = event => {
    event.preventDefault();
    messageBox.show({
      className: 'help-text center-dialog',
      title: t(fltSearch),
      contents:
        $create('ul',
          t('searchStylesHelp').split('\n').map(line =>
            $create('li', line.split(/(<.*?>)/).map((s, i, words) => {
              if (s.startsWith('<')) {
                const num = words.length;
                const className = i === num - 2 && !words[num - 1] ? '.last' : '';
                return $create('mark' + className, s.slice(1, -1));
              } else {
                return s;
              }
            })))),
      buttons: [t('confirmOK')],
    });
  };

  $$('select[id$=".invert"]').forEach(el => {
    const slave = $id(el.id.replace('.invert', ''));
    const slaveData = slave.dataset;
    const valueMap = new Map([
      [false, slaveData.filter],
      [true, slaveData.filterHide],
    ]);
    // enable slave control when user switches the value
    el.oninput = () => {
      if (!slave.checked) {
        // oninput occurs before onchange
        setTimeout(() => {
          if (!slave.checked) {
            slave.checked = true;
            slave.dispatchEvent(new Event('change', {bubbles: true}));
          }
        });
      }
    };
    // swap slave control's filtering rules
    el.onchange = event => {
      const value = el.value === 'true';
      const filter = valueMap.get(value);
      if (slaveData.filter === filter) {
        return;
      }
      slaveData.filter = filter;
      slaveData.filterHide = valueMap.get(!value);
      debounce(filterOnChange, 0, event);
    };
    el.onchange({target: el});
  });

  $$('[data-filter]').forEach(el => {
    el.onchange = filterOnChange;
    if (el.closest('.hidden')) {
      el.checked = false;
    }
  });

  $('#stats a').onclick = event => {
    event.preventDefault();
    if (!filtersSelector.hide) {
      return;
    }
    for (const el of $$('#filters [data-filter]')) {
      let value;
      if (el.type === 'checkbox' && el.checked) {
        value = el.checked = false;
      } else if (el.value) {
        value = el.value = '';
      }
      if (value !== undefined) {
        el.lastValue = value;
        if (prefs.knownKeys.includes(el.id)) {
          prefs.set(el.id, false);
        }
      }
    }
    if (elSearchMode.value === 'url') {
      elSearchMode.value = prefs.__values[fltModePref];
    }
    filterOnChange({forceRefilter: true});
    router.updateSearch({[fltSearch]: '', [fltMode]: ''});
  };
}

function filterOnChange({target, forceRefilter, alreadySearched}) {
  const getValue = el => (el.type === 'checkbox' ? el.checked : el.value.trim());
  if (!forceRefilter) {
    const value = getValue(target);
    if (value === target.lastValue) {
      return;
    }
    target.lastValue = value;
  }
  const enabledFilters = [...$$('#header [data-filter]')].filter(el => getValue(el));
  const buildFilter = hide =>
    (hide ? '' : '.entry.hidden') +
    [...enabledFilters.map(el =>
      el.dataset[hide ? 'filterHide' : 'filter']
        .split(/,\s*/)
        .map(s => (hide ? '.entry:not(.hidden)' : '') + s)
        .join(',')),
    ].join(hide ? ',' : '');
  Object.assign(filtersSelector, {
    hide: buildFilter(true),
    unhide: buildFilter(false),
  });
  reapplyFilter(installed, alreadySearched).then(updateStripes);
}

export function filterAndAppend({entry, container}) {
  if (!container) {
    fitNameColumn(undefined, entry.styleMeta);
    fitSizeColumn(undefined, entry);
  }
  return reapplyFilter(container || [entry], undefined, entry);
}

/**
 * @returns {Promise} resolves on async search
 */
async function reapplyFilter(container = installed, alreadySearched, entry) {
  if (!alreadySearched && elSearch.value.trim()) {
    await searchStyles({immediately: true, container});
  }
  // reverse the visibility, otherwise reapplyFilter will see no need to work
  if (entry && (!filtersSelector.hide || !entry.matches(filtersSelector.hide))) {
    entry.classList.add('hidden');
  }
  // A: show
  let toHide = [];
  let toUnhide = [];
  if (filtersSelector.hide) {
    filterContainer({hide: false});
  } else {
    toUnhide = container;
  }
  // showStyles() is building the page and no filters are active
  if (toUnhide instanceof DocumentFragment) {
    installed.appendChild(toUnhide);
    return;
  }
  // filtering needed or a single-element job from handleUpdate()
  for (entry of toUnhide.children || toUnhide) {
    if (!entry.parentNode) {
      installed.appendChild(entry);
    }
    if (entry.classList.contains('hidden')) {
      entry.classList.remove('hidden');
    }
  }
  // B: hide
  if (filtersSelector.hide) {
    filterContainer({hide: true});
  }
  if (!toHide.length) {
    showFiltersStats();
    return;
  }
  for (entry of toHide) {
    entry.classList.add('hidden');
  }
  // showStyles() is building the page with filters active so we need to:
  // 1. add all hidden entries to the end
  // 2. add the visible entries before the first hidden entry
  if (container instanceof DocumentFragment) {
    installed.appendChild(container);
    showFiltersStats();
    return;
  }
  // single-element job from handleEvent(): add the last wraith
  if (toHide.length === 1 && toHide[0].parentElement !== installed) {
    installed.appendChild(toHide[0]);
  }
  showFiltersStats();

  /***************************************/

  function filterContainer({hide}) {
    const selector = filtersSelector[hide ? 'hide' : 'unhide'];
    if (container.filter) {
      if (hide) {
        // already filtered in previous invocation
        return;
      }
      for (const el of container) {
        (el.matches(selector) ? toUnhide : toHide).push(el);
      }
    } else if (hide) {
      toHide = [...container.$$(selector)];
    } else {
      toUnhide = [...container.$$(selector)];
    }
  }
}

export function showFiltersStats() {
  const active = filtersSelector.hide !== '';
  const numTotal = installed.childElementCount;
  const numHidden = installed.getElementsByClassName('entry hidden').length;
  const numShown = numTotal - numHidden;
  $id('header').classList.toggle('filtered', active);
  if (filtersSelector.numShown !== numShown ||
      filtersSelector.numTotal !== numTotal) {
    filtersSelector.numShown = numShown;
    filtersSelector.numTotal = numTotal;
    $('#stats span').textContent = t('filteredStyles', [numShown, numTotal]);
    document.body.classList.toggle('all-styles-hidden-by-filters',
      !numShown && numTotal && filtersSelector.hide);
  }
}

async function searchStyles({immediately, container} = {}) {
  const query = elSearch.value.trim();
  const mode = elSearchMode.value;
  if (query === elSearch.lastValue
  && mode === elSearchMode.lastValue
  && !immediately && !container) {
    return;
  }
  if (!immediately) {
    debounce(searchStyles, 150, {immediately: true});
    return;
  }
  elSearch.lastValue = query;
  elSearchMode.lastValue = mode;

  const all = installed.children;
  const entries = container && container.children || container || all;
  const idsToSearch = entries !== all && [...entries].map(el => el.styleId);
  const ids = entries[0]
    ? await API.styles.searchDb({query, mode, ids: idsToSearch})
    : [];
  let needsRefilter = false;
  for (const entry of entries) {
    const isMatching = ids.includes(entry.styleId);
    if (entry.classList.contains('not-matching') !== !isMatching) {
      entry.classList.toggle('not-matching', !isMatching);
      needsRefilter = true;
    }
  }
  if (needsRefilter && !container) {
    filterOnChange({forceRefilter: true, alreadySearched: true});
  }
  return container;
}
