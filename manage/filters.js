'use strict';

define(require => {
  const {API} = require('/js/msg');
  const {debounce} = require('/js/toolbox');
  const {$, $$, $create, messageBoxProxy} = require('/js/dom');
  const t = require('/js/localization');
  const prefs = require('/js/prefs');
  const router = require('/js/router');
  const sorter = require('./sorter');

  const filtersSelector = {
    hide: '',
    unhide: '',
    numShown: 0,
    numTotal: 0,
  };

  let initialized = false;

  const filters = {

    filtersSelector,

    filterAndAppend({entry, container}) {
      if (!container) {
        container = [entry];
        // reverse the visibility, otherwise reapplyFilter will see no need to work
        if (!filtersSelector.hide || !entry.matches(filtersSelector.hide)) {
          entry.classList.add('hidden');
        }
      }
      return reapplyFilter(container);
    },

    showStats() {
      const active = filtersSelector.hide !== '';
      $('#filters summary').classList.toggle('active', active);
      $('#reset-filters').disabled = !active;
      const numTotal = $('#installed').childElementCount;
      const numHidden = $('#installed').getElementsByClassName('entry hidden').length;
      const numShown = numTotal - numHidden;
      if (filtersSelector.numShown !== numShown ||
          filtersSelector.numTotal !== numTotal) {
        filtersSelector.numShown = numShown;
        filtersSelector.numTotal = numTotal;
        $('#filters-stats').textContent = t('filteredStyles', [numShown, numTotal]);
        document.body.classList.toggle('all-styles-hidden-by-filters',
          !numShown && numTotal && filtersSelector.hide);
      }
    },
  };

  router.watch({search: ['search', 'searchMode']}, ([search, mode]) => {
    $('#search').value = search || '';
    if (mode) $('#searchMode').value = mode;
    if (!initialized) {
      initFilters();
      initialized = true;
    } else {
      searchStyles();
    }
  });

  HTMLSelectElement.prototype.adjustWidth = function () {
    const sel = this.selectedOptions[0];
    if (!sel) return;
    const wOld = parseFloat(this.style.width);
    const opts = [...this];
    opts.forEach(opt => opt !== sel && opt.remove());
    this.style.width = '';
    requestAnimationFrame(() => {
      const w = this.offsetWidth;
      if (w && wOld !== w) this.style.width = w + 'px';
      this.append(...opts);
    });
  };

  function initFilters() {
    $('#search').oninput = $('#searchMode').oninput = function (e) {
      router.updateSearch(this.id, e.target.value);
    };

    $('#search-help').onclick = showHelp;

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
    prefs.subscribe('manage.filters.expanded', () => {
      const el = $('#filters');
      if (el.open) {
        $$('.filter-selection select', el).forEach(select => select.adjustWidth());
      }
    });

    filterOnChange({forceRefilter: true});
  }

  function filterOnChange({target: el, forceRefilter, alreadySearched}) {
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
          .join(',')),
      ].join(hide ? ',' : '');
    Object.assign(filtersSelector, {
      hide: buildFilter(true),
      unhide: buildFilter(false),
    });
    if ($('#installed')) {
      reapplyFilter($('#installed'), alreadySearched).then(sorter.updateStripes);
    }
  }

  /**
   * @returns {Promise} resolves on async search
   */
  async function reapplyFilter(container = $('#installed'), alreadySearched) {
    if (!alreadySearched && $('#search').value.trim()) {
      await searchStyles({immediately: true, container});
    }
    // A: show
    let toHide = [];
    let toUnhide = [];
    if (filtersSelector.hide) {
      filterContainer({hide: false});
    } else {
      toUnhide = container;
    }
    const installed = $('#installed');
    // showStyles() is building the page and no filters are active
    if (toUnhide instanceof DocumentFragment) {
      installed.appendChild(toUnhide);
      return;
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
      filters.showStats();
      return;
    }
    for (const entry of toHide) {
      entry.classList.add('hidden');
    }
    // showStyles() is building the page with filters active so we need to:
    // 1. add all hidden entries to the end
    // 2. add the visible entries before the first hidden entry
    if (container instanceof DocumentFragment) {
      installed.appendChild(container);
      filters.showStats();
      return;
    }
    // single-element job from handleEvent(): add the last wraith
    if (toHide.length === 1 && toHide[0].parentElement !== installed) {
      installed.appendChild(toHide[0]);
    }
    filters.showStats();
    return;

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

  async function showHelp(event) {
    event.preventDefault();
    messageBoxProxy.show({
      className: 'help-text',
      title: t('search'),
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
  }

  async function searchStyles({immediately, container} = {}) {
    const el = $('#search');
    const elMode = $('#searchMode');
    const query = el.value.trim();
    const mode = elMode.value;
    if (query === el.lastValue && mode === elMode.lastValue && !immediately && !container) {
      return;
    }
    if (!immediately) {
      debounce(searchStyles, 150, {immediately: true});
      return;
    }
    el.lastValue = query;
    elMode.lastValue = mode;

    const all = $('#installed').children;
    const entries = container && container.children || container || all;
    const idsToSearch = entries !== all && [...entries].map(el => el.styleId);
    const ids = entries[0]
      ? await API.searchDB({query, mode, ids: idsToSearch})
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

  return filters;
});
