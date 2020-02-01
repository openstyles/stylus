/* global installed messageBox sorter $ $$ $create t debounce prefs API router */
/* exported filterAndAppend */
'use strict';

const filtersSelector = {
  hide: '',
  unhide: '',
  numShown: 0,
  numTotal: 0,
};

let initialized = false;

router.watch({search: ['search']}, ([search]) => {
  $('#search').value = search || '';
  if (!initialized) {
    init();
    initialized = true;
  } else {
    searchStyles();
  }
});

HTMLSelectElement.prototype.adjustWidth = function () {
  const option0 = this.selectedOptions[0];
  if (!option0) return;
  const parent = this.parentNode;
  const singleSelect = this.cloneNode(false);
  singleSelect.style.width = '';
  singleSelect.appendChild(option0.cloneNode(true));
  parent.replaceChild(singleSelect, this);
  const w = singleSelect.offsetWidth;
  if (w && this.style.width !== w + 'px') {
    this.style.width = w + 'px';
  }
  parent.replaceChild(this, singleSelect);
};

function init() {
  $('#search').oninput = e => {
    router.updateSearch('search', e.target.value);
  };

  $('#search-help').onclick = event => {
    event.preventDefault();
    messageBox({
      className: 'help-text',
      title: t('searchStyles'),
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
    const slave = $('#' + el.id.replace('.invert', ''));
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
      // avoid triggering MutationObserver during page load
      if (document.readyState === 'complete') {
        el.adjustWidth();
      }
    };
    el.onchange({target: el});
  });

  $$('[data-filter]').forEach(el => {
    el.onchange = filterOnChange;
    if (el.closest('.hidden')) {
      el.checked = false;
    }
  });

  $('#reset-filters').onclick = event => {
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
        if (el.id in prefs.defaults) {
          prefs.set(el.id, false);
        }
      }
    }
    filterOnChange({forceRefilter: true});
    router.updateSearch('search', '');
  };

  // Adjust width after selects are visible
  prefs.subscribe(['manage.filters.expanded'], () => {
    const el = $('#filters');
    if (el.open) {
      $$('select', el).forEach(select => select.adjustWidth());
    }
  });

  filterOnChange({forceRefilter: true});
}


function filterOnChange({target: el, forceRefilter}) {
  const getValue = el => (el.type === 'checkbox' ? el.checked : el.value.trim());
  if (!forceRefilter) {
    const value = getValue(el);
    if (value === el.lastValue) {
      return;
    }
    el.lastValue = value;
  }
  const enabledFilters = $$('#header [data-filter]').filter(el => getValue(el));
  const buildFilter = hide =>
    (hide ? '' : '.entry.hidden') +
    [...enabledFilters.map(el =>
      el.dataset[hide ? 'filterHide' : 'filter']
        .split(/,\s*/)
        .map(s => (hide ? '.entry:not(.hidden)' : '') + s)
        .join(','))
    ].join(hide ? ',' : '');
  Object.assign(filtersSelector, {
    hide: buildFilter(true),
    unhide: buildFilter(false),
  });
  if (installed) {
    reapplyFilter().then(sorter.updateStripes);
  }
}

/**
 * @returns {Promise} resolves on async search
 */
function filterAndAppend({entry, container}) {
  if (!container) {
    container = [entry];
    // reverse the visibility, otherwise reapplyFilter will see no need to work
    if (!filtersSelector.hide || !entry.matches(filtersSelector.hide)) {
      entry.classList.add('hidden');
    }
  }
  return reapplyFilter(container);
}

/**
 * @returns {Promise} resolves on async search
 */
function reapplyFilter(container = installed, alreadySearched) {
  if (!alreadySearched && $('#search').value.trim()) {
    return searchStyles({immediately: true, container})
      .then(() => reapplyFilter(container, true));
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
    return Promise.resolve();
  }
  // filtering needed or a single-element job from handleUpdate()
  for (const entry of toUnhide.children || toUnhide) {
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
    return Promise.resolve();
  }
  for (const entry of toHide) {
    entry.classList.add('hidden');
  }
  // showStyles() is building the page with filters active so we need to:
  // 1. add all hidden entries to the end
  // 2. add the visible entries before the first hidden entry
  if (container instanceof DocumentFragment) {
    installed.appendChild(container);
    showFiltersStats();
    return Promise.resolve();
  }
  // single-element job from handleEvent(): add the last wraith
  if (toHide.length === 1 && toHide[0].parentElement !== installed) {
    installed.appendChild(toHide[0]);
  }
  showFiltersStats();
  return Promise.resolve();

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
      return;
    } else if (hide) {
      toHide = $$(selector, container);
    } else {
      toUnhide = $$(selector, container);
    }
  }
}


function showFiltersStats() {
  const active = filtersSelector.hide !== '';
  $('#filters summary').classList.toggle('active', active);
  $('#reset-filters').disabled = !active;
  const numTotal = installed.children.length;
  const numHidden = installed.getElementsByClassName('entry hidden').length;
  const numShown = numTotal - numHidden;
  if (filtersSelector.numShown !== numShown ||
      filtersSelector.numTotal !== numTotal) {
    filtersSelector.numShown = numShown;
    filtersSelector.numTotal = numTotal;
    $('#filters-stats').textContent = t('filteredStyles', [numShown, numTotal]);
    document.body.classList.toggle('all-styles-hidden-by-filters',
      !numShown && numTotal && filtersSelector.hide);
  }
}


function searchStyles({immediately, container} = {}) {
  const el = $('#search');
  const query = el.value.trim();
  if (query === el.lastValue && !immediately && !container) {
    return;
  }
  if (!immediately) {
    debounce(searchStyles, 150, {immediately: true});
    return;
  }
  el.lastValue = query;

  const entries = container && container.children || container || installed.children;
  return API.searchDB({
    query,
    ids: [...entries].map(el => el.styleId),
  }).then(ids => {
    ids = new Set(ids);
    let needsRefilter = false;
    for (const entry of entries) {
      const isMatching = ids.has(entry.styleId);
      if (entry.classList.contains('not-matching') !== !isMatching) {
        entry.classList.toggle('not-matching', !isMatching);
        needsRefilter = true;
      }
    }
    if (needsRefilter && !container) {
      filterOnChange({forceRefilter: true});
    }
    return container;
  });
}
