#!/usr/bin/env node
'use strict';

const fs = require('fs');
const JSZip = require('jszip');
const {MANIFEST, SRC} = require('./util');
const KEY = require(SRC + MANIFEST).key;
// https://github.com/Stuk/jszip/issues/369
const tzBug = new Date().getTimezoneOffset() * 60000;

(async (zipFilePath = process.argv.slice(2)) => {
  JSZip.defaults.date = new Date(Date.now() - tzBug);
  for (const filePath of zipFilePath) {
    const zip = await JSZip().loadAsync(fs.readFileSync(filePath));
    const mjStr = await zip.files[MANIFEST].async('text');
    const mj = JSON.parse(mjStr);
    mj.key = KEY;
    zip.file(MANIFEST, JSON.stringify(mj, null, 2));
    fs.writeFileSync(filePath.replace(/\.zip$/, '-id$&'),
      await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
