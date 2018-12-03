/* global installed t $ prefs semverCompare */
/* exported sorter */
'use strict';

const sorter = (() => {

  // Set up for only one column
  const defaultSort = 'title,asc';

  const sortOrder = [
    'asc',
    'desc',
    '' // unsorted
  ];

  const sorterType = {
    alpha: (a, b) => a < b ? -1 : a === b ? 0 : 1,
    number: (a, b) => (a || 0) - (b || 0),
    semver: (a, b) => semverCompare(a, b)
  };

  const tagData = {
    title: {
      text: t('genericTitle'),
      parse: ({name}) => name,
      sorter: sorterType.alpha
    },
    order: {
      text: '#',
      parse: ({style}) => style.injectionOrder || style.id,
      sorter: sorterType.number,
    },
    usercss: {
      text: 'Usercss',
      parse: ({style}) => style.usercssData ? 0 : 1,
      sorter: sorterType.number
    },
    disabled: {
      text: t('genericDisabledLabel'), // added as either "enabled" or "disabled" by the addOptions function
      parse: ({style}) => style.enabled ? 0 : 1,
      sorter: sorterType.number
    },
    version: {
      text: '#',
      parse: ({style}) => (style.usercssData && style.usercssData.version || ''),
      sorter: sorterType.semver
    },
    dateInstalled: {
      text: t('dateInstalled'),
      parse: ({style}) => style.installDate || '',
      sorter: sorterType.number
    },
    dateUpdated: {
      text: t('dateUpdated'),
      parse: ({style}) => style.updateDate || '',
      sorter: sorterType.number
    }
  };

  const splitRegex = /\s*,\s*/;
  const whitespace = /\s+/g;

  let columns = 1;
  let lastSort;

  function sort({styles}) {
    let sortBy = prefs.get('manage.newUI.sort').replace(whitespace, '');
    if (lastSort === sortBy) {
      return styles;
    }
    sortBy = sortBy.split(splitRegex);
    if (sortBy.join('') === '') {
      sortBy = defaultSort.split(splitRegex);
    }
    updateHeaders(sortBy);
    const len = sortBy.length;
    return styles.sort((a, b) => {
      let types, direction, x, y;
      let result = 0;
      let index = 0;
      // multi-sort
      while (result === 0 && index < len) {
        types = tagData[sortBy[index++]];
        x = types.parse(a);
        y = types.parse(b);
        // sort empty values to the bottom
        if (x === '') {
          result = 1;
        } else if (y === '') {
          result = -1;
        } else {
          direction = sortBy[index++] === 'asc' ? 1 : -1;
          result = types.sorter(x, y) * direction;
        }
      }
      return result;
    });
  }

  // Update default sort on init & when all other columns are unsorted
  function updateHeaders(sortBy) {
    let header, sortDir;
    let i = 0;
    const len = sortBy.length;
    while (i < len) {
      header = $(`.entry-header [data-type="${sortBy[i++]}"]`);
      sortDir = sortBy[i++];
      if (header) {
        header.dataset.sortDir = sortDir;
      }
    }
  }

  function updateSort(event) {
    const sortables = $$('.entry-header .sortable');
    const elm = event.target;
    // default sort column only allows asc, desc; not unsorted
    const len = sortOrder.length - (elm.dataset.type === defaultSort.split(splitRegex)[0] ? 1 : 0);
    let index = (sortOrder.indexOf(elm.dataset.sortDir) + 1) % len;
    // shift key for multi-column sorting
    if (!event.shiftKey) {
      sortables.forEach(el => {
        el.dataset.sortDir = '';
        el.dataset.timestamp = '';
      });
    }
    elm.dataset.sortDir = sortOrder[index];
    elm.dataset.timestamp = Date.now();

    const newSort = sortables
      .filter(el => el.dataset.sortDir !== '')
      .reduce((acc, el) => {
        const {sortDir, type, timestamp = new Date()} = el.dataset;
        if (sortDir) {
          acc.push({sortDir, type, timestamp: parseFloat(timestamp)});
        }
        return acc;
      }, [])
      .sort((a, b) => a.timestamp - b.timestamp)
      .reduce((acc, item) => {
        acc = acc.concat(item.type, item.sortDir);
        return acc;
      }, [])
      .join(',');
    prefs.set('manage.newUI.sort', newSort || defaultSort);
  }

  function update() {
    if (!installed) return;
    const current = [...installed.children];
    current.shift(); // remove header
    const sorted = sort({
      styles: current.map(entry => ({
        entry,
        name: entry.styleNameLowerCase + '\n' + entry.styleMeta.name,
        style: entry.styleMeta,
      }))
    });
    if (current.some((entry, index) => entry !== sorted[index].entry)) {
      const renderBin = document.createDocumentFragment();
      sorted.forEach(({entry}) => renderBin.appendChild(entry));
      installed.appendChild(renderBin);
    }
    updateStripes();
  }

  function updateStripes({onlyWhenColumnsChanged} = {}) {
    if (onlyWhenColumnsChanged && !updateColumnCount()) return;
    let index = 0;
    let isOdd = false;
    const flipRows = columns % 2 === 0;
    for (const {classList} of installed.children) {
      if (classList.contains('hidden') || classList.contains('entry-header')) continue;
      classList.toggle('odd', isOdd);
      classList.toggle('even', !isOdd);
      if (flipRows && ++index >= columns) {
        index = 0;
      } else {
        isOdd = !isOdd;
      }
    }
  }

  function updateColumnCount() {
    let newValue = 1;
    for (let el = document.documentElement.lastElementChild;
         el.localName === 'style';
         el = el.previousElementSibling) {
      if (el.textContent.includes('--columns:')) {
        newValue = Math.max(1, getComputedStyle(document.documentElement).getPropertyValue('--columns') | 0);
        break;
      }
    }
    if (columns !== newValue) {
      columns = newValue;
      return true;
    }
  }

  function init() {
    prefs.subscribe(['manage.newUI.sort'], update);
    // addOptions();
    updateColumnCount();
  }

  return {init, update, sort, updateSort, updateStripes};
})();
