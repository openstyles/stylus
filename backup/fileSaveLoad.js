/* global messageBox, handleUpdate */
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
          importFromString(event.target.result).then(numStyles => {
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
  if (!BG) {
    onBackgroundReady().then(() => importFromString(jsonString));
    return;
  }
  const json = BG.tryJSONparse(jsonString) || []; // create object in background context
  if (typeof json.slice != 'function') {
    json.length = 0;
  }
  const oldStyles = json.length && BG.deepCopy(BG.cachedStyles.list || []);
  const oldStylesByName = json.length && new Map(
    oldStyles.map(style => [style.name.trim(), style]));
  const stats = {
    added: {names: [], ids: [], legend: 'importReportLegendAdded'},
    unchanged: {names: [], ids: [], legend: 'importReportLegendIdentical'},
    metaAndCode: {names: [], ids: [], legend: 'importReportLegendUpdatedBoth'},
    metaOnly: {names: [], ids: [], legend: 'importReportLegendUpdatedMeta'},
    codeOnly: {names: [], ids: [], legend: 'importReportLegendUpdatedCode'},
    invalid: {names: [], legend: 'importReportLegendInvalid'},
  };
  let index = 0;
  let lastRenderTime = performance.now();
  const renderQueue = [];
  const RENDER_NAP_TIME_MAX = 1000; // ms
  const RENDER_QUEUE_MAX = 50; // number of styles
  return new Promise(proceed);

  function proceed(resolve) {
    while (index < json.length) {
      const item = json[index++];
      if (!item || !item.name || !item.name.trim() || typeof item != 'object'
      || (item.sections && typeof item.sections.slice != 'function')) {
        stats.invalid.names.push(`#${index}: ${limitString(item && item.name || '')}`);
        continue;
      }
      item.name = item.name.trim();
      const byId = BG.cachedStyles.byId.get(item.id);
      const byName = oldStylesByName.get(item.name);
      const oldStyle = byId && byId.name.trim() == item.name || !byName ? byId : byName;
      if (oldStyle == byName && byName) {
        item.id = byName.id;
      }
      const oldStyleKeys = oldStyle && Object.keys(oldStyle);
      const metaEqual = oldStyleKeys &&
        oldStyleKeys.length == Object.keys(item).length &&
        oldStyleKeys.every(k => k == 'sections' || oldStyle[k] === item[k]);
      const codeEqual = oldStyle && BG.styleSectionsEqual(oldStyle, item);
      if (metaEqual && codeEqual) {
        stats.unchanged.names.push(oldStyle.name);
        stats.unchanged.ids.push(oldStyle.id);
        continue;
      }
      // using saveStyle directly since json was parsed in background page context
      BG.saveStyle(Object.assign(item, {
        reason: 'import',
        notify: false,
      })).then(style => {
        renderQueue.push(style);
        if (performance.now() - lastRenderTime > RENDER_NAP_TIME_MAX
        || renderQueue.length > RENDER_QUEUE_MAX) {
          renderQueue.forEach(style => handleUpdate(style, {reason: 'import'}));
          setTimeout(scrollElementIntoView, 0, $('#style-' + renderQueue.pop().id));
          renderQueue.length = 0;
          lastRenderTime = performance.now();
        }
        setTimeout(proceed, 0, resolve);
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
      });
      return;
    }
    renderQueue.forEach(style => handleUpdate(style, {reason: 'import'}));
    renderQueue.length = 0;
    done(resolve);
  }

  function done(resolve) {
    const numChanged = stats.metaAndCode.names.length +
      stats.metaOnly.names.length +
      stats.codeOnly.names.length +
      stats.added.names.length;
    Promise.resolve(numChanged && BG.refreshAllTabs()).then(() => {
      const report = Object.keys(stats)
        .filter(kind => stats[kind].names.length)
        .map(kind => {
          const {ids, names, legend} = stats[kind];
          const listItemsWithId = (name, i) =>
            $element({dataset: {id: ids[i]}, textContent: name});
          const listItems = name =>
            $element({textContent: name});
          const block =
            $element({tag: 'details', dataset: {id: kind}, appendChild: [
              $element({tag: 'summary', appendChild:
                $element({tag: 'b', textContent: names.length + ' ' + t(legend)})
              }),
              $element({tag: 'small', appendChild:
                names.map(ids ? listItemsWithId : listItems)
              }),
            ]});
          return block;
        });
      scrollTo(0, 0);
      messageBox({
        title: t('importReportTitle'),
        contents: report.length ? report : t('importReportUnchanged'),
        buttons: [t('confirmOK'), numChanged && t('undo')],
        onshow:  bindClick,
      }).then(({button, enter, esc}) => {
        if (button == 1) {
          undo();
        }
      });
      resolve(numChanged);
    });
  }

  function undo() {
    const oldStylesById = new Map(oldStyles.map(style => [style.id, style]));
    const newIds = [
      ...stats.metaAndCode.ids,
      ...stats.metaOnly.ids,
      ...stats.codeOnly.ids,
      ...stats.added.ids,
    ];
    index = 0;
    return new Promise(undoNextId)
      .then(BG.refreshAllTabs)
      .then(() => messageBox({
        title: t('importReportUndoneTitle'),
        contents: newIds.length + ' ' + t('importReportUndone'),
        buttons: [t('confirmOK')],
      }));
    function undoNextId(resolve) {
      if (index == newIds.length) {
        resolve();
        return;
      }
      const id = newIds[index++];
      deleteStyleSafe({id, notify: false}).then(id => {
        const oldStyle = oldStylesById.get(id);
        if (oldStyle) {
          saveStyleSafe(Object.assign(oldStyle, {
            reason: 'import',
            notify: false,
          })).then(() =>
            setTimeout(undoNextId, 0, resolve));
        } else {
          setTimeout(undoNextId, 0, resolve);
        }
      });
    }
  }

  function bindClick(box) {
    const highlightElement = event => {
      const styleElement = $('#style-' + event.target.dataset.id);
      if (styleElement) {
        scrollElementIntoView(styleElement);
        animateElement(styleElement, {className: 'highlight'});
      }
    };
    for (const block of $$('details')) {
      if (block.dataset.id != 'invalid') {
        block.style.cursor = 'pointer';
        block.onclick = highlightElement;
      }
    }
  }

  function limitString(s, limit = 100) {
    return s.length <= limit ? s : s.substr(0, limit) + '...';
  }

  function reportNameChange(oldStyle, newStyle) {
    return newStyle.name != oldStyle.name
      ? oldStyle.name + ' —> ' + newStyle.name
      : oldStyle.name;
  }
}


$('#file-all-styles').onclick = () => {
  getStylesSafe().then(styles => {
    const text = JSON.stringify(styles, null, '\t');
    const fileName = generateFileName();

    const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    // for long URLs; https://github.com/schomery/stylish-chrome/issues/13#issuecomment-284582600
    fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.setAttribute('download', fileName);
      a.setAttribute('href', URL.createObjectURL(blob));
      a.dispatchEvent(new MouseEvent('click'));
    });
  });

  function generateFileName() {
    const today = new Date();
    const dd = ('0' + today.getDate()).substr(-2);
    const mm = ('0' + (today.getMonth() + 1)).substr(-2);
    const yyyy = today.getFullYear();
    return `stylus-${mm}-${dd}-${yyyy}${STYLUS_BACKUP_FILE_EXT}`;
  }
};


$('#unfile-all-styles').onclick = () => {
  importFromFile({fileTypeFilter: STYLUS_BACKUP_FILE_EXT});
};

Object.assign(document.body, {
  ondragover(event) {
    const hasFiles = event.dataTransfer.types.includes('Files');
    event.dataTransfer.dropEffect = hasFiles || event.target.type == 'search' ? 'copy' : 'none';
    this.classList.toggle('dropzone', hasFiles);
    if (hasFiles) {
      event.preventDefault();
      clearTimeout(this.fadeoutTimer);
      this.classList.remove('fadeout');
    }
  },
  ondragend(event) {
    animateElement(this, {className: 'fadeout'}).then(() => {
      this.style.animationDuration = '';
      this.classList.remove('dropzone');
    });
  },
  ondragleave(event) {
    // Chrome sets screen coords to 0 on Escape key pressed or mouse out of document bounds
    if (!event.screenX && !event.screenX) {
      this.ondragend();
    }
  },
  ondrop(event) {
    this.ondragend();
    if (event.dataTransfer.files.length) {
      event.preventDefault();
      importFromFile({file: event.dataTransfer.files[0]});
    }
  },
});
