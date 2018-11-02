#!/usr/bin/env node
'use strict';

const fs = require('fs-extra');
const path = require('path');
const unzip = require('unzip');

const root = path.join(__dirname, '..');
const localeFolder = path.join(root, '_locales');
const tempFolder = path.join(root, '_temp');
const zipFile = path.join(root, 'github-7_Stylus_messages.zip');

/*
 * Download transifex zip file into the root folder before running this script
 * https://docs.transifex.com/projects/downloading-translations#downloading-a-zip-file-with-all-translation-files
*/

async function extractZip() {
  return new Promise((resolve, reject) => {
    try {
      fs
        .createReadStream(zipFile)
        .pipe(unzip.Extract({path: tempFolder}))
        .on('close', () => {
          resolve()
        });
    } catch (error) {
      reject();
    }
  });
}

async function getFileNames() {
  return new Promise((resolve, reject) => {
    fs.readdir(tempFolder, (error, data) => {
      if (error) {
        reject(error);
      } else {
        // en_US shouldn't ever get updated from Transifex
        resolve(data.filter(file => !file.includes('en_US')));
      }
    });
  });
}

async function updateMessage(localeFile) {
  // localeFile ~ "messages_en_GB.json" → en_GB/messages.json
  const data = await fs.readJson(path.join(tempFolder, localeFile));
  const localePath = path.join(localeFolder, localeFile.replace('messages_', '').replace('.json', ''));
  if (!fs.existsSync(localePath)) {
    fs.mkdirSync(localePath);
  }
  return fs.writeFile(
    path.join(localePath, '/', 'messages.json'),
    JSON.stringify(cleanup(data), null, 2) + '\n'
  );
}

// Remove unneeded descriptions
function cleanup(data) {
  Object.keys(data).forEach(entry => {
    if (data[entry].description) {
      delete data[entry].description;
    }
  });
  return data;
}

if (fs.existsSync(zipFile)) {
  extractZip()
    .then(() => getFileNames())
    .then(files => files.map(file => updateMessage(file)))
    .then(() => fs.remove(tempFolder))
    .catch(error => console.error(error));
} else {
  console.error('ERROR: Transifex zip file not found in the root folder');
}
