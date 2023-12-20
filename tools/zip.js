#!/usr/bin/env node
'use strict';

const fs = require('fs');
const glob = require('fast-glob');
const JSZip = require('jszip');

const sChrome = 'chrome';
const sChromeBeta = 'chrome-beta';
const sFirefox = 'firefox';

(async () => {
  const MANIFEST = 'manifest.json';
  const ADD = [
    '*/**',
    '*.html',
    'LICENSE',
    'README.md',
    'privacy-policy.md',
  ];
  const SKIP = [
    '.*', // dot files/folders (glob, not regexp)
    'node_modules',
    'tools',
  ];
  const mjStr = fs.readFileSync(MANIFEST, 'utf8');
  const cssFiles = [];
  const jobs = [];
  // https://github.com/Stuk/jszip/issues/369
  const tzBug = new Date().getTimezoneOffset() * 60000;
  JSZip.defaults.date = new Date(Date.now() - tzBug);
  // add all files except manifest.json
  let zip = new JSZip();
  for (const e of glob.sync(ADD, {ignore: SKIP, stats: true, onlyFiles: true})) {
    const bytes = fs.readFileSync(e.path);
    const date = new Date(e.stats.mtime - tzBug);
    let text;
    if (e.path.endsWith('.css') && (text = bytes.toString('utf8')).includes(':is(')) {
      cssFiles.push([e.path, date, text]);
    } else {
      zip.file(e.path, bytes, {date});
    }
  }
  let buf;
  // add a patched manifest.json for each zip reusing compressed data for all other files
  for (const suffix of [sChrome, sChromeBeta, sFirefox]) {
    if (buf) zip = await zip.loadAsync(buf);
    if (suffix !== sChromeBeta) patchCss(zip, cssFiles, suffix);
    const mj = patchManifest(mjStr, suffix);
    const fileName = `stylus-${suffix}-${mj.version}.zip`;
    zip.file(MANIFEST, JSON.stringify(mj, null, 2));
    buf = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    jobs.push(fs.promises.writeFile(fileName, buf));
  }
  await Promise.all(jobs);
  console.log('\x1b[32m%s\x1b[0m', 'Stylus zip complete');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

function patchCss(zip, files, suffix) {
  const any = suffix === sFirefox ? ':-moz-any(' : ':-webkit-any(';
  for (const [path, date, text] of files) {
    zip.file(path, text.replaceAll(':is(', any), {date});
  }
}

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
