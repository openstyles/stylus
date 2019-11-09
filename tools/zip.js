#!/usr/bin/env node
'use strict';

const fs = require('fs');
const archiver = require('archiver');

function createZip() {
  const fileName = 'stylus.zip';
  const exclude = [
    '.*', // dot files/folders (glob, not regexp)
    'vendor/codemirror/lib/**', // get unmodified copy from node_modules
    'node_modules/**',
    'tools/**',
    'package.json',
    'package-lock.json',
    'yarn.lock',
    '*.zip',
    '*.map'
  ];

  const file = fs.createWriteStream(fileName);
  const archive = archiver('zip');
  return new Promise((resolve, reject) => {
    archive.on('finish', () => {
      resolve();
    });
    archive.on('warning', err => {
      if (err.code === 'ENOENT') {
        console.log('\x1b[33m%s\x1b[0m', 'Warning', err.message);
      } else {
        reject();
        throw err;
      }
    });
    archive.on('error', err => {
      reject();
      throw err;
    });

    archive.pipe(file);
    archive.glob('**', {ignore: exclude});
    // Don't use modified codemirror.js (see "update-libraries.js")
    archive.directory('node_modules/codemirror/lib', 'vendor/codemirror/lib');
    archive.finalize();
  });
}

createZip()
  .then(() => console.log('\x1b[32m%s\x1b[0m', 'Stylus zip complete'))
  .catch(err => {
    throw err;
  });
