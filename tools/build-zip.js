#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fse = require('fs-extra');
const glob = require('fast-glob');
const JSZip = require('jszip');
const chalk = require('chalk');
const webpack = require('webpack');
const {ROOT, MANIFEST} = require('./util');

const DST = ROOT + 'dist/';
const CONFIG_PATH = require.resolve(ROOT + 'webpack.config.js');
const sChrome = 'chrome';
const sChromeBeta = 'chrome-beta';
const sChromeMV3 = 'chrome-mv3';
const sFirefox = 'firefox';

(async function build([targets] = process.argv.slice(2)) {
  // https://github.com/Stuk/jszip/issues/369
  const tzBug = new Date().getTimezoneOffset() * 60000;
  JSZip.defaults.date = new Date(Date.now() - tzBug);
  targets = targets
    ? targets.split(',')
    : [sFirefox, sChrome, sChromeBeta, sChromeMV3];
  for (const target of targets) {
    process.env.NODE_ENV = target;
    console.log(chalk.bold(`Building for ${target}...`));
    fse.emptyDirSync(DST);
    delete require.cache[CONFIG_PATH];
    const err = await new Promise(cb => webpack(require(CONFIG_PATH), cb));
    if (err) throw err;
    const mj = patchManifest(fs.readFileSync(DST + MANIFEST, 'utf8'), target);
    const zipName = `stylus-${target}-${mj.version}.zip`;
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

function patchManifest(str, suffix) {
  const mj = JSON.parse(str);
  delete mj.key;
  if (suffix === sFirefox) {
    mj.options_ui = {
      /*
       * Linking to dashboard, not to options, because this is aimed at users who removed the icon
       * from the toolbar (they rarely use Stylus) so they visit about:addons instead.
       */
      page: 'manage.html',
      open_in_tab: true,
    };
  } else {
    delete mj.browser_specific_settings;
    if (suffix === sChromeBeta) mj.name = 'Stylus (beta)';
  }
  return mj;
}
