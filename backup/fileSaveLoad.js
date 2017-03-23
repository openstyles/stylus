/* globals getStyles, saveStyle, invalidateCache, refreshAllTabs, handleUpdate */
'use strict';

var STYLISH_DUMP_FILE_EXT = '.txt';
var STYLISH_DUMPFILE_EXTENSION = '.json';
var STYLISH_DEFAULT_SAVE_NAME = 'stylus-mm-dd-yyyy' + STYLISH_DUMP_FILE_EXT;

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
  const numStyles = json.length;

  if (numStyles) {
    invalidateCache(true);
  }

  return new Promise(resolve => {
    proceed();
    function proceed() {
      const nextStyle = json.shift();
      if (nextStyle) {
        saveStyle(nextStyle, {notify: false}).then(style => {
          handleUpdate(style, {reason: 'import'});
          setTimeout(proceed, 0);
        });
      } else {
        refreshAllTabs().then(() => {
          scrollTo(0, 0);
          setTimeout(alert, 100, numStyles + ' styles installed/updated');
          resolve(numStyles);
        });
      }
    }
  });
}

function generateFileName() {
  var today = new Date();
  var dd = '0' + today.getDate();
  var mm = '0' + (today.getMonth() + 1);
  var yyyy = today.getFullYear();

  dd = dd.substr(-2);
  mm = mm.substr(-2);

  today = mm + '-' + dd + '-' + yyyy;

  return 'stylus-' + today + STYLISH_DUMPFILE_EXTENSION;
}

document.getElementById('file-all-styles').onclick = () => {
  getStyles({}, function (styles) {
    let text = JSON.stringify(styles, null, '\t');
    let fileName = generateFileName() || STYLISH_DEFAULT_SAVE_NAME;

    let url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
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
};


document.getElementById('unfile-all-styles').onclick = () => {
  importFromFile({fileTypeFilter: STYLISH_DUMPFILE_EXTENSION});
};

const dropTarget = Object.assign(document.body, {
  ondragover: event => {
    const hasFiles = event.dataTransfer.types.includes('Files');
    event.dataTransfer.dropEffect = hasFiles || event.target.type == 'search' ? 'copy' : 'none';
    dropTarget.classList.toggle('dropzone', hasFiles);
    if (hasFiles) {
      event.preventDefault();
      clearTimeout(dropTarget.fadeoutTimer);
      dropTarget.classList.remove('fadeout');
    }
  },
  ondragend: event => {
    dropTarget.classList.add('fadeout');
    // transitionend event may not fire if the user switched to another tab so we'll use a timer
    clearTimeout(dropTarget.fadeoutTimer);
    dropTarget.fadeoutTimer = setTimeout(() => {
      dropTarget.classList.remove('dropzone', 'fadeout');
    }, 250);
  },
  ondragleave: event => {
    // Chrome sets screen coords to 0 on Escape key pressed or mouse out of document bounds
    if (!event.screenX && !event.screenX) {
      dropTarget.ondragend();
    }
  },
  ondrop: event => {
    if (event.dataTransfer.files.length) {
      event.preventDefault();
      importFromFile({file: event.dataTransfer.files[0]}).then(() => {
        dropTarget.classList.remove('dropzone');
      });
    } else {
      dropTarget.ondragend();
    }
  },
});
