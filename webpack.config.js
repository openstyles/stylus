'use strict';

const fs = require('fs');
const childProcess = require('child_process');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackProcessingPlugin = require('html-webpack-processing-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const InlineConstantExportsPlugin = require('@automattic/webpack-inline-constant-exports-plugin');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');
const {RawEnvPlugin} = require('./tools/wp-raw-patch-plugin');
const {
  escapeForRe, getManifestOvrName, transESM2var, transSourceMap,
  BUILD, CHANNEL, DEV, MANIFEST, MV3, ROOT, ZIP, nukeHtmlSpaces,
} = require('./tools/util');

const {DEBUG, GITHUB_ACTIONS} = process.env;
const SRC = ROOT + 'src/';
const DST = ROOT + 'dist/';
const CSS = 'css/';
const JS = 'js/';
const SHIM = ROOT + 'tools/shim/';
const SEP_ESC = escapeForRe(path.sep);
const SRC_ESC = escapeForRe(SRC.replaceAll('/', path.sep));
const PAGE_BG = MV3 ? 'background/sw' : 'background';
const OFFSCREEN = 'offscreen';
const PAGES = [
  'edit',
  'install-usercss',
  'manage',
  'options',
  'popup',
  !MV3 && PAGE_BG,
].filter(Boolean);
const FS_CACHE = !DEV && !GITHUB_ACTIONS && process.env.STYLUS_FS_CACHE;
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
const CM_PATH = CSS + 'cm-themes/';
const CM_PACKAGE_PATH = path.dirname(require.resolve('codemirror/package.json')) + path.sep;
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
const ALIASES = {
  funcs: {
    $: 'document.querySelector',
    $$: 'document.querySelectorAll',
    $id: 'document.getElementById',
    $tag: 'document.createElement',
  },
  vars: {
    document: 'global.document',
    $root: 'document.documentElement',
    $rootCL: '$root.classList',
  },
};
const VARS = {
  API: 'API', // hiding the global from IDE
  BUILD,
  CLIENT_DATA: 'clientData', // hiding the global from IDE
  CM_PATH,
  DEV,
  ENTRY: false,
  IS_BG: false,
  JS,
  MV3,
  PAGE_BG: PAGE_BG.split('/').pop(),
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
const INTRO = '"use strict"; { const global = self, window = global';
const INTRO_ALIASES = [
  ...Object.entries(ALIASES.vars).map(([k, v]) => `${k}=${v}`),
  ...Object.entries(DEV ? ALIASES.funcs : []).map(([k, v]) => `${k}=${v}.bind(document)`),
].join(', ');
const addWrapper = (banner = INTRO + ';', footer = '}', test = /\.js$/) => [
  new webpack.BannerPlugin({raw: true, test, banner}),
  new webpack.BannerPlugin({raw: true, test, banner: footer, footer: true}),
];
const getTerserOptions = (cm, ovr) => ({
  [cm ? 'include' : 'exclude']: /node_modules|codemirror(?!-factory)/,
  extractComments: false,
  terserOptions: {
    ecma: MV3 ? 2024 : 2017,
    compress: {
      pure_getters: true,
      global_defs: Object.entries(ALIASES.funcs).reduce((res, [key, val]) => {
        res['@' + key] = val;
        return res;
      }, {}),
      reduce_funcs: false,
    },
    output: {
      ascii_only: false,
      comments: false,
      wrap_func_args: false,
    },
    ...ovr ?? {
      mangle: !!cm || {
        reserved: new Set(),
        keep_classnames: true,
      },
    },
  },
});
const tersers = {};

/**
 * @return {import('webpack/types').Configuration}
 */
const getBaseConfig = () => ({
  mode: DEV ? 'development' : 'production',
  devtool: DEV && 'inline-source-map',
  output: {
    path: DST,
    filename: '[name].js',
    publicPath: '/',
    assetModuleFilename: m => m.filename.split('src/')[1] || m,
    cssFilename: CSS + '[name][ext]',
    cssChunkFilename: CSS + '[name][ext]',
  },
  cache: !FS_CACHE || {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
      codemirror: ['codemirror'],
    },
    compression: 'gzip',
  },
  // infrastructureLogging: {debug: /webpack\.cache/},
  module: {
    parser: {
      'javascript/auto': {node: false},
      'javascript/esm': {node: false},
    },
    rules: [
      // calc plugin for clamp() is broken: https://github.com/postcss/postcss-calc/issues/123
      ...((skip = 'js/dlg/config-dialog.css', use = [
        MiniCssExtractPlugin.loader,
        {loader: 'css-loader', options: {importLoaders: 1}},
      ]) => [{
        test: (skip = path.resolve(SRC + skip)),
        use: [...use, 'postcss-loader'],
      }, {
        test: /\.css$/,
        exclude: [skip],
        use: [...use, {loader: 'postcss-loader', options: {postcssOptions: mergeCfg({plugins: [
          'postcss-calc',
        ]}, require('./postcss.config'))}}],
      }])(), {
        test: /\.(png|svg|jpe?g|gif|ttf)$/i,
        type: 'asset/resource',
      }, !MV3 && {
        test: /\.m?js(\?.*)?$/,
        exclude: [CM_PACKAGE_PATH], // speedup: excluding known ES5 or ES6 libraries
        loader: 'babel-loader',
        options: {root: ROOT},
        resolve: {fullySpecified: false},
      }, {
        loader: 'html-loader',
        test: new RegExp(SRC_ESC + String.raw`.*[/\\].*\.html$`),
        options: {
          sources: false, // false = keep the source as-is
          minimize: false, // false = use our preprocessor
          preprocessor: nukeHtmlSpaces,
        },
      }, {
        loader: './tools/wp-cjs-to-esm-loader.js',
        test: new RegExp(`/node_modules/(${escapeForRe([
          '@eight04/',
          'db-to-cloud',
          'webext-launch-web-auth-flow',
        ].join('\n')).replaceAll('\n', '|')})`.replaceAll('/', SEP_ESC)),
      }, {
        loader: './tools/wp-lzstring-loader.js',
        test: require.resolve('lz-string-unsafe'),
      },
    ].filter(Boolean),
  },
  optimization: {
    concatenateModules: true, // makes DEV code run faster
    chunkIds: false,
    mangleExports: false,
    minimizer: DEV ? [] : [
      new CssMinimizerPlugin({
        minimizerOptions: {
          preset: ['default', {
            calc: false, // breaks clamp()
            minifyParams: false, // breaks our @media for dark and new-ui
          }],
        },
      }),
    ].filter(Boolean),
  },
  resolve: {
    alias: {
      '@': SRC,
    },
    fallback: {
      'fs': SHIM + 'null.js',
      'path': SHIM + 'path.js',
      'url': SHIM + 'url.js',
    },
  },
  performance: {
    maxAssetSize: 1e6,
    maxEntrypointSize: 1e6,
  },
  plugins: [
    // new webpack.debug.ProfilingPlugin({outputPath: DST + '.profile.json'}),
    new RawEnvPlugin(VARS, RAW_VARS),
    new webpack.ids.NamedChunkIdsPlugin({context: SRC}),
    new InlineConstantExportsPlugin([/[/\\]consts\.js$/]),
  ],
  stats: {
    // optimizationBailout: true,
  },
});

function getChunkFileName({chunk}) {
  let res = (chunk.name || chunk.id)
    .replace(/(^|-)(css|js(_(color|dlg))?|vendor-overwrites_.+?_)|_js$/g, '')
    .replace(/node_modules(.+?node_modules)?/g, '')
    .replace(/^[-_]+|[-_]+$|(?<=[-_])[-_]+/g, '')
    .replace(/[-_](css|js)(?=$|[-_])/g, '');
  if (res.length > MAX_CHUNKNAME_LEN) {
    res = res.slice(0, MAX_CHUNKNAME_LEN).replace(/[-_][a-z]{0,2}$/, '');
  }
  res = this[0] + res.replaceAll('_', '-') + this[1];
  return res;
}

/**
 * @param {import('webpack/types').Configuration} ovr
 * @param {import('webpack/types').Configuration} [base]
 * @return {import('webpack/types').Configuration}
 */
function mergeCfg(ovr, base) {
  if (!ovr) {
    return base;
  }
  if (!base) {
    let {entry} = ovr;
    if (typeof entry === 'string' ? entry = [entry] : Array.isArray(entry)) {
      ovr.entry = Object.fromEntries(entry.map(e => [path.basename(e, '.js'), e]));
    }
    entry = Object.keys(ovr.entry);
    if (FS_CACHE) {
      ovr.cache = {
        ...ovr.cache,
        // Differentiating by MV2/MV3 because targeted browsers are different in babel and postcss
        name: [MV3 ? 'mv3' : 'mv2', ...entry].join('-'),
      };
    }
    if (process.env.REPORT != null) {
      (ovr.plugins || (ovr.plugins = [])).push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          openAnalyzer: false,
          reportFilename: DST + (entry.length > 1 ? '' : '.' + entry[0]) + '.report.html',
        })
      );
    }
    base = getBaseConfig();
    if (!DEV && !ovr.optimization?.minimizer)
      base.optimization.minimizer.push(tersers.own ??= new TerserPlugin(getTerserOptions()));
  } else {
    base = {...base};
  }
  for (const k in ovr) {
    const o = ovr[k];
    const b = base[k];
    base[k] = o && typeof o === 'object' && b && typeof b === 'object'
      ? Array.isArray(o) && Array.isArray(b) ? [...b, ...o] : mergeCfg(o, b)
      : o;
  }
  return base;
}

function makeLibrary(entry, name, extras) {
  let cfg = mergeCfg({
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
  });
  if (!name) cfg = mergeCfg(OUTPUT_MODULE, cfg);
  return extras ? mergeCfg(extras, cfg) : cfg;
}

function makeContentScript(name) {
  // (!) `global` must be `this` because in Firefox it's not equal to `window` or `self`
  const intro = `if (self["${name}"]!==1) { self["${name}"]=1; const global = this, ${
    INTRO_ALIASES
  }; (() => { "use strict"; `;
  return mergeCfg(OUTPUT_MODULE, mergeCfg({
    entry: '@/content/' + name,
    output: {path: DST + JS},
    plugins: addWrapper(intro, '})()}'),
    optimization: {
      minimizer: DEV ? [] : [
        // mangling vars/funcs improves performance by a fraction of millisecond,
        // but on 1000 pages+frames it'll accumulate to a fraction of a second
        new TerserPlugin(getTerserOptions(false, {mangle: true})),
      ],
    },
  }));
}

function makeManifest(files) {
  let [base, ovr] = (files[0].sourceFilename.endsWith(MANIFEST) ? files : files.reverse())
    .map(file => file.data.toString());
  base = JSON.parse(MV3 ? base.replace('"browser_action"', '"action"') : base);
  ovr = JSON.parse(ovr);
  for (const [key, val] of Object.entries(ovr)) {
    const old = base[key];
    if (Array.isArray(old)) old.push(...val);
    else if (old && typeof old === 'object') Object.assign(old, val);
    else base[key] = val;
  }
  let ver = base.version;
  if (BUILD === 'firefox') {
    base.options_ui = {
      /*
       * Linking to dashboard, not to options, because this is aimed at users who removed the icon
       * from the toolbar (they rarely use Stylus) so they visit about:addons instead.
       */
      page: 'manage.html',
      open_in_tab: true,
    };
  }
  if (CHANNEL) {
    base.name += ` (${CHANNEL})`;
  }
  if (MV3 && CHANNEL === 'beta' && parseInt(ver) === 2) {
    ver = base.version = 3 + ver.slice(1);
  }
  if (MV3 && (DEBUG || DEV)) {
    base.permissions.push('declarativeNetRequestFeedback');
  }
  if (GITHUB_ACTIONS) {
    delete base.key;
    childProcess.execSync(`echo "_VER=${ver}" >> $GITHUB_ENV`);
  }
  return JSON.stringify(base, null, 2);
}

module.exports = [

  mergeCfg({
    entry: Object.fromEntries(PAGES.map(p => [p, `@/${p}`])),
    output: {
      filename: JS + '[name].js',
      chunkFilename: getChunkFileName.bind([JS, '.js']),
    },
    optimization: {
      minimizer: DEV ? [] : [
        tersers.cm ??= new TerserPlugin(getTerserOptions(true)),
        tersers.own ??= new TerserPlugin(getTerserOptions()),
      ],
      runtimeChunk: {
        name: 'common',
      },
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          codemirror: {
            test: new RegExp([
              SRC_ESC + 'cm' + SEP_ESC,
              'codemirror(?!-factory)', // `factory` is our code
            ].join('|')),
            name: 'codemirror',
            enforce: true,
          },
          ...Object.fromEntries([
            [2, 'common-ui', `^${SRC_ESC}(content/|js/(dom|header|localization|themer))`],
            [1, 'common', `^${SRC_ESC}js/|/lz-string(-unsafe)?/`],
            [-10, 'vendors', /node_modules/],
          ].map(([priority, name, test]) => [name, {
            test: test instanceof RegExp ? test :
              new RegExp(String.raw`(${test.replaceAll('/', SEP_ESC)})[^./\\]*\.js$`),
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
        minify: true, // to see possible whitespace elimination problems in dev build
        template: SRC + p + '.html',
        templateParameters: (compilation, files, tags, options) => {
          const {bodyTags, headTags} = tags;
          // The main entry goes into BODY to improve performance (2x in manage.html)
          headTags.push(...bodyTags.splice(0, bodyTags.length - 1));
          if (MV3) headTags.unshift(GET_CLIENT_DATA_TAG);
          return {
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
          {context: SRC, from: getManifestOvrName(MV3, true), to: MANIFEST,
            transformAll: makeManifest},
          {context: SRC, from: '_locales/**', to: DST},
          {context: THEME_PATH, from: '*.css', to: DST + CM_PATH},
          ...[
            ['csslint-mod/dist/csslint.js', 'csslint.js', true],
            ['csslint-mod/dist/parserlib.js', 'parserlib.js', true],
            ['stylelint-bundle', 'stylelint.js'],
            ['less/dist/less.min.js', 'less.js'],
            ['stylus-lang-bundle/dist/stylus-renderer.min.js', 'stylus-lang.js'],
          ].map(([npm, to, babelize]) => ({
            from: require.resolve(npm),
            to: DST + JS + to,
            info: {minimized: !babelize},
            transform: babelize ? transESM2var : transSourceMap,
          })),
        ],
      }),
      new webpack.ProgressPlugin(),
    ].filter(Boolean),
    resolve: RESOLVE_VIA_SHIM,
  }),

  MV3 && mergeCfg({
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

  MV3 && mergeCfg({
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

  MV3 && mergeCfg(OUTPUT_MODULE, mergeCfg({
    entry: '@/js/' + GET_CLIENT_DATA,
    output: {path: DST + JS},
  })),

  MV3 && makeLibrary('db-to-cloud/lib/drive/webdav', 'webdav'),

  makeContentScript('apply.js'),
  makeLibrary('@/js/worker.js', undefined, {
    plugins: [new RawEnvPlugin({ENTRY: 'worker'})],
  }),
  makeLibrary('@/js/color/color-converter.js', '*:colorConverter'),
  makeLibrary('@/js/meta-parser.js', 'metaParser'),
  makeLibrary('@/js/moz-parser.js', 'extractSections'),
  makeLibrary('@/js/usercss-compiler.js', 'compileUsercss'),
].filter(Boolean);

module.exports.parallelism = 2;
