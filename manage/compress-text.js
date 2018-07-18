/* global messageBox */
'use strict';

onDOMready().then(() => {
  zip.workerScriptsPath = '/vendor/zipjs/';
});

function createZipFileFromText(filename, text) {
  return new Promise((resolve, reject) => {
    zip.createWriter(new zip.BlobWriter('application/zip'), writer => {
      writer.add(filename, new zip.TextReader(text), function () {
        writer.close(blob => {
          resolve(blob);
        });
      });
    }, reject);
  });
}

function readZipFileFromBlob(blob) {
  return new Promise((resolve, reject) => {
    zip.createReader(new zip.BlobReader(blob), zipReader => {
      zipReader.getEntries(entries => {
        entries[0].getData(new zip.BlobWriter('text/plain'), data => {
          zipReader.close();
          resolve(data);
        });
      });
    }, reject);
  });
}
