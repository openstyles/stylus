'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const chalk = require('chalk');
const {SRC} = require('./util');

const DIR = SRC + '_locales/';
const RX_LNG_CODE = /^\w\w(_\w{2,3})?$/; // like `en` or `en_GB`

const ARG = process.argv[2];
const COMMIT_CMD = ARG === 'commit' && `git commit -m "update locales" ${DIR}`;

const makeFileName = lng => `${DIR}${lng}/messages.json`;
const readLng = lng => fs.readFileSync(makeFileName(lng), 'utf8');
const sortAlpha = ([a], [b]) => a < b ? -1 : a > b;

const srcText = readLng('en');
const srcJson = JSON.parse(srcText);
const sortedSrcText = JSON.stringify(
  Object.fromEntries(Object.entries(srcJson).sort(sortAlpha)), null, 2) + '\n';
if (srcText !== sortedSrcText)
  fs.writeFileSync(makeFileName('en'), sortedSrcText, 'utf8');
for (const val of Object.values(srcJson)) {
  if (val.placeholders) {
    val.placeholdersStr = JSON.stringify(
      val.placeholders = Object.fromEntries(
        Object.entries(val.placeholders).sort(([, {content: a}], [, {content: b}]) =>
          a.slice(1) - b.slice(1) || (a < b ? -1 : a > b)
        )
      )
    );
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
  let numUntranslated = 0;
  let numVarsFixed = 0;
  const unknown = [];
  const text = readLng(lng);
  const json = JSON.parse(text);
  const res = {};
  for (const [key, val] of Object.entries(json).sort(sortAlpha)) {
    const src = srcJson[key] || {};
    const msg = val.message;
    if (!src.message) {
      unknown.push(`\n\t${chalk.bold(key)}: ${msg.length > 50 ? msg.slice(0, 50) + '...' : msg}`);
    } else if (!msg || msg === src.message) {
      numUntranslated++;
    } else {
      delete val.description;
      if (src.placeholdersStr && src.placeholdersStr !== JSON.stringify(val.placeholders)) {
        numVarsFixed++;
        val.placeholders = src.placeholders;
      }
      res[key] = val;
    }
  }
  const resStr = JSON.stringify(res, null, 2);
  if (numVarsFixed || numUntranslated || unknown.length || resStr.trim() !== text.trim()) {
    let err;
    if (resStr === '{}') {
      fs.rmSync(`${DIR}${lng}`, {recursive: true, force: true});
      err = 'no translations -> deleted';
    } else {
      fs.writeFileSync(makeFileName(lng), resStr + '\n', 'utf8');
      err = [
        unknown.length && chalk.magenta(`${unknown.length} unknown (dropped)`),
        numUntranslated && `${numUntranslated} untranslated (dropped)`,
        numVarsFixed && `${numVarsFixed} missing placeholders (restored)`,
      ].filter(Boolean).join(', ') + unknown.join('');
    }
    if (err) console.log(`${chalk.bold.red(lng)}: ${err}`);
    return err;
  }
}
