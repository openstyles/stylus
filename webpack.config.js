'use strict';

const fs = require('fs');
const fse = require('fs-extra');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackProcessingPlugin = require('html-webpack-processing-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const {RawEnvPlugin} = require('./tools/wp-raw-patch-plugin');
const {
  nukeHtmlSpaces, transESM2var, transSourceMap, BUILD, DEV, FLAVOR, MANIFEST, MV3, SRC,
} = require('./tools/util');
const augment = require('./tools/wp-config-base');
const {
  CSS, JS, SHIM, OUTPUT_MODULE, SEP_ESC, SRC_ESC, THEME_NAMES, THEME_PATH, CM_PATH, DST, ALIASES,
  VARS,
} = require('./tools/wp-config-vars');

global.localStorage = {}; // workaround for node 25 and HtmlWebpackPlugin's `...global`
if (!DEV) fse.emptydirSync(DST);

const {DEBUG, GITHUB_ACTIONS, PUBLISH} = process.env;
const PAGE_BG = MV3 ? 'background/sw' : 'background';
const OFFSCREEN = 'offscreen';
const PAGES = [
  'edit',
  'install-usercss',
  'manage',
  'options',
  'popup',
  'sidepanel',
  !MV3 && PAGE_BG,
].filter(Boolean);
const GET_CLIENT_DATA = 'get-client-data';
const GET_CLIENT_DATA_TAG = {
  toString: () => `<script src="${JS}${GET_CLIENT_DATA}.js"></script>`,
};
const RESOLVE_VIA_SHIM = {
  modules: [
    SHIM,
    'node_modules',
  ],
};
const MAX_CHUNKNAME_LEN = 24; // in Windows, path+name is limited to 260 chars
const INTRO = '"use strict"; { const global = self, window = global';
const INTRO_ALIASES = [
  ...Object.entries(ALIASES.vars).map(([k, v]) => `${k}=${v}`),
  ...Object.entries(DEV ? ALIASES.funcs : []).map(([k, v]) => `${k}=${v}.bind(document)`),
].join(', ');
const addWrapper = (banner = INTRO + ';', footer = '}', test = /\.js$/) => [
  new webpack.BannerPlugin({raw: true, test, banner}),
  new webpack.BannerPlugin({raw: true, test, banner: footer, footer: true}),
];

function getChunkFileName({chunk}) {
  let res = (chunk.name || chunk.id)
    .replace(/(^|-)(css|js(?=\W)|js_(color|dlg)|vendor-overwrites_.+?_)|_js$/g, '')
    .replace(/node_modules(.+?node_modules)?/g, '')
    .replace(/^[-_]+|[-_]+$|(?<=[-_])[-_]+/g, '')
    .replace(/[-_](css|js)(?=$|[-_])/g, '');
  if (res.length > MAX_CHUNKNAME_LEN) {
    res = res.slice(0, MAX_CHUNKNAME_LEN).replace(/[-_][a-z]{0,2}$/, '');
  }
  res = this[0] + res.replaceAll('_', '-') + this[1];
  return res;
}

function makeLibrary(entry, name, vars) {
  let cfg = augment({
    entry,
    output: {
      path: DST + JS,
      library: name && {
        type: 'global',
        name: name?.replace(/^\W+/, ''),
        export: name[0] === '*' ? undefined : 'default',
      },
    },
    plugins: name
      ? addWrapper()
      : addWrapper(INTRO + '; (()=>{', '})()}'),
  }, undefined, vars);
  if (!name) cfg = augment(OUTPUT_MODULE, cfg);
  return cfg;
}

function makeContentScript(name) {
  // (!) `global` must be `this` because in Firefox it's not equal to `window` or `self`
  const intro = `if (self["${name}"]!==1) { self["${name}"]=1; const global = this, ${
    INTRO_ALIASES
  }; (() => { "use strict"; `;
  return augment(OUTPUT_MODULE, augment({
    entry: '@/content/' + name,
    output: {path: DST + JS},
    plugins: addWrapper(intro, '})()}'),
  }));
}

function makeManifest(files) {
  let [base, ...mods] = (files[0].sourceFilename.endsWith(MANIFEST) ? files : files.reverse())
    .map(file => file.data.toString());
  base = JSON.parse(MV3 ? base.replace('"browser_action"', '"action"') : base);
  for (let ovr of mods) {
    ovr = JSON.parse(ovr);
    for (const [key, val] of Object.entries(ovr)) {
      const old = base[key];
      if (Array.isArray(old)) old.push(...val);
      else if (old && typeof old === 'object') Object.assign(old, val);
      else base[key] = val;
    }
  }
  let ver = base.version;
  if (BUILD === 'firefox') {
    delete base.key;
  }
  if (MV3 && (DEBUG || DEV)) {
    base.permissions.push('declarativeNetRequestFeedback');
  }
  if (PUBLISH === 'CWS') {
    const isStable = ver.endsWith('.0');
    const extId = isStable
      ? 'clngdbkpkpeebahjckkjfobafhncgmne'
      : 'apmmpaebfobifelkijhaljbmpcgbjbdo';
    if (!isStable) {
      base.name += ` (beta)`;
      ver = base.version = ver.replace(/^2\./, '3.');
      ver += '-beta';
    }
    fs.appendFileSync(process.env.GITHUB_ENV, `EXTENSION_ID=${extId}\n`, 'utf8');
  }
  if (GITHUB_ACTIONS) {
    delete base.key;
    fs.appendFileSync(process.env.GITHUB_ENV, `_VER=${ver}\n`, 'utf8');
  }
  return JSON.stringify(base, null, 2);
}

module.exports = [

  augment({
    entry: Object.fromEntries(PAGES.map(p => [p, `@/${p}`])),
    output: {
      filename: JS + '[name].js',
      chunkFilename: getChunkFileName.bind([JS, '.js']),
    },
    optimization: {
      runtimeChunk: {
        name: 'common',
      },
      splitChunks: {
        chunks: c => !c.name?.match(/jsonlint|lazy/),
        cacheGroups: {
          codemirror: {
            test: new RegExp([
              '/cm/(?!jsonlint)',
              '/codemirror/(?!mode/javascript)',
              '/vendor-overwrites/codemirror',
            ].join('|').replaceAll('/', SEP_ESC)),
            name: 'codemirror',
            enforce: true,
          },
          ...Object.fromEntries([
            [2, 'color', `^${SRC_ESC}js/color/`],
            [1, 'common', `^${SRC_ESC}(content|js)/|/lz-string(-unsafe)?/`],
          ].map(([priority, name, test]) => [name, {
            test: test instanceof RegExp ? test :
              new RegExp(String.raw`(${test.replaceAll('/', SEP_ESC)}).*\.(css|js|html)$`),
            name,
            priority,
          }])),
        },
      },
    },
    plugins: [
      new RawEnvPlugin({
        ENTRY: true,
        THEMES: THEME_NAMES,
      }, {
        IS_BG: MV3 ? 'false' : '(global._bg === true)',
      }),
      ...addWrapper(INTRO + ', ' + INTRO_ALIASES + ';'),
      new MiniCssExtractPlugin({
        filename: getChunkFileName.bind([CSS, '.css']),
        chunkFilename: getChunkFileName.bind([CSS, '.css']),
      }),
      ...PAGES.map(p => new HtmlWebpackPlugin({
        chunks: [p],
        filename: p + '.html',
        minify: false, // we use nukeHtmlSpaces
        template: SRC + p + '.html',
        templateParameters: (compilation, files, tags, options) => {
          const {bodyTags, headTags} = tags;
          // The main entry goes into BODY to improve performance (2x in manage.html)
          headTags.push(...bodyTags.splice(0, bodyTags.length - 1));
          if (MV3) headTags.unshift(GET_CLIENT_DATA_TAG);
          return {
            __: VARS,
            compilation: compilation,
            webpackConfig: compilation.options,
            htmlWebpackPlugin: {tags, files, options},
          };
        },
        scriptLoading: 'blocking',
        inject: false,
        postProcessing: nukeHtmlSpaces,
      })),
      new HtmlWebpackProcessingPlugin(),
      new CopyPlugin({
        patterns: [
          {context: SRC, from: 'icon/**', to: DST},
          {context: SRC + 'content', from: 'install*.js', to: DST + JS},
          {context: SRC, from: MANIFEST.replace('.', `?(-${FLAVOR}*).`), to: MANIFEST,
            transformAll: makeManifest},
          {context: SRC, from: '_locales/**', to: DST},
          {context: THEME_PATH, from: '*.css', to: DST + CM_PATH},
          ...[
            ['csslint-mod/dist/csslint.js', 'csslint.js', true],
            ['csslint-mod/dist/parserlib.js', 'parserlib.js', true],
            ['stylelint-bundle', 'stylelint.js'],
            ['stylus-lang-bundle/dist/stylus-lang-bundle.min.js', 'stylus-lang.js'],
          ].flatMap(([npm, to, babelize]) => [{
            from: (npm = require.resolve(npm)),
            to: (to = DST + JS + to),
            info: {minimized: !babelize},
            transform: babelize ? transESM2var : transSourceMap,
          }, DEV && !babelize && {
            from: npm + '.map',
            to: to + '.map',
          }].filter(Boolean)),
        ],
      }),
      !GITHUB_ACTIONS && new webpack.ProgressPlugin(),
    ].filter(Boolean),
    resolve: RESOLVE_VIA_SHIM,
  }),

  MV3 && augment({
    entry: `@/${PAGE_BG}`,
    plugins: [
      new RawEnvPlugin({
        ENTRY: 'sw',
        IS_BG: true,
      }, {
        KEEP_ALIVE: 'global.keepAlive',
      }),
      ...addWrapper(),
    ],
    resolve: RESOLVE_VIA_SHIM,
  }),

  MV3 && augment({
    entry: `@/${OFFSCREEN}`,
    output: {
      filename: JS + '[name].js',
    },
    plugins: [
      new RawEnvPlugin({ENTRY: OFFSCREEN}),
      ...addWrapper(INTRO + ', ' + INTRO_ALIASES + ';'),
      new HtmlWebpackPlugin({
        chunks: [OFFSCREEN],
        filename: OFFSCREEN + '.html',
        template: SRC + OFFSCREEN + '.html',
        scriptLoading: 'blocking',
        inject: false,
      }),
    ],
    resolve: RESOLVE_VIA_SHIM,
  }),

  MV3 && augment(OUTPUT_MODULE, augment({
    entry: '@/js/' + GET_CLIENT_DATA,
    output: {path: DST + JS},
  })),

  MV3 && makeLibrary('db-to-cloud/lib/drive/webdav', 'webdav'),

  makeContentScript('apply.js'),
  makeContentScript('hook-uso.js'),
  MV3 && makeContentScript('hook-uso-page-mv3.js'),
  makeLibrary('@/js/worker', undefined, {ENTRY: 'worker'}),
  makeLibrary({less: 'less/lib/less-browser/bootstrap'}, 'less'),
].filter(Boolean);

module.exports.parallelism = 2;
