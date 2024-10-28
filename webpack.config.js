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
const ASSETS = 'assets/';
const JS = 'js/';
const SHIM = ROOT + 'tools/shim/';
const MV3 = FLAVOR === 'mv3';
const PAGE_BG = MV3 ? 'background-sw' : 'background';
const PAGE_OFFSCREEN = 'offscreen';
const PAGES = [
  'edit',
  'install-usercss',
  'manage',
  'options',
  'popup',
  ...MV3 ? [PAGE_OFFSCREEN] : [PAGE_BG],
];
const GET_CLIENT_DATA = 'get-client-data';
const GET_CLIENT_DATA_TAG = {
  toString: () => `<script src="${ASSETS}${GET_CLIENT_DATA}.js"></script>`,
};
const LIB_EXPORT_DEFAULT = {output: {library: {export: 'default'}}};
const RESOLVE_VIA_SHIM = {
  modules: [
    SHIM,
    'node_modules',
  ],
};
const ASSETS_CM = ASSETS + 'cm-themes/';
const CODE_MIRROR_PATH = path.dirname(require.resolve('codemirror/package.json')) + path.sep;
const CODEMIRROR_NATIVE = /codemirror(?!-factory)/; // `factory` is our code
const THEME_PATH = CODE_MIRROR_PATH.replaceAll('\\', '/') + '/theme';
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
  ASSETS,
  ASSETS_CM,
  BUILD,
  DEV,
  ENTRY: false,
  IS_BG: false,
  JS,
  MV3,
  PAGE_BG,
  PAGE_OFFSCREEN,
  ZIP: !!ZIP,
};
const RAW_VARS = {
  // hiding `global` from IDE so it doesn't see the symbol as a global
  API: 'global.API',
  DEBUG: process.env.DEBUG ? 'console.log' : 'null?.',
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
    assetModuleFilename: data => {
      const p = data.filename.split('src/images/');
      return ASSETS + (p[1] || '[name][ext]');
    },
    cssFilename: ASSETS + '[name][ext]',
    cssChunkFilename: ASSETS + '[name][ext]',
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
        test: /\.m?js$/,
        exclude: [CODE_MIRROR_PATH], // speedup for a big ES5 package
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
    minimizer: DEV ? [] : [
      new TerserPlugin(mergeCfg({
        exclude: CODEMIRROR_NATIVE,
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
      filename: ASSETS + '[name].js',
      chunkFilename: ASSETS + '[name].js',
    },
    optimization: {
      minimizer: DEV ? [] : [
        new TerserPlugin({...TERSER_OPTS, include: CODEMIRROR_NATIVE}),
      ],
      runtimeChunk: {
        name: 'common',
      },
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          codemirror: {
            test: new RegExp(String.raw`(${anyPathSep([
              SRC + 'cm/',
              CODEMIRROR_NATIVE.source,
            ].join('|'))}).+\.js$`),
            name: 'codemirror',
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
        filename: ASSETS + '[name].css',
        chunkFilename: ASSETS + '[name].css',
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
          {context: SRC + 'content', from: 'install*.js', to: DST + JS, info: {minimized: true}},
          {context: SRC + 'images', from: 'eyedropper/**', to: DST + ASSETS},
          {context: SRC + 'images', from: 'icon/**', to: DST + ASSETS},
          {context: SRC, from: MV3 ? MANIFEST_MV3 : MANIFEST, to: DST + MANIFEST},
          {context: SRC, from: '_locales/**', to: DST},
          {context: THEME_PATH, from: '*.css', to: DST + ASSETS_CM},
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
      output: {path: DST + ASSETS},
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
