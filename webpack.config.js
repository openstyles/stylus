'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');
const RawEnvPlugin = require('./tools/raw-env-plugin');
const WebpackPatchBootstrapPlugin = require('./tools/webpack-patch-bootstrap');
const {anyPathSep, stripSourceMap, MANIFEST, MANIFEST_MV3, ROOT} = require('./tools/util');

const NODE_ENV = process.env.NODE_ENV;
const [TARGET, ZIP] = NODE_ENV?.split(':') || [''];
const [BUILD, FLAVOR] = TARGET.split('-');
const DEV = BUILD === 'DEV' || process.env.npm_lifecycle_event?.startsWith('watch');
const FS_CACHE = !DEV;
const SRC = ROOT + 'src/';
const DST = ROOT + 'dist/';
const CSS = 'css/';
const JS = 'js/';
const SHIM = ROOT + 'tools/shim/';
const MV3 = FLAVOR === 'mv3';
const PAGE_BG = MV3 ? 'background/sw' : 'background';
const PAGE_OFFSCREEN = 'offscreen';
const PAGES = [
  'edit',
  'install-usercss',
  'manage',
  'options',
  'popup',
  MV3 ? PAGE_OFFSCREEN : PAGE_BG,
];
const GET_CLIENT_DATA = 'get-client-data';
const GET_CLIENT_DATA_TAG = {
  toString: () => `<script src="${JS}${GET_CLIENT_DATA}.js"></script>`,
};
const LIB_EXPORT_DEFAULT = {output: {library: {export: 'default'}}};
const RESOLVE_VIA_SHIM = {
  modules: [
    SHIM,
    'node_modules',
  ],
};
const CM_PATH = CSS + 'cm-themes/';
const CM_PACKAGE_PATH = path.dirname(require.resolve('codemirror/package.json')) + path.sep;
const CM_NATIVE_RE = /codemirror(?!-factory)/; // `factory` is our code
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
const VARS = {
  BUILD,
  CLIENT_DATA: 'clientData', // hiding the global from IDE
  CM_PATH,
  DEBUG: !!process.env.DEBUG,
  DEV,
  ENTRY: false,
  IS_BG: false,
  JS,
  MV3,
  PAGE_BG: PAGE_BG.split('/').pop(),
  PAGE_OFFSCREEN,
  ZIP: !!ZIP,
};
const RAW_VARS = {
  API: 'global.API', // hiding the global from IDE
  DEBUGLOG: process.env.DEBUG ? 'console.log' : 'null?.',
  DEBUGWARN: process.env.DEBUG ? 'console.warn' : 'null?.',
  KEEP_ALIVE: '1&&',
};
const BANNER = '{const global = this, window = global;';
const addWrapper = (banner = BANNER, footer = '}', test = /\.js$/) => [
  new webpack.BannerPlugin({raw: true, test, banner}),
  new webpack.BannerPlugin({raw: true, test, banner: footer, footer: true}),
];
const TERSER_OPTS = {
  extractComments: false,
  terserOptions: {
    toplevel: true,
    ecma: MV3 ? 2024 : 2017,
    compress: {
      passes: 2,
      reduce_funcs: false,
    },
    output: {
      ascii_only: false,
      comments: false,
      wrap_func_args: false,
    },
  },
};

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
    rules: [
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {loader: 'css-loader', options: {importLoaders: 1}},
          'postcss-loader',
        ],
      }, {
        test: /\.(png|svg|jpe?g|gif|ttf)$/i,
        type: 'asset/resource',
      }, {
        test: /\.m?js$/,
        exclude: [CM_PACKAGE_PATH], // speedup for a big ES5 package
        loader: 'babel-loader',
        options: {root: ROOT},
        resolve: {fullySpecified: false},
      }, {
        loader: SHIM + 'cjs-to-esm-loader.js',
        test: [
          'db-to-cloud',
          'webext-launch-web-auth-flow',
        ].map(npm => path.dirname(require.resolve(npm))),
      }, {
        loader: SHIM + 'jsonlint-loader.js',
        test: require.resolve('jsonlint'),
      }, {
        loader: SHIM + 'lzstring-loader.js',
        test: require.resolve('lz-string-unsafe'),
      },
    ],
  },
  node: false,
  optimization: {
    concatenateModules: true, // makes DEV code run faster
    chunkIds: false,
    mangleExports: false,
    minimizer: DEV ? [] : [
      new TerserPlugin(mergeCfg({
        exclude: CM_NATIVE_RE,
        terserOptions: {
          mangle: {keep_fnames: true},
        },
      }, TERSER_OPTS)),
      new CssMinimizerPlugin({
        minimizerOptions: {
          preset: ['default', {
            calc: false, // breaks clamp()
            minifyParams: false, // breaks our @media for dark and new-ui
          }],
        },
      }),
    ],
  },
  resolve: {
    alias: {
      '/': SRC,
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
    new WebpackPatchBootstrapPlugin(),
  ],
  stats: {
    // optimizationBailout: true,
  },
});

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
        name: entry.join('-'),
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
  }
  base = base ? {...base} : getBaseConfig();
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
  return mergeCfg(extras, mergeCfg({
    entry,
    output: {
      path: DST + JS,
      library: {
        type: 'global',
        name,
      },
    },
    plugins: name
      ? addWrapper()
      : addWrapper(`(()=>${BANNER}`, '})()'),
  }));
}

function makeContentScript(name) {
  return mergeCfg(OUTPUT_MODULE, mergeCfg({
    entry: '/content/' + name,
    output: {path: DST + JS},
    plugins: addWrapper(`if (window["${name}"]!==1) ${BANNER} global["${name}"] = 1;`),
  }));
}

module.exports = [
  mergeCfg({
    entry: Object.fromEntries(PAGES.map(p => [p, `/${p}`])),
    output: {
      filename: JS + '[name].js',
      chunkFilename: JS + '[name].js',
    },
    optimization: {
      minimizer: DEV ? [] : [
        new TerserPlugin({...TERSER_OPTS, include: CM_NATIVE_RE}),
      ],
      runtimeChunk: {
        name: 'common',
      },
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          codemirror: {
            test: new RegExp(anyPathSep([
              SRC + 'cm/',
              CM_NATIVE_RE.source,
            ].join('|'))),
            name: 'codemirror',
            enforce: true,
          },
          ...Object.fromEntries([
            [2, 'common-ui', `^${SRC}(content/|js/(dom|localization|themer))`],
            [1, 'common', `^${SRC}js/|/lz-string(-unsafe)?/`],
          ].map(([priority, name, test]) => [name, {
            test: new RegExp(String.raw`(${anyPathSep(test)})[^./\\]*\.js$`),
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
      ...addWrapper(),
      new MiniCssExtractPlugin({
        filename: CSS + '[name].css',
        chunkFilename: CSS + '[name].css',
      }),
      ...PAGES.map(p => new HtmlWebpackPlugin({
        chunks: [p],
        filename: p + '.html',
        template: SRC + p + '/index.html',
        templateParameters: (compilation, files, tags, options) => {
          const {bodyTags, headTags} = tags;
          // The main entry goes into BODY to improve performance (2x in manage.html)
          headTags.push(...bodyTags.splice(0, bodyTags.length - 1));
          if (MV3 && p !== PAGE_OFFSCREEN) headTags.unshift(GET_CLIENT_DATA_TAG);
          return {
            compilation: compilation,
            webpackConfig: compilation.options,
            htmlWebpackPlugin: {tags, files, options},
          };
        },
        scriptLoading: 'blocking',
        inject: false,
      })),
      new CopyPlugin({
        patterns: [
          {context: SRC, from: 'icon/**', to: DST},
          {context: SRC + 'content', from: 'install*.js', to: DST + JS, info: {minimized: true}},
          {context: SRC, from: MV3 ? MANIFEST_MV3 : MANIFEST, to: DST + MANIFEST},
          {context: SRC, from: '_locales/**', to: DST},
          {context: THEME_PATH, from: '*.css', to: DST + CM_PATH},
          ...[
            ['stylelint-bundle', 'stylelint.js'],
            ['less/dist/less.min.js', 'less.js'],
            ['stylus-lang-bundle/dist/stylus-renderer.min.js', 'stylus-lang.js'],
          ].map(([npm, to]) => ({
            from: require.resolve(npm),
            to: DST + JS + to,
            info: {minimized: true},
            transform: stripSourceMap,
          })),
        ],
      }),
      !DEV && new webpack.ProgressPlugin(),
    ].filter(Boolean),
    resolve: RESOLVE_VIA_SHIM,
  }),
  ...!MV3 ? [] : [
    mergeCfg({
      entry: `/${PAGE_BG}`,
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
    mergeCfg(OUTPUT_MODULE, mergeCfg({
      entry: '/js/' + GET_CLIENT_DATA,
      output: {path: DST + JS},
    })),
    makeLibrary('db-to-cloud/lib/drive/webdav', 'webdav', LIB_EXPORT_DEFAULT),
  ],
  makeContentScript('apply.js'),
  makeLibrary('/js/worker.js', undefined, {
    ...OUTPUT_MODULE,
    plugins: [new RawEnvPlugin({ENTRY: 'worker'})],
  }),
  makeLibrary('/js/color/color-converter.js', 'colorConverter'),
  makeLibrary('/js/csslint/csslint.js', 'CSSLint',
    {...LIB_EXPORT_DEFAULT, externals: {'./parserlib': 'parserlib'}}),
  makeLibrary('/js/csslint/parserlib.js', 'parserlib', LIB_EXPORT_DEFAULT),
  makeLibrary('/js/meta-parser.js', 'metaParser', LIB_EXPORT_DEFAULT),
  makeLibrary('/js/moz-parser.js', 'extractSections', LIB_EXPORT_DEFAULT),
  makeLibrary('/js/usercss-compiler.js', 'compileUsercss', LIB_EXPORT_DEFAULT),
].filter(Boolean);
