'use strict';

const path = require('path');
const fse = require('fs-extra');
// const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
// const CopyPlugin = require('copy-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
// const CssMinimizer = require('css-minimizer-webpack-plugin');

const DEV = !true;
const BUILD = DEV ? 'DEV' : 'CHROME';
const IS_PROD = !DEV;
const DST = path.resolve('dist') + '/';
const ASSETS = 'assets';
const JS = 'js';
const SHIM = path.resolve('tools/shim') + '/';
const PAGE_BG = 'background';
const PAGES = [
  'edit',
  'options',
  PAGE_BG,
];

/** @type {webpack.} */
const CFG = {
  mode: DEV ? 'development' : 'production',
  devtool: 'inline-cheap-source-map',
  output: {
    path: DST + JS,
    filename: '[name].js',
  },
  resolve: {
    alias: {
      '/': `${__dirname}/src/`,
    },
  },
  optimization: {
    runtimeChunk: false,
    // splitChunks: {
    //   cacheGroups: {
    //     vendor: {
    //       test: /[\\/]node_modules[\\/]/,
    //       name: 'vendors',
    //       chunks: 'all',
    //     },
    //   },
    // },
    minimizer: [
      !DEV && new TerserPlugin({
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
    ],
  },
  module: {
    rules: [
      // {
      //   test: /\.css$/i,
      //   use: ['css-loader', 'postcss-loader'],
      // },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {loader: 'css-loader', options: {importLoaders: 1}},
          'postcss-loader',
        ],
      },
      {
        test: /\.m?js$/,
        use: {loader: 'babel-loader'},
        resolve: {fullySpecified: false},
      },
    ],
  },
  plugins: [
    // new CopyPlugin({
    //   patterns: [{from: 'src/index.html'}],
    // }),
    new MiniCssExtractPlugin(),
  ].filter(Boolean),
};

function addReport(base, entry) {
  base.plugins = [
    ...base.plugins,
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      reportFilename: base.output.path + '/' + Object.keys(entry).join('-') + '.report.html',
    }),
  ];
}

function mergeCfg(ovr, base) {
  if (!ovr) return base;
  if (base) {
    base = {...base};
  } else if (Array.isArray(base = ovr.entry) || (typeof base === 'string' && (base = [base]))) {
    ovr.entry = Object.fromEntries(base.map(e => [path.basename(e, '.js'), e]));
    base = {...CFG};
    if (DEV) addReport(base, ovr);
  } else {
    base = {...CFG};
  }
  for (const k in ovr) {
    const o = ovr[k];
    const b = base[k];
    base[k] = o && typeof o === 'object' && b && typeof b === 'object'
      ? mergeCfg(o, b)
      : o;
  }
  return base;
}

function makeLibrary(entry, name, extras) {
  return mergeCfg(extras, mergeCfg({
    output: {library: {type: 'global', name}},
    entry,
  }));
}

// fse.emptyDirSync(DST);
module.exports = [
  makeLibrary([
    '/background/background-worker.js',
    '/edit/editor-worker.js',
  ]),
  makeLibrary('/js/color/color-converter.js', 'colorConverter'),
  makeLibrary('/js/csslint/csslint.js', 'CSSLint', {externals: {'./parserlib': 'parserlib'}}),
  makeLibrary('/js/csslint/parserlib.js', 'parserlib'),
  makeLibrary('/js/meta-parser.js', 'metaParser'),
  makeLibrary('/js/moz-parser.js', 'extractSections'),
];
