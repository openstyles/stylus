'use strict';

const fs = require('fs');
const path = require('path');

const {escapeForRe, BUILD, DEV, MV3, ROOT, TARGET, ZIP, CM_PACKAGE_PATH, SRC} = require('./util');

const {GITHUB_ACTIONS} = process.env;
const DEBUG = +process.env.DEBUG || 0;
const DST = `${ROOT}dist${GITHUB_ACTIONS ? '' : `-${TARGET}`}/`;
const CSS = 'css/';
const JS = 'js/';
const SHIM = ROOT + 'tools/shim/';
const SEP_ESC = escapeForRe(path.sep);
const SRC_ESC = escapeForRe(SRC.replaceAll('/', path.sep));
const PAGE_BG = MV3 ? 'background/sw' : 'background';
const FS_CACHE = !DEV && !GITHUB_ACTIONS && +process.env.FS_CACHE;
const CM_PATH = CSS + 'cm-themes/';
const THEME_PATH = CM_PACKAGE_PATH.replaceAll('\\', '/') + '/theme';
const THEME_NAMES = Object.fromEntries(fs.readdirSync(THEME_PATH)
  .sort()
  .map(f => (f = f.match(/([^/\\.]+)\.css$/i)?.[1]) && [f, ''])
  .filter(Boolean));
/** Getting rid of the unused webpack machinery */
const OUTPUT_MODULE = {
  output: {
    module: true,
    library: {type: 'modern-module'},
  },
  experiments: {outputModule: true},
};
const ALIASES = Object.entries({
  $: 'document.querySelector',
  $$: 'document.querySelectorAll',
  $id: 'document.getElementById',
  $tag: 'document.createElement',
});
const MIRROR_PREFIX = 'http://_/';
const VARS = {
  API: 'API', // hiding the global from IDE
  B: BUILD,
  B_ANY: BUILD !== 'chrome' && BUILD !== 'firefox',
  B_CHROME: BUILD === 'chrome',
  B_FIREFOX: BUILD === 'firefox',
  CLIENT_DATA: 'clientData', // hiding the global from IDE
  CM_PATH,
  DEV,
  ENTRY: false,
  IS_BG: false,
  JS,
  MIRROR_PREFIX,
  MIRROR_PREFIX_LEN: MIRROR_PREFIX.length,
  MV3,
  PAGE_BG: PAGE_BG.split('/').pop(),
  PREFS: 'prefs', // hiding the global from IDE
  ZIP: !!ZIP,
};
const DEBUG_MODE = {
  GENERAL: 1,
  PORT: 2,
  LIFE: 4,
};
const RAW_VARS = {
  DEBUG: DEBUG || '0',
  DEBUGLOG: (DEBUG ? '' : 'null&&') + 'console.log',
  DEBUGPORT: (+DEBUG & DEBUG_MODE.PORT ? '' : 'null&&') + 'console.log',
  DEBUGTRACE: (DEBUG ? '' : 'null&&') + 'console.trace',
  DEBUGWARN: (DEBUG ? '' : 'null&&') + 'console.warn',
  KEEP_ALIVE: '1&&',
};

module.exports = {
  ALIASES,
  CM_PATH,
  CSS,
  DEBUG,
  DST,
  FS_CACHE,
  GITHUB_ACTIONS,
  JS,
  OUTPUT_MODULE,
  RAW_VARS,
  SEP_ESC,
  SHIM,
  SRC_ESC,
  THEME_NAMES,
  THEME_PATH,
  VARS,
};
