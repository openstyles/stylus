'use strict';
/* eslint no-unused-vars: 1 */

const path = require('path');
// const webpack = require('webpack');
// const fse = require('fs-extra');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const {defineVars, stripSourceMap} = require('./tools/util');

const DEV = true;
const BUILD = DEV ? 'DEV' : 'CHROME';
const IS_PROD = !DEV;
const SRC = `${__dirname}/src/`;
const DST = path.resolve('dist') + '/';
const ASSETS = 'assets/';
const JS = 'js/';
const SHIM = path.resolve('tools/shim') + '/';
const PAGE_BG = 'background';
const PAGES = [
  'edit',
  'options',
  'popup',
  PAGE_BG,
];
const LIB_EXPORT_DEFAULT = {output: {library: {export: 'default'}}};

/** @type {webpack.} */
const CFG = {
  mode: DEV ? 'development' : 'production',
  devtool: 'inline-source-map',
  output: {
    path: DST,
    filename: '[name].js',
    assetModuleFilename: ASSETS + '[name][ext]',
    cssFilename: ASSETS + '[name][ext]',
    cssChunkFilename: ASSETS + '[name][ext]',
  },
  resolve: {
    alias: {
      '/': SRC,
    },
    fallback: {
      './fs-drive': SHIM + 'empty.js',
      'fs': SHIM + 'empty.js',
      'path': SHIM + 'path.js',
      'url': SHIM + 'url.js',
    },
  },
  optimization: {
    concatenateModules: true, // makes DEV code run much faster
    runtimeChunk: false,
    sideEffects: true,
    usedExports: true,
    minimizer: DEV ? [] : [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          compress: {
            reduce_funcs: false,
            ecma: 8,
            passes: 2,
            // unsafe_arrows: true, // it's 'safe' since we don't rely on function prototypes
          },
          output: {
            ascii_only: false,
            comments: false,
            wrap_func_args: false,
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {loader: 'css-loader', options: {importLoaders: 1}},
          // 'postcss-loader', // TODO: find a way to disable via comments for e.g. clamp()
        ],
      },
      {
        test: /\.m?js$/,
        use: {loader: 'babel-loader'},
        resolve: {fullySpecified: false},
      },
    ],
  },
  node: false,
  performance: {
    maxAssetSize: 1e6,
    maxEntrypointSize: 1e6,
  },
  plugins: [
    defineVars({ASSETS, JS, BUILD}),
    new CopyPlugin({
      patterns: [
        {context: SRC + 'content', from: 'install*.js', to: DST + JS, info: {minimized: true}},
        {context: SRC + 'images', from: 'eyedropper/**', to: DST + ASSETS},
        {context: SRC + 'images', from: 'icon/**', to: DST + ASSETS},
        {context: SRC, from: 'manifest.json', to: DST},
        {context: SRC, from: '_locales/**', to: DST},
        ...[
          ['stylelint-bundle', 'stylelint.js'],
          ['less/dist/less.min.js', 'less.js'],
          ['stylus-lang-bundle/dist/stylus-renderer.min.js', 'stylus-lang.js'],
        ].map(([npm, to]) => ({
          from: require.resolve(npm),
          to: DST + JS + to,
          transform: stripSourceMap.bind(null, DEV),
        })),
      ],
    }),
    // new WebpackPatchBootstrapPlugin(),
  ],
};

function mergeCfg(ovr, base) {
  if (!ovr) {
    return base;
  }
  if (!base) {
    let {entry} = ovr;
    if (typeof entry === 'string' ? entry = [entry] : Array.isArray(entry)) {
      ovr.entry = Object.fromEntries(entry.map(e => [path.basename(e, '.js'), e]));
    }
  }
  base = {...base || CFG};
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
    output: {
      path: DST + JS,
      library: {
        type: 'self',
        name,
      },
    },
    entry,
  }));
}

function makeContentScript(entry) {
  /* TODO: write a plugin to remove webpack's machinery or write these directly + watch + babel
    makeContentScript('/content/install-hook-greasyfork.js'),
    makeContentScript('/content/install-hook-usercss.js'),
    makeContentScript('/content/install-hook-userstyles.js'),
    makeContentScript('/content/install-hook-userstylesworld.js'),
  */
  return mergeCfg({
    entry,
    externals: {
      '/js/msg-base': 'API',
    },
    output: {
      path: DST + JS,
      library: {
        // Not using `self` in a content script as it can be spoofed via `<html id=self>`
        type: 'window',
      },
      module: true,
    },
  });
}

// fse.emptyDirSync(DST);

module.exports = [
  ...PAGES.map(p => mergeCfg({
    entry: {[p]: `/${p}/index.js`},
    output: {
      filename: ASSETS + '[name].js',
      chunkFilename: ASSETS + '[name].js',
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          codemirror: {
            test: /(node_modules[/\\]codemirror|codemirror-(?!factory)).+\.js$/,
            name: 'codemirror',
          },
          // common: {
          //   test: new RegExp(
          //     `^(${[JS, 'content/'].map(p => SRC + p).join('|')})`
          //       .replaceAll(/[\\/]/g, /[\\/]/.source),
          //     'i'),
          //   name: 'common',
          // },
        },
      },
    },
    plugins: [
      defineVars({PAGE: p}),
      new MiniCssExtractPlugin({
        filename: ASSETS + '[name].css',
        chunkFilename: ASSETS + '[name].css',
        // chunkFilename(pathData) {
        //   const c = pathData.chunk;
        //   if (c.name) return c.name;
        //   const files = [...c._groups].flatMap(g => g.origins.map(o => o.request));
        //   const ext = files[0].match(/\.\w+$/)[0];
        //   return ASSETS + c.runtime + '-' + files.map(f => path.basename(f, ext)).join('-') + ext;
        // },
      }),
      new HtmlWebpackPlugin({
        filename: p + '.html',
        template: SRC + p + '.html',
        inject: false,
        scriptLoading: 'defer',
      }),
    ],
  })),
  // makeLibrary('/content/apply.js'),
  makeLibrary([
    '/background/background-worker.js',
    '/edit/editor-worker.js',
  ]),
  // makeLibrary('/js/color/color-converter.js', 'colorConverter'),
  // makeLibrary('/js/csslint/csslint.js', 'CSSLint',
  //   {...LIB_EXPORT_DEFAULT, externals: {'./parserlib': 'parserlib'}}),
  // makeLibrary('/js/csslint/parserlib.js', 'parserlib', LIB_EXPORT_DEFAULT),
  // makeLibrary('/js/meta-parser.js', 'metaParser', LIB_EXPORT_DEFAULT),
  // makeLibrary('/js/moz-parser.js', 'extractSections', LIB_EXPORT_DEFAULT),
  makeLibrary('/js/usercss-compiler.js', 'compileUsercss', LIB_EXPORT_DEFAULT),
];
