#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const glob = require('fast-glob');
const JSZip = require('jszip');
const chalk = require('chalk');
const {ROOT, MANIFEST} = require('./util');

const DST = ROOT + 'dist/';
const WEBPACK_CLI = 'webpack-cli --no-stats';
const ANY = 'any-';
const STRIP_RE = new RegExp(`^${ANY}`);
const TARGETS = [
  ANY + 'mv2',
  'chrome-mv3',
  'chrome-mv3-beta',
];

(async function build([targets] = process.argv.slice(2)) {
  // https://github.com/Stuk/jszip/issues/369
  const tzBug = new Date().getTimezoneOffset() * 60000;
  JSZip.defaults.date = new Date(Date.now() - tzBug);
  targets = targets ? targets.split(',') : TARGETS;
  for (const target of targets) {
    process.env.NODE_ENV = target.replace(STRIP_RE, '-') + ':zip';
    console.log(chalk.bgYellow.bold(`\nBuilding for ${target}...`));
    fse.emptyDirSync(DST);
    childProcess.execSync(WEBPACK_CLI, {stdio: 'inherit'});
    const mj = patchManifest(fs.readFileSync(DST + MANIFEST, 'utf8'), target);
    const zipName = `stylus-${target.replace(STRIP_RE, '')}-${mj.version}.zip`;
    const zip = new JSZip();
    process.stdout.write(chalk.bold(`Creating ${zipName}...`));
    for (const e of glob.sync(DST + '**', {
      ignore: [MANIFEST, '.*.html'],
      stats: true,
      onlyFiles: true,
    })) {
      zip.file(e.path.slice(DST.length),
        fs.readFileSync(e.path),
        {date: new Date(e.stats.mtime - tzBug)});
    }
    zip.file(MANIFEST, JSON.stringify(mj, null, 2));
    fs.writeFileSync(ROOT + zipName,
      await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}));
    console.log(chalk.green(' OK'));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

function patchManifest(str) {
  const mj = JSON.parse(str);
  delete mj.key;
  return mj;
}
