/* global installed updateStripes */
/* global messageBox */
'use strict';

const sorterType = {
  alpha: (a, b) => (a < b ? -1 : a === b ? 0 : 1),
  number: (a, b) => a - b
};

const tagData = {
  title: {
    text: t('genericTitle'),
    parse: {
      style: ({name}) => name,
      entry: entry => entry.styleNameLowerCase,
    },
    sorter: sorterType.alpha
  },
  usercss: {
    text: 'Usercss',
    parse: {
      style: ({style}) => (style.usercssData ? 0 : 1),
      entry: entry => (entry.classList.contains('usercss') ? 0 : 1)
    },
    sorter: sorterType.number
  },
  disabled: {
    text: '', // added as either "enabled" or "disabled" by the addSortOptions function
    parse: {
      style: ({style}) => (style.enabled ? 1 : 0),
      entry: entry => (entry.classList.contains('enabled') ? 1 : 0)
    },
    sorter: sorterType.number
  },
  dateInstalled: {
    text: t('dateInstalled'),
    parse: {
      style: ({style}) => style.installDate,
      entry: entry => entry.dataset.installdate
    },
    sorter: sorterType.number
  },
  dateUpdated: {
    text: t('dateUpdated'),
    parse: {
      style: ({style}) => style.updateDate,
      entry: entry => entry.dataset.updatedate
    },
    sorter: sorterType.number
  }
};

// Adding (assumed) most commonly used ('title,asc' should always be first)
// whitespace before & after the comma is ignored
const sortSelectOptions = [
  '{groupAsc}',
  'title,asc',
  'dateInstalled,desc, title,asc',
  'dateInstalled,asc, title,asc',
  'dateUpdated,desc, title,asc',
  'dateUpdated,asc, title,asc',
  'usercss,asc, title,asc',
  'usercss,desc, title,asc',
  'disabled,asc, title,asc',
  'disabled,desc, title,asc',
  'disabled,desc, usercss,asc, title,asc',
  '{groupDesc}',
  'title,desc',
  'usercss,asc, title,desc',
  'usercss,desc, title,desc',
  'disabled,desc, title,desc',
  'disabled,desc, usercss,asc, title,desc'
];

const sortByRegex = /\s*,\s*/;

function addSortOptions() {
  let container;
  const select = $('#sort-select');
  const renderBin = document.createDocumentFragment();
  const option = $create('option');
  const optgroup = $create('optgroup');
  const meta = {
    desc: ' ⇩',
    enabled: t('genericEnabledLabel'),
    disabled: t('genericDisabledLabel'),
    dateNew: ` (${t('sortDateNewestFirst')})`,
    dateOld: ` (${t('sortDateOldestFirst')})`,
    labelFirst: ` (${t('sortLabelFirst')})`,
    labelLast: ` (${t('sortLabelLast')})`,
    groupAsc: t('sortLabelTitleAsc'),
    groupDesc: t('sortLabelTitleDesc')
  };
  const optgroupRegex = /\{\w+\}/;
  sortSelectOptions.forEach(sort => {
    if (optgroupRegex.test(sort)) {
      if (container) {
        renderBin.appendChild(container);
      }
      container = optgroup.cloneNode();
      container.label = meta[sort.substring(1, sort.length - 1)];
      return;
    }
    let lastTag = '';
    const opt = option.cloneNode();
    opt.textContent = sort.split(sortByRegex).reduce((acc, val) => {
      if (tagData[val]) {
        lastTag = val;
        return acc + (acc !== '' ? ' + ' : '') + tagData[val].text;
      }
      if (lastTag.indexOf('date') > -1) return acc + meta[val === 'desc' ? 'dateNew' : 'dateOld'];
      if (lastTag === 'disabled') return acc + meta[val === 'desc' ? 'enabled' : 'disabled'] + meta['labelFirst'];
      if (lastTag !== 'title') return acc + meta[val === 'desc' ? 'labelLast' : 'labelFirst'];
      return acc + (meta[val] || '');
    }, '');
    opt.value = sort;
    container.appendChild(opt);
  });
  renderBin.appendChild(container);
  select.appendChild(renderBin);
  select.value = prefs.get('manage.newUI.sort');
}

function sortStyles({styles, parser}) {
  if (!styles) {
    styles = [...installed.children];
    parser = 'entry';
  } else {
    parser = 'style';
  }
  const sortBy = prefs.get('manage.newUI.sort').split(sortByRegex); // 'title,asc'
  const len = sortBy.length;
  return styles.sort((a, b) => {
    let types, direction;
    let result = 0;
    let indx = 0;
    // multi-sort
    while (result === 0 && indx < len) {
      types = tagData[sortBy[indx++]];
      direction = sortBy[indx++] === 'asc' ? 1 : -1;
      result = types.sorter(types.parse[parser](a), types.parse[parser](b)) * direction;
    }
    return result;
  });
}

function manageSort(event) {
  event.preventDefault();
  prefs.set('manage.newUI.sort', this.value);
  debounce(updateSort);
}

function updateSort() {
  const renderBin = document.createDocumentFragment();
  const entries = sortStyles({parser: 'entry'});
  let index = 0;
  moveEntries();
  function moveEntries() {
    const t0 = performance.now();
    let moved = 0;
    while (
      index < entries.length &&
      (++moved < 10 || performance.now() - t0 < 10)
    ) {
      renderBin.appendChild(entries[index++]);
    }
    if (index < entries.length) {
      requestAnimationFrame(moveEntries);
      return;
    }
  }
  installed.appendChild(renderBin);
  updateStripes();
}

function showSortHelp(event) {
  event.preventDefault();
  messageBox({
    className: 'help-text',
    title: t('sortStylesHelpTitle'),
    contents:
      $create('div',
        t('sortStylesHelp').split('\n').map(line =>
          $create('p', line))),
    buttons: [t('confirmOK')],
  });
}

function sortInit() {
  $('#sort-select').addEventListener('change', manageSort);
  $('#sorter-help').onclick = showSortHelp;
  addSortOptions();
}
