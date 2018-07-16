/* global messageBox */
'use strict';

onDOMready().then(_ => {
    zip.workerScriptsPath = "/vendor/zipjs/";
});

function createZipFileFromText(filename, text) {
    return new Promise((resolve, reject) => {
        // use a BlobWriter to store the zip into a Blob object
        zip.createWriter(new zip.BlobWriter('application/zip'), writer => {
            // use a TextReader to read the String to add
            writer.add(filename, new zip.TextReader(text), function () {
                // close the zip writer
                writer.close(blob => {
                    // blob contains the zip file as a Blob object
                    resolve(blob);
                });
            });
        }, error => reject(error));
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
        }, error => reject(error))
    });
}
