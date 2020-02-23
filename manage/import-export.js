/* global messageBox styleSectionsEqual API onDOMready
  tryJSONparse scrollElementIntoView $ $$ API $create t animateElement
  styleJSONseemsValid */
'use strict';

const STYLISH_DUMP_FILE_EXT = '.txt';
const STYLUS_BACKUP_FILE_EXT = '.json';

onDOMready().then(() => {
  $('#file-all-styles').onclick = event => {
    event.preventDefault();
    exportToFile();
  };
  $('#unfile-all-styles').onclick = event => {
    event.preventDefault();
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
});

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
          if (maybeUsercss) {
            messageBox.alert(t('dragDropUsercssTabstrip'));
            return;
          }
          importFromString(text).then(numStyles => {
            document.body.style.cursor = '';
            resolve(numStyles);
          });
        };
        fReader.readAsText(file, 'utf-8');
      }
    }
  });
}


function importFromString(jsonString) {
  const json = tryJSONparse(jsonString);
  if (!Array.isArray(json)) {
    return Promise.reject(new Error('the backup is not a valid JSON file'));
  }
  let oldStyles;
  let oldStylesById;
  let oldStylesByName;
  const stats = {
    added:       {names: [], ids: [], legend: 'importReportLegendAdded'},
    unchanged:   {names: [], ids: [], legend: 'importReportLegendIdentical'},
    metaAndCode: {names: [], ids: [], legend: 'importReportLegendUpdatedBoth'},
    metaOnly:    {names: [], ids: [], legend: 'importReportLegendUpdatedMeta'},
    codeOnly:    {names: [], ids: [], legend: 'importReportLegendUpdatedCode'},
    invalid:     {names: [], legend: 'importReportLegendInvalid'},
  };

  return API.getAllStyles().then(styles => {
    // make a copy of the current database, that may be used when we want to
    // undo
    oldStyles = styles;
    oldStylesById = new Map(
      oldStyles.map(style => [style.id, style]));
    oldStylesByName = json.length && new Map(
      oldStyles.map(style => [style.name.trim(), style]));

    const items = [];
    json.forEach((item, i) => {
      const info = analyze(item, i);
      if (info) {
        items.push({info, item});
      }
    });
    return API.importManyStyles(items.map(i => i.item))
      .then(styles => {
        for (let i = 0; i < styles.length; i++) {
          updateStats(styles[i], items[i].info);
        }
      });
  })
    .then(done);

  function analyze(item, index) {
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
    const numChanged = stats.metaAndCode.names.length +
      stats.metaOnly.names.length +
      stats.codeOnly.names.length +
      stats.added.names.length;
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
      onshow: bindClick,
    })
      .then(({button}) => {
        if (button === 1) {
          undo();
        }
      });
    return Promise.resolve(numChanged);
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
      tasks = tasks.then(() => API.deleteStyle(id));
      const oldStyle = oldStylesById.get(id);
      if (oldStyle) {
        tasks = tasks.then(() => API.importStyle(oldStyle));
      }
    }
    // taskUI is superfast and updates style list only in this page,
    // which should account for 99.99999999% of cases, supposedly
    return tasks.then(() => messageBox({
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


function exportToFile() {
  API.getAllStyles().then(styles => {
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
}
