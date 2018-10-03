/* global messageBox handleUpdate handleDelete applyOnMessage styleSectionsEqual */
'use strict';

const STYLISH_DUMP_FILE_EXT = '.txt';
const STYLUS_BACKUP_FILE_EXT = '.json';


function importFromFile({fileTypeFilter, file} = {}) {
  return new Promise(resolve => {
    const fileInput = document.createElement('input');
    if (file) {
      readFile();
      return;
    }
    fileInput.style.display = 'none';
    fileInput.type = 'file';
    fileInput.accept = fileTypeFilter || STYLISH_DUMP_FILE_EXT;
    fileInput.acceptCharset = 'utf-8';

    document.body.appendChild(fileInput);
    fileInput.initialValue = fileInput.value;
    fileInput.onchange = readFile;
    fileInput.click();

    function readFile() {
      if (file || fileInput.value !== fileInput.initialValue) {
        file = file || fileInput.files[0];
        if (file.size > 100e6) {
          console.warn("100MB backup? I don't believe you.");
          importFromString('').then(resolve);
          return;
        }
        document.body.style.cursor = 'wait';
        const fReader = new FileReader();
        fReader.onloadend = event => {
          fileInput.remove();
          const text = event.target.result;
          const maybeUsercss = !/^[\s\r\n]*\[/.test(text) &&
            (text.includes('==UserStyle==') || /==UserStyle==/i.test(text));
          (!maybeUsercss ?
            importFromString(text) :
            getOwnTab().then(tab => {
              tab.url = URL.createObjectURL(new Blob([text], {type: 'text/css'}));
              return API.installUsercss({direct: true, tab})
                .then(() => URL.revokeObjectURL(tab.url));
            })
          ).then(numStyles => {
            document.body.style.cursor = '';
            resolve(numStyles);
          });
        };
        fReader.readAsText(file, 'utf-8');
      }
    }
  });
}


function importFromString(jsonString, oldStyles) {
  if (!oldStyles) {
    return API.getStyles().then(styles => importFromString(jsonString, styles));
  }
  const json = tryJSONparse(jsonString) || [];
  if (typeof json.slice !== 'function') {
    json.length = 0;
  }
  const oldStylesById = new Map(
    oldStyles.map(style => [style.id, style]));
  const oldStylesByName = json.length && new Map(
    oldStyles.map(style => [style.name.trim(), style]));

  const stats = {
    added:       {names: [], ids: [], legend: 'importReportLegendAdded'},
    unchanged:   {names: [], ids: [], legend: 'importReportLegendIdentical'},
    metaAndCode: {names: [], ids: [], legend: 'importReportLegendUpdatedBoth'},
    metaOnly:    {names: [], ids: [], legend: 'importReportLegendUpdatedMeta'},
    codeOnly:    {names: [], ids: [], legend: 'importReportLegendUpdatedCode'},
    invalid:     {names: [], legend: 'importReportLegendInvalid'},
  };

  let index = 0;
  let lastRenderTime = performance.now();
  const renderQueue = [];
  const RENDER_NAP_TIME_MAX = 1000; // ms
  const RENDER_QUEUE_MAX = 50; // number of styles
  const SAVE_OPTIONS = {reason: 'import', notify: false};

  return new Promise(proceed);

  function proceed(resolve) {
    while (index < json.length) {
      const item = json[index++];
      const info = analyze(item);
      if (info) {
        // using saveStyle directly since json was parsed in background page context
        return API.saveStyle(Object.assign(item, SAVE_OPTIONS))
          .then(style => account({style, info, resolve}));
      }
    }
    renderQueue.forEach(style => handleUpdate(style, {reason: 'import'}));
    renderQueue.length = 0;
    done(resolve);
  }

  function analyze(item) {
    if (typeof item !== 'object' ||
        !item ||
        !item.name ||
        !item.name.trim() ||
        (item.sections && !Array.isArray(item.sections))) {
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
        item.id = null;
      }
    }
    if (!oldStyle && byName) {
      item.id = byName.id;
      oldStyle = byName;
    }
    const oldStyleKeys = oldStyle && Object.keys(oldStyle);
    const metaEqual = oldStyleKeys &&
      oldStyleKeys.length === Object.keys(item).length &&
      oldStyleKeys.every(k => k === 'sections' || oldStyle[k] === item[k]);
    const codeEqual = oldStyle && styleSectionsEqual(oldStyle, item);
    if (metaEqual && codeEqual) {
      stats.unchanged.names.push(oldStyle.name);
      stats.unchanged.ids.push(oldStyle.id);
      return;
    }
    return {oldStyle, metaEqual, codeEqual};
  }

  function sameStyle(oldStyle, newStyle) {
    return oldStyle.name.trim() === newStyle.name.trim() ||
      ['updateUrl', 'originalMd5', 'originalDigest']
        .some(field => oldStyle[field] && oldStyle[field] === newStyle[field]);
  }

  function account({style, info, resolve}) {
    renderQueue.push(style);
    if (performance.now() - lastRenderTime > RENDER_NAP_TIME_MAX
    || renderQueue.length > RENDER_QUEUE_MAX) {
      renderQueue.forEach(style => handleUpdate(style, {reason: 'import'}));
      setTimeout(scrollElementIntoView, 0, $('#style-' + renderQueue.pop().id));
      renderQueue.length = 0;
      lastRenderTime = performance.now();
    }
    setTimeout(proceed, 0, resolve);
    const {oldStyle, metaEqual, codeEqual} = info;
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

  function done(resolve) {
    const numChanged = stats.metaAndCode.names.length +
      stats.metaOnly.names.length +
      stats.codeOnly.names.length +
      stats.added.names.length;
    Promise.resolve(numChanged && API.refreshAllTabs()).then(() => {
      const report = Object.keys(stats)
        .filter(kind => stats[kind].names.length)
        .map(kind => {
          const {ids, names, legend} = stats[kind];
          const listItemsWithId = (name, i) =>
            $create('div', {dataset: {id: ids[i]}}, name);
          const listItems = name =>
            $create('div', name);
          const block =
            $create('details', {dataset: {id: kind}}, [
              $create('summary',
                $create('b', names.length + ' ' + t(legend))),
              $create('small',
                names.map(ids ? listItemsWithId : listItems)),
            ]);
          return block;
        });
      scrollTo(0, 0);
      messageBox({
        title: t('importReportTitle'),
        contents: report.length ? report : t('importReportUnchanged'),
        buttons: [t('confirmClose'), numChanged && t('undo')],
        onshow:  bindClick,
      }).then(({button}) => {
        if (button === 1) {
          undo();
        }
      });
      resolve(numChanged);
    });
  }

  function undo() {
    const newIds = [
      ...stats.metaAndCode.ids,
      ...stats.metaOnly.ids,
      ...stats.codeOnly.ids,
      ...stats.added.ids,
    ];
    let tasks = Promise.resolve();
    let tasksUI = Promise.resolve();
    for (const id of newIds) {
      tasks = tasks.then(() => API.deleteStyle({id, notify: false}));
      tasksUI = tasksUI.then(() => handleDelete(id));
      const oldStyle = oldStylesById.get(id);
      if (oldStyle) {
        Object.assign(oldStyle, SAVE_OPTIONS);
        tasks = tasks.then(() => API.saveStyle(oldStyle));
        tasksUI = tasksUI.then(() => handleUpdate(oldStyle, {reason: 'import'}));
      }
    }
    // taskUI is superfast and updates style list only in this page,
    // which should account for 99.99999999% of cases, supposedly
    return tasks
      .then(tasksUI)
      .then(API.refreshAllTabs)
      .then(() => messageBox({
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


$('#file-all-styles').onclick = () => {
  API.getStyles().then(styles => {
    // https://crbug.com/714373
    document.documentElement.appendChild(
      $create('iframe', {
        onload() {
          const text = JSON.stringify(styles, null, '\t');
          const type = 'application/json';
          this.onload = null;
          this.contentDocument.body.appendChild(
            $create('a', {
              href: URL.createObjectURL(new Blob([text], {type})),
              download: generateFileName(),
              type,
            })
          ).dispatchEvent(new MouseEvent('click'));
        },
        // we can't use display:none as some browsers are ignoring such iframes
        style: `
          all: unset;
          width: 0;
          height: 0;
          position: fixed;
          opacity: 0;
          border: none;
          `.replace(/;/g, '!important;'),
      })
    );
    // we don't remove the iframe or the object URL because the browser may show
    // a download dialog and we don't know how long it'll take until the user confirms it
    // (some browsers like Vivaldi can't download if we revoke the URL)
  });

  function generateFileName() {
    const today = new Date();
    const dd = ('0' + today.getDate()).substr(-2);
    const mm = ('0' + (today.getMonth() + 1)).substr(-2);
    const yyyy = today.getFullYear();
    return `stylus-${yyyy}-${mm}-${dd}${STYLUS_BACKUP_FILE_EXT}`;
  }
};


$('#unfile-all-styles').onclick = () => {
  importFromFile({fileTypeFilter: STYLUS_BACKUP_FILE_EXT});
};

Object.assign(document.body, {
  ondragover(event) {
    const hasFiles = event.dataTransfer.types.includes('Files');
    event.dataTransfer.dropEffect = hasFiles || event.target.type === 'search' ? 'copy' : 'none';
    this.classList.toggle('dropzone', hasFiles);
    if (hasFiles) {
      event.preventDefault();
      clearTimeout(this.fadeoutTimer);
      this.classList.remove('fadeout');
    }
  },
  ondragend() {
    animateElement(this, {className: 'fadeout', removeExtraClasses: ['dropzone']}).then(() => {
      this.style.animationDuration = '';
    });
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
    this.ondragend();
    if (event.dataTransfer.files.length) {
      event.preventDefault();
      if ($('#only-updates input').checked) {
        $('#only-updates input').click();
      }
      importFromFile({file: event.dataTransfer.files[0]});
    }
  },
});
