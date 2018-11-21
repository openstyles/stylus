/* global zip onDOMready */
/* exported createZipFileFromText readZipFileFromBlob */
'use strict';

onDOMready().then(() => {
  zip.workerScriptsPath = '../vendor/zipjs-browserify/';
});

/**
 * @param {String} filename
 * @param {String} text content of the file as text
 * @returns {Promise<Blob>} resolves to a blob object representing the zip file
 */
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

/**
 * @param {Object} blob object of zip file
 * @returns {Promise<String>} resolves to a string the content of the first file of the zip
 */
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
