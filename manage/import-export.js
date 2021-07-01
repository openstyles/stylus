/* global API */// msg.js
/* global RX_META deepEqual isEmptyObj tryJSONparse */// toolbox.js
/* global changeQueue */// manage.js
/* global chromeSync */// storage-util.js
/* global prefs */
/* global t */// localization.js
/* global
  $
  $$
  $create
  animateElement
  messageBoxProxy
  scrollElementIntoView
*/// dom.js
'use strict';

$('#file-all-styles').onclick = exportToFile;
$('#unfile-all-styles').onclick = () => importFromFile({fileTypeFilter: '.json'});

Object.assign(document.body, {
  ondragover(event) {
    const hasFiles = event.dataTransfer.types.includes('Files');
    event.dataTransfer.dropEffect = hasFiles || event.target.type === 'search' ? 'copy' : 'none';
    this.classList.toggle('dropzone', hasFiles);
    if (hasFiles) {
      event.preventDefault();
      this.classList.remove('fadeout');
    }
  },
  ondragend() {
    animateElement(this, 'fadeout', 'dropzone');
  },
  ondragleave(event) {
    try {
      // in Firefox event.target could be XUL browser and hence there is no permission to access it
      if (event.target === this) {
        this.ondragend();
      }
    } catch (e) {
      this.ondragend();
    }
  },
  ondrop(event) {
    if (event.dataTransfer.files.length) {
      event.preventDefault();
      if ($('#only-updates input').checked) {
        $('#only-updates input').click();
      }
      importFromFile({file: event.dataTransfer.files[0]});
    }
    /* Run import first for a while, then run fadeout which is very CPU-intensive in Chrome */
    setTimeout(() => this.ondragend(), 250);
  },
});

function importFromFile({fileTypeFilter, file} = {}) {
  return new Promise(async resolve => {
    await require(['/js/storage-util']);
    const fileInput = document.createElement('input');
    if (file) {
      readFile();
      return;
    }
    fileInput.style.display = 'none';
    fileInput.type = 'file';
    fileInput.accept = fileTypeFilter || '.txt';
    fileInput.acceptCharset = 'utf-8';

    document.body.appendChild(fileInput);
    fileInput.initialValue = fileInput.value;
    fileInput.onchange = readFile;
    fileInput.click();

    function readFile() {
      if (file || fileInput.value !== fileInput.initialValue) {
        file = file || fileInput.files[0];
        if (file.size > 100e6) {
          messageBoxProxy.alert("100MB backup? I don't believe you.");
          resolve();
          return;
        }
        const fReader = new FileReader();
        fReader.onloadend = event => {
          fileInput.remove();
          const text = event.target.result;
          const maybeUsercss = !/^\s*\[/.test(text) && RX_META.test(text);
          if (maybeUsercss) {
            messageBoxProxy.alert(t('dragDropUsercssTabstrip'));
          } else {
            importFromString(text).then(resolve);
          }
        };
        fReader.readAsText(file, 'utf-8');
      }
    }
  });
}

async function importFromString(jsonString) {
  await require(['/js/sections-util']); /* global styleJSONseemsValid styleSectionsEqual */
  const json = tryJSONparse(jsonString);
  const oldStyles = Array.isArray(json) && json.length ? await API.styles.getAll() : [];
  const oldStylesById = new Map(oldStyles.map(style => [style.id, style]));
  const oldStylesByName = new Map(oldStyles.map(style => [style.name.trim(), style]));
  const items = [];
  const infos = [];
  const stats = {
    options: {names: [], isOptions: true, legend: 'optionsHeading'},
    added: {names: [], ids: [], legend: 'importReportLegendAdded', dirty: true},
    unchanged: {names: [], ids: [], legend: 'importReportLegendIdentical'},
    metaAndCode: {names: [], ids: [], legend: 'importReportLegendUpdatedBoth', dirty: true},
    metaOnly: {names: [], ids: [], legend: 'importReportLegendUpdatedMeta', dirty: true},
    codeOnly: {names: [], ids: [], legend: 'importReportLegendUpdatedCode', dirty: true},
    invalid: {names: [], legend: 'importReportLegendInvalid'},
  };
  await Promise.all(json.map(analyze));
  changeQueue.length = 0;
  changeQueue.time = performance.now();
  (await API.styles.importMany(items))
    .forEach((style, i) => updateStats(style, infos[i]));
  return done();

  function analyze(item, index) {
    if (item && !item.id && item[prefs.STORAGE_KEY]) {
      return analyzeStorage(item);
    }
    if (typeof item !== 'object' || !styleJSONseemsValid(item)) {
      stats.invalid.names.push(`#${index}: ${limitString(item && item.name || '')}`);
      return;
    }
    item.name = item.name.trim();
    const byId = oldStylesById.get(item.id);
    const byName = oldStylesByName.get(item.name);
    oldStylesByName.delete(item.name);
    let oldStyle;
    if (byId) {
      if (sameStyle(byId, item)) {
        oldStyle = byId;
      } else {
        delete item.id;
      }
    }
    if (!oldStyle && byName) {
      item.id = byName.id;
      oldStyle = byName;
    }
    const metaEqual = oldStyle && deepEqual(oldStyle, item, ['sections', '_rev']);
    const codeEqual = oldStyle && styleSectionsEqual(oldStyle, item);
    if (metaEqual && codeEqual) {
      stats.unchanged.names.push(oldStyle.name);
      stats.unchanged.ids.push(oldStyle.id);
    } else {
      items.push(item);
      infos.push({oldStyle, metaEqual, codeEqual});
    }
  }

  async function analyzeStorage(storage) {
    analyzePrefs(storage[prefs.STORAGE_KEY], prefs.knownKeys, prefs.values, true);
    delete storage[prefs.STORAGE_KEY];
    if (!isEmptyObj(storage)) {
      analyzePrefs(storage, Object.values(chromeSync.LZ_KEY), await chromeSync.getLZValues());
    }
  }

  function analyzePrefs(obj, validKeys, values, isPref) {
    for (const [key, val] of Object.entries(obj || {})) {
      const isValid = validKeys.includes(key);
      if (!isValid || !deepEqual(val, values[key])) {
        stats.options.names.push({name: key, val, isValid, isPref});
      }
    }
  }

  function sameStyle(oldStyle, newStyle) {
    return oldStyle.name.trim() === newStyle.name.trim() ||
      ['updateUrl', 'originalMd5', 'originalDigest']
        .some(field => oldStyle[field] && oldStyle[field] === newStyle[field]);
  }

  function updateStats(style, {oldStyle, metaEqual, codeEqual}) {
    if (!oldStyle) {
      stats.added.names.push(style.name);
      stats.added.ids.push(style.id);
      return;
    }
    if (!metaEqual && !codeEqual) {
      stats.metaAndCode.names.push(reportNameChange(oldStyle, style));
      stats.metaAndCode.ids.push(style.id);
      return;
    }
    if (!codeEqual) {
      stats.codeOnly.names.push(style.name);
      stats.codeOnly.ids.push(style.id);
      return;
    }
    stats.metaOnly.names.push(reportNameChange(oldStyle, style));
    stats.metaOnly.ids.push(style.id);
  }

  function done() {
    scrollTo(0, 0);
    const entries = Object.entries(stats);
    const numChanged = entries.reduce((sum, [, val]) =>
      sum + (val.dirty ? val.names.length : 0), 0);
    const report = entries.map(renderStats).filter(Boolean);
    messageBoxProxy.show({
      title: t('importReportTitle'),
      contents: $create('#import', report.length ? report : t('importReportUnchanged')),
      buttons: [t('confirmClose'), numChanged && t('undo')],
      onshow: bindClick,
      className: 'center',
    })
      .then(({button}) => {
        if (button === 1) {
          undo();
        }
      });
  }

  function renderStats([id, {ids, names, legend, isOptions}]) {
    return names.length &&
      $create('details', {dataset: {id}, open: isOptions}, [
        $create('summary',
          $create('b', (isOptions ? '' : names.length + ' ') + t(legend))),
        $create('small',
          names.map(ids ? listItemsWithId : isOptions ? listOptions : listItems, ids)),
        isOptions && names.some(_ => _.isValid) &&
        $create('button', {onclick: importOptions}, t('importLabel')),
      ]);
  }

  function listOptions({name, isValid}) {
    return $create(isValid ? 'div' : 'del',
      name + (isValid ? '' : ` (${t(stats.invalid.legend)})`));
  }

  function listItems(name) {
    return $create('div', name);
  }

  /** @this stats.<item>.ids */
  function listItemsWithId(name, i) {
    return $create('div', {dataset: {id: this[i]}}, name);
  }

  async function importOptions() {
    const oldStorage = await chromeSync.get();
    for (const {name, val, isValid, isPref} of stats.options.names) {
      if (isValid) {
        if (isPref) {
          prefs.set(name, val);
        } else {
          chromeSync.setLZValue(name, val);
        }
      }
    }
    const label = this.textContent;
    this.textContent = t('undo');
    this.onclick = async () => {
      const curKeys = Object.keys(await chromeSync.get());
      const keysToRemove = curKeys.filter(k => !oldStorage.hasOwnProperty(k));
      await chromeSync.set(oldStorage);
      await chromeSync.remove(keysToRemove);
      this.textContent = label;
      this.onclick = importOptions;
    };
  }

  function undo() {
    const newIds = [
      ...stats.metaAndCode.ids,
      ...stats.metaOnly.ids,
      ...stats.codeOnly.ids,
      ...stats.added.ids,
    ];
    let tasks = Promise.resolve();
    for (const id of newIds) {
      tasks = tasks.then(() => API.styles.delete(id));
      const oldStyle = oldStylesById.get(id);
      if (oldStyle) {
        tasks = tasks.then(() => API.styles.importMany([oldStyle]));
      }
    }
    // taskUI is superfast and updates style list only in this page,
    // which should account for 99.99999999% of cases, supposedly
    return tasks.then(() => messageBoxProxy.show({
      title: t('importReportUndoneTitle'),
      contents: newIds.length + ' ' + t('importReportUndone'),
      buttons: [t('confirmClose')],
    }));
  }

  function bindClick() {
    const highlightElement = event => {
      const styleElement = $('#style-' + event.target.dataset.id);
      if (styleElement) {
        scrollElementIntoView(styleElement);
        animateElement(styleElement);
      }
    };
    for (const block of $$('#message-box details')) {
      if (block.dataset.id !== 'invalid') {
        block.style.cursor = 'pointer';
        block.onclick = highlightElement;
      }
    }
  }

  function limitString(s, limit = 100) {
    return s.length <= limit ? s : s.substr(0, limit) + '...';
  }

  function reportNameChange(oldStyle, newStyle) {
    return newStyle.name !== oldStyle.name
      ? oldStyle.name + ' —> ' + newStyle.name
      : oldStyle.name;
  }
}

async function exportToFile() {
  await require(['/js/storage-util']);
  const data = [
    Object.assign({
      [prefs.STORAGE_KEY]: prefs.values,
    }, await chromeSync.getLZValues()),
    ...await API.styles.getAll(),
  ];
  const text = JSON.stringify(data, null, '  ');
  const type = 'application/json';
  $create('a', {
    href: URL.createObjectURL(new Blob([text], {type})),
    download: generateFileName(),
    type,
  }).dispatchEvent(new MouseEvent('click'));
  function generateFileName() {
    const today = new Date();
    const dd = ('0' + today.getDate()).substr(-2);
    const mm = ('0' + (today.getMonth() + 1)).substr(-2);
    const yyyy = today.getFullYear();
    return `stylus-${yyyy}-${mm}-${dd}.json`;
  }
}
