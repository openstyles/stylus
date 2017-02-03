'use strict';

var STYLISH_DUMP_FILE_EXT     = '.txt';
var STYLISH_DEFAULT_SAVE_NAME = 'stylus-mm-dd-yyy' + STYLISH_DUMP_FILE_EXT;

function saveAsFile (text, fileName, dialog) {
  fileName = fileName || STYLISH_DEFAULT_SAVE_NAME;
  dialog = typeof dialog === 'boolean' ? dialog : true;

  return new Promise(function (resolve) {
    var fileContent = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    chrome.downloads.download({
      filename: fileName,
      saveAs: true,
      url: fileContent
    }, resolve);
  });
}

/**
 * !!works only when page has representation - backgound page won't work
 *
 * opens open file dialog,
 * gets selected file,
 * gets it's path,
 * gets content of it by ajax
 */
function loadFromFile (formatToFilter) {
  return new Promise(function (resolve) {
    var fileInput = document.createElement('input');
    fileInput.style = 'display: none;';
    fileInput.type = 'file';
    fileInput.accept = formatToFilter || STYLISH_DUMP_FILE_EXT;
    fileInput.acceptCharset = 'utf-8';

    document.body.appendChild(fileInput);
    fileInput.initialValue = fileInput.value;
    function changeHandler() {
      if (fileInput.value !== fileInput.initialValue) {
        var fReader = new FileReader();
        fReader.onloadend = function (event) {
          fileInput.removeEventListener('change', changeHandler);
          fileInput.remove();
          resolve(event.target.result);
        };
        fReader.readAsText(fileInput.files[0], 'utf-8');
      }
    }
    fileInput.addEventListener('change', changeHandler);
    fileInput.click();
  });
}
