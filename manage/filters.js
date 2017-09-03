/* global installed */
'use strict';

const filtersSelector = {
  hide: '',
  unhide: '',
  numShown: 0,
  numTotal: 0,
};

const urlFilterParam = new URLSearchParams(location.search).get('url');
if (location.search) {
  history.replaceState(0, document.title, location.origin + location.pathname);
}

HTMLSelectElement.prototype.adjustWidth = function () {
  const parent = this.parentNode;
  const singleSelect = this.cloneNode(false);
  singleSelect.style.width = '';
  singleSelect.appendChild(this.selectedOptions[0].cloneNode(true));
  parent.replaceChild(singleSelect, this);
  if (this.style.width !== singleSelect.offsetWidth + 'px') {
    this.style.width = singleSelect.offsetWidth + 'px';
  }
  parent.replaceChild(this, singleSelect);
};

onDOMready().then(onBackgroundReady).then(() => {
  $('#search').oninput = searchStyles;
  if (urlFilterParam) {
    $('#search').value = 'url:' + urlFilterParam;
  }

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

  filterOnChange({forceRefilter: true});
});


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
    reapplyFilter();
  }
}


function filterAndAppend({entry, container}) {
  if (!container) {
    container = [entry];
    // reverse the visibility, otherwise reapplyFilter will see no need to work
    if (!filtersSelector.hide || !entry.matches(filtersSelector.hide)) {
      entry.classList.add('hidden');
    }
  } else if ($('#search').value.trim()) {
    searchStyles({immediately: true, container});
  }
  reapplyFilter(container);
}


function reapplyFilter(container = installed) {
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
  } else if (toUnhide.length && $('#search').value.trim()) {
    searchStyles({immediately: true, container: toUnhide});
    filterContainer({hide: false});
  }
  // filtering needed or a single-element job from handleUpdate()
  const entries = installed.children;
  const numEntries = entries.length;
  let numVisible = numEntries - $$('.entry.hidden').length;
  for (const entry of toUnhide.children || toUnhide) {
    const next = findInsertionPoint(entry);
    if (entry.nextElementSibling !== next) {
      installed.insertBefore(entry, next);
    }
    if (entry.classList.contains('hidden')) {
      entry.classList.remove('hidden');
      numVisible++;
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
  for (const entry of toHide) {
    entry.classList.add('hidden');
  }
  // showStyles() is building the page with filters active so we need to:
  // 1. add all hidden entries to the end
  // 2. add the visible entries before the first hidden entry
  if (container instanceof DocumentFragment) {
    for (const entry of toHide) {
      installed.appendChild(entry);
    }
    installed.insertBefore(container, $('.entry.hidden'));
    showFiltersStats();
    return;
  }
  // normal filtering of the page or a single-element job from handleUpdate()
  // we need to keep the visible entries together at the start
  // first pass only moves one hidden entry in hidden groups with odd number of items
  shuffle(false);
  setTimeout(shuffle, 0, true);
  // single-element job from handleEvent(): add the last wraith
  if (toHide.length === 1 && toHide[0].parentElement !== installed) {
    installed.appendChild(toHide[0]);
  }
  showFiltersStats();
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

  function shuffle(fullPass) {
    if (fullPass && !document.body.classList.contains('update-in-progress')) {
      $('#check-all-updates').disabled = !$('.updatable:not(.can-update)');
    }
    // 1. skip the visible group on top
    let firstHidden = $('#installed > .hidden');
    let entry = firstHidden;
    let i = [...entries].indexOf(entry);
    let horizon = entries[numVisible];
    const skipGroup = state => {
      const start = i;
      const first = entry;
      while (entry && entry.classList.contains('hidden') === state) {
        entry = entry.nextElementSibling;
        i++;
      }
      return {first, start, len: i - start};
    };
    let prevGroup = i ? {first: entries[0], start: 0, len: i} : skipGroup(true);
    // eslint-disable-next-line no-unmodified-loop-condition
    while (entry) {
      // 2a. find the next hidden group's start and end
      // 2b. find the next visible group's start and end
      const isHidden = entry.classList.contains('hidden');
      const group = skipGroup(isHidden);
      const hidden = isHidden ? group : prevGroup;
      const visible = isHidden ? prevGroup : group;
      // 3. move the shortest group; repeat 2-3
      if (hidden.len < visible.len && (fullPass || hidden.len % 2)) {
        // 3a. move hidden under the horizon
        for (let j = 0; j < (fullPass ? hidden.len : 1); j++) {
          const entry = entries[hidden.start];
          installed.insertBefore(entry, horizon);
          horizon = entry;
          i--;
        }
        prevGroup = isHidden ? skipGroup(false) : group;
        firstHidden = entry;
      } else if (isHidden || !fullPass) {
        prevGroup = group;
      } else {
        // 3b. move visible above the horizon
        for (let j = 0; j < visible.len; j++) {
          const entry = entries[visible.start + j];
          installed.insertBefore(entry, firstHidden);
        }
        prevGroup = {
          first: firstHidden,
          start: hidden.start + visible.len,
          len: hidden.len + skipGroup(true).len,
        };
      }
    }
  }

  function findInsertionPoint(entry) {
    const nameLLC = entry.styleNameLowerCase;
    let a = 0;
    let b = Math.min(numEntries, numVisible) - 1;
    if (b < 0) {
      return entries[numVisible];
    }
    if (entries[0].styleNameLowerCase > nameLLC) {
      return entries[0];
    }
    if (entries[b].styleNameLowerCase <= nameLLC) {
      return entries[numVisible];
    }
    // bisect
    while (a < b - 1) {
      const c = (a + b) / 2 | 0;
      if (nameLLC < entries[c].styleNameLowerCase) {
        b = c;
      } else {
        a = c;
      }
    }
    if (entries[a].styleNameLowerCase > nameLLC) {
      return entries[a];
    }
    while (a <= b && entries[a].styleNameLowerCase < nameLLC) {
      a++;
    }
    return entries[entries[a].styleNameLowerCase <= nameLLC ? a + 1 : a];
  }
}


function showFiltersStats({immediately} = {}) {
  if (!immediately) {
    debounce(showFiltersStats, 100, {immediately: true});
    return;
  }
  $('#filters').classList.toggle('active', filtersSelector.hide !== '');
  const numTotal = BG.cachedStyles.list.length;
  const numHidden = installed.getElementsByClassName('entry hidden').length;
  const numShown = Math.min(numTotal - numHidden, installed.children.length);
  if (filtersSelector.numShown !== numShown ||
      filtersSelector.numTotal !== numTotal) {
    filtersSelector.numShown = numShown;
    filtersSelector.numTotal = numTotal;
    $('#filters-stats').textContent = t('filteredStyles', [numShown, numTotal]);
  }
}


function searchStyles({immediately, container}) {
  const searchElement = $('#search');
  const urlMode = /^\s*url:/i.test(searchElement.value);
  const query = urlMode
    ? searchElement.value.replace(/^\s*url:/i, '').trim()
    : searchElement.value.toLocaleLowerCase();
  const queryPrev = searchElement.lastValue || '';
  if (query === queryPrev && !immediately && !container) {
    return;
  }
  if (!immediately) {
    debounce(searchStyles, 150, {immediately: true});
    return;
  }
  searchElement.lastValue = query;

  const searchInVisible = !urlMode && queryPrev && query.includes(queryPrev);
  const entries = container && container.children || container ||
    (searchInVisible ? $$('.entry:not(.hidden)') : installed.children);
  const siteStyleIds = urlMode &&
    new Set(BG.filterStyles({matchUrl: query}).map(style => style.id));
  let needsRefilter = false;
  for (const entry of entries) {
    let isMatching = !query;
    if (!isMatching) {
      const style = urlMode ? siteStyleIds.has(entry.styleId) :
        BG.cachedStyles.byId.get(entry.styleId) || {};
      isMatching = Boolean(style && (
        urlMode ||
        isMatchingText(style.name) ||
        style.url && isMatchingText(style.url) ||
        isMatchingStyle(style)));
    }
    if (entry.classList.contains('not-matching') !== !isMatching) {
      entry.classList.toggle('not-matching', !isMatching);
      needsRefilter = true;
    }
  }
  if (needsRefilter && !container) {
    filterOnChange({forceRefilter: true});
  }
  return;

  function isMatchingStyle(style) {
    for (const section of style.sections) {
      for (const prop in section) {
        const value = section[prop];
        switch (typeof value) {
          case 'string':
            if (isMatchingText(value)) {
              return true;
            }
            break;
          case 'object':
            for (const str of value) {
              if (isMatchingText(str)) {
                return true;
              }
            }
            break;
        }
      }
    }
  }

  function isMatchingText(text) {
    return text.toLocaleLowerCase().indexOf(query) >= 0;
  }
}
