/* globals getStyles, saveStyle, invalidateCache, refreshAllTabs */
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
        if (file.size > 100*1000*1000) {
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
  const json = runTryCatch(() => Array.from(JSON.parse(jsonString))) || [];
  const oldStyles = json.length && deepCopyStyles();
  const oldStylesByName = json.length && new Map(
    oldStyles.map(style => [style.name.trim(), style]));
  const stats = {
    added: {names: [], ids: [], legend: 'added'},
    unchanged: {names: [], ids: [], legend: 'identical skipped'},
    metaAndCode: {names: [], ids: [], legend: 'updated both meta info and code'},
    metaOnly: {names: [], ids: [], legend: 'updated meta info'},
    codeOnly: {names: [], ids: [], legend: 'updated code'},
    invalid: {names: [], legend: 'invalid skipped'},
  };
  let index = 0;
  return new Promise(proceed);

  function proceed(resolve) {
    while (index < json.length) {
      const item = json[index++];
      if (!item || !item.name || !item.name.trim() || typeof item != 'object'
      || (item.sections && !(item.sections instanceof Array))) {
        stats.invalid.names.push(`#${index}: ${limitString(item && item.name || '')}`);
        continue;
      }
      item.name = item.name.trim();
      const byId = (cachedStyles.byId.get(item.id) || {}).style;
      const byName = oldStylesByName.get(item.name);
      const oldStyle = byId && byId.name.trim() == item.name || !byName ? byId : byName;
      if (oldStyle == byName && byName) {
        item.id = byName.id;
      }
      const oldStyleKeys = oldStyle && Object.keys(oldStyle);
      const metaEqual = oldStyleKeys &&
        oldStyleKeys.length == Object.keys(item).length &&
        oldStyleKeys.every(k => k == 'sections' || oldStyle[k] === item[k]);
      const codeEqual = oldStyle && styleSectionsEqual(oldStyle, item);
      if (metaEqual && codeEqual) {
        stats.unchanged.names.push(oldStyle.name);
        stats.unchanged.ids.push(oldStyle.id);
        continue;
      }
      saveStyle(Object.assign(item, {
        reason: 'import',
        notify: false,
      })).then(style => {
        setTimeout(proceed, 0, resolve);
        if (!oldStyle) {
          stats.added.names.push(style.name);
          stats.added.ids.push(style.id);
        }
        else if (!metaEqual && !codeEqual) {
          stats.metaAndCode.names.push(reportNameChange(oldStyle, style));
          stats.metaAndCode.ids.push(style.id);
        }
        else if (!codeEqual) {
          stats.codeOnly.names.push(style.name);
          stats.codeOnly.ids.push(style.id);
        }
        else {
          stats.metaOnly.names.push(reportNameChange(oldStyle, style));
          stats.metaOnly.ids.push(style.id);
        }
      });
      return;
    }
    done(resolve);
  }

  function done(resolve) {
    const numChanged = stats.metaAndCode.names.length +
      stats.metaOnly.names.length +
      stats.codeOnly.names.length +
      stats.added.names.length;
    Promise.resolve(numChanged && refreshAllTabs()).then(() => {
      scrollTo(0, 0);
      const report = Object.keys(stats)
        .filter(kind => stats[kind].names.length)
        .map(kind => `<details data-id="${kind}">
            <summary><b>${stats[kind].names.length} ${stats[kind].legend}</b></summary>
            <small>` + stats[kind].names.map((name, i) =>
                `<div data-id="${stats[kind].ids[i]}">${name}</div>`).join('') + `
            </small>
          </details>`)
        .join('');
      messageBox({
        title: 'Finished importing styles',
        contents: report || 'Nothing was changed.',
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
      .then(refreshAllTabs)
      .then(() => messageBox({
        title: 'Import has been undone',
        contents: newIds.length + ' styles were reverted.',
        buttons: [t('confirmOK')],
      }));
    function undoNextId(resolve) {
      if (index == newIds.length) {
        resolve();
        return;
      }
      const id = newIds[index++];
      deleteStyle(id, {notify: false}).then(id => {
        const oldStyle = oldStylesById.get(id);
        if (oldStyle) {
          saveStyle(Object.assign(oldStyle, {
            reason: 'undoImport',
            notify: false,
          }))
            .then(() => setTimeout(undoNextId, 0, resolve));
        } else {
          setTimeout(undoNextId, 0, resolve);
        }
      });
    }
  }

  function bindClick(box) {
    for (let block of $$('details')) {
      if (block.dataset.id != 'invalid') {
        block.style.cursor = 'pointer';
        block.onclick = event => {
          const styleElement = $(`[style-id="${event.target.dataset.id}"]`);
          if (styleElement) {
            scrollElementIntoView(styleElement);
            animateElement(styleElement, {className: 'highlight'});
          }
        };
      }
    }
  }

  function deepCopyStyles() {
    const clonedStyles = [];
    for (let style of cachedStyles.list || []) {
      style = Object.assign({}, style);
      style.sections = style.sections.slice();
      for (let i = 0, section; (section = style.sections[i]); i++) {
        const copy = style.sections[i] = Object.assign({}, section);
        for (let propName in copy) {
          const prop = copy[propName];
          if (prop instanceof Array) {
            copy[propName] = prop.slice();
          }
        }
      }
      clonedStyles.push(style);
    }
    return clonedStyles;
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
  getStyles({}, function (styles) {
    const text = JSON.stringify(styles, null, '\t');
    const fileName = generateFileName();

    const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    // for long URLs; https://github.com/schomery/stylish-chrome/issues/13#issuecomment-284582600
    fetch(url)
    .then(res => res.blob())
    .then(blob => {
      let a = document.createElement('a');
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
