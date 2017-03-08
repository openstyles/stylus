/* globals getStyles, saveStyle */
'use strict';

var STYLISH_DUMP_FILE_EXT = '.txt';
var STYLISH_DUMPFILE_EXTENSION = '.json';
var STYLISH_DEFAULT_SAVE_NAME = 'stylus-mm-dd-yyyy' + STYLISH_DUMP_FILE_EXT;

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

document.getElementById('file-all-styles').addEventListener('click', function () {
  getStyles({}, function (styles) {
    let text = JSON.stringify(styles);
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
});

document.getElementById('unfile-all-styles').addEventListener('click', function () {
  loadFromFile(STYLISH_DUMPFILE_EXTENSION).then(function (rawText) {
    var json = JSON.parse(rawText);
    var i = 0, nextStyle;

    function done() {
      window.alert(i + ' styles installed/updated');
      location.reload();
    }

    function proceed() {
      nextStyle = json[i++];
      if (nextStyle) {
        saveStyle(nextStyle, proceed);
      }
      else {
        i--;
        done();
      }
    }

    proceed();
  });
});
