#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fse = require('fs-extra');
const glob = require('fast-glob');
const JSZip = require('jszip');
const chalk = require('chalk');
const {SKIP, transpileCss} = require('./util');

const DST = 'dist';
const ADD = [
  '*/**',
  '*.html',
  'LICENSE',
  'README.md',
  'privacy-policy.md',
];
const MANIFEST = 'manifest.json';
const sChrome = 'chrome';
const sChromeBeta = 'chrome-beta';
const sFirefox = 'firefox';

(async function build([target] = process.argv.slice(2)) {
  const tty = process.stdout.write.bind(process.stdout);
  const jobTitle = target ? `building as "${target}"` : 'building';
  tty(jobTitle);
  const mjStr = fs.readFileSync(MANIFEST, 'utf8');
  const cssFiles = [];
  // https://github.com/Stuk/jszip/issues/369
  const tzBug = target ? 0 : new Date().getTimezoneOffset() * 60000;
  let zip, addFile;
  if (!target) {
    zip = new JSZip();
    JSZip.defaults.date = new Date(Date.now() - tzBug);
    addFile = (path, body = fs.readFileSync(path), opts) => zip.file(path, body, opts);
  } else {
    fse.emptydirSync(DST);
    addFile = (path, text) => text
      ? fse.outputFileSync(DST + '/' + path, text, 'utf8')
      : fse.copySync(path, DST + '/' + path, {preserveTimestamps: true});
  }
  SKIP.push(MANIFEST);
  for (const e of glob.sync(ADD, {ignore: SKIP, stats: true, onlyFiles: true})) {
    const date = new Date(e.stats.mtime - tzBug);
    if (e.path.endsWith('.css') && !e.path.startsWith('vendor')) {
      cssFiles.push([e.path, fs.readFileSync(e.path, 'utf8'), {date}]);
    } else {
      addFile(e.path, undefined, {date});
    }
  }
  let buf;
  for (const suffix of target ? [target] : [sFirefox, sChrome, sChromeBeta]) {
    const mj = patchManifest(mjStr, suffix);
    const zipName = zip && `stylus-${suffix}-${mj.version}.zip`;
    if (zip) tty(`\r${jobTitle} ${zipName}`);
    if (buf) zip = await zip.loadAsync(buf); // reusing the already compressed data
    if (target || suffix !== sChromeBeta) { // reusing sChrome in sChromeBeta
      tty(', transpiling CSS');
      for await (const args of transpileCss(cssFiles, suffix === sFirefox, mj)) {
        addFile(...args);
        tty('.');
      }
    } else {
      tty('...');
    }
    addFile(MANIFEST, JSON.stringify(mj, null, 2));
    if (zip) {
      buf = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
      fs.writeFileSync(zipName, buf);
    }
    console.log(chalk.green(' OK'));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

function patchManifest(str, suffix) {
  const mj = JSON.parse(str);
  delete mj.key;
  if (suffix === sChrome) {
    delete mj.browser_specific_settings;
  } else if (suffix === sChromeBeta) {
    delete mj.browser_specific_settings;
    mj.name = 'Stylus (beta)';
  } else if (suffix === sFirefox) {
    for (const list of [
      mj.background.scripts,
      mj.content_scripts[0].js,
    ]) {
      const i = list.indexOf('js/browser.js');
      if (i >= 0) { list.splice(i, 1); break; }
    }
    mj.options_ui = {
      /*
       * Linking to dashboard, not to options, because this is aimed at users who removed the icon
       * from the toolbar (they rarely use Stylus) so they visit about:addons instead.
       */
      page: 'manage.html',
      open_in_tab: true,
    };
  }
  return mj;
}
