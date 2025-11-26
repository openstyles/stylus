'use strict';
const fs = require('fs');
const {SRC} = require('./util');

process.stdout.write('Sorting:');
let num = 0;
const LOCALES_DIR = SRC + '_locales/';
for (const dir of fs.readdirSync(LOCALES_DIR)) {
  try {
    const fpath = LOCALES_DIR + dir + '/messages.json';
    const orig = fs.readFileSync(fpath, 'utf8');
    const sorted = Object.entries(JSON.parse(orig)).sort(([a], [b]) => a < b ? -1 : a > b);
    let res = JSON.stringify(Object.fromEntries(sorted), null, 2) + '\n';
    if (orig.includes('\r\n')) res = res.replaceAll('\n', '\r\n');
    if (res.trim() !== orig.trim()) {
      fs.writeFileSync(fpath, res, 'utf8');
      process.stdout.write(' ' + dir);
      num++;
    }
  } catch (err) {
    console.error(err.message);
  }
}
console.log(`, ${num} total`);
