'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const {SRC} = require('./util');

const DIR = SRC + '_locales/';
const RX_LNG_CODE = /^\w\w(_\w{2,3})?$/; // like `en` or `en_GB`

const ARG = process.argv[2];
const COMMIT_CMD = ARG === 'commit' && `git commit -m "update locales" ${DIR}`;

const makeFileName = lng => `${DIR}${lng}/messages.json`;
const readLngJson = lng => JSON.parse(
  fs.readFileSync(makeFileName(lng), 'utf8')
    .replace(/\busercss\b/gi, 'UserCSS')
);
const sortAlpha = ([a], [b]) => a < b ? -1 : a > b;

const src = readLngJson('en');
for (const val of Object.values(src)) {
  const {placeholders} = val;
  if (placeholders) {
    const sorted = {};
    for (const [k, v] of Object.entries(placeholders).sort(sortAlpha)) {
      sorted[k] = v;
    }
    val.placeholders = sorted;
  }
}

let numTotal = 0;
let numFixed = 0;

for (const /**@type Dirent*/ entry of fs.readdirSync(DIR, {withFileTypes: true})) {
  const lng = entry.name;
  if (lng !== 'en' && entry.isDirectory() && RX_LNG_CODE.test(lng)) {
    numFixed += fixLngFile(lng) ? 1 : 0;
    numTotal++;
  }
}
console.log(`${numFixed} files fixed out of ${numTotal}`);

if (COMMIT_CMD) try {
  childProcess.execSync(COMMIT_CMD, {stdio: 'inherit'});
} catch {}

function fixLngFile(lng) {
  let numUnknown = 0;
  let numUntranslated = 0;
  let numVarsFixed = 0;
  const json = readLngJson(lng);
  const res = {};
  for (const [key, val] of Object.entries(json).sort(sortAlpha)) {
    const {placeholders, message} = src[key] || {};
    if (!message) {
      numUnknown++;
    } else if (!val.message || val.message === message) {
      numUntranslated++;
    } else {
      delete val.description;
      if (placeholders && !val.placeholders) {
        numVarsFixed++;
        val.placeholders = placeholders;
      }
      res[key] = val;
    }
  }
  const jsonStr = JSON.stringify(json, null, 2);
  const resStr = JSON.stringify(res, null, 2);
  if (resStr !== jsonStr) {
    let err;
    if (resStr === '{}') {
      fs.rmSync(`${DIR}${lng}`, {recursive: true, force: true});
      err = 'no translations -> deleted';
    } else {
      fs.writeFileSync(makeFileName(lng), resStr + '\n', 'utf8');
      err = [
        numUnknown && `${numUnknown} unknown (dropped)`,
        numUntranslated && `${numUntranslated} untranslated (dropped)`,
        numVarsFixed && `${numVarsFixed} missing placeholders (restored)`,
      ].filter(Boolean).join(', ');
    }
    if (err) console.log(`${lng}: ${err}`);
    return err;
  }
}
