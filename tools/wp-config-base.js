'use strict';

const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const InlineConstantExportsPlugin = require('@automattic/webpack-inline-constant-exports-plugin');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');
const {DEV, MV3, SRC, CM_PACKAGE_PATH, ROOT, nukeHtmlSpaces} = require('./util');
const {RawEnvPlugin} = require('./wp-raw-patch-plugin');
const {ALIASES, CSS, DST, FS_CACHE, SHIM, JS, VARS, RAW_VARS, SEP_ESC, SRC_ESC} =
  require('./wp-config-vars');
const patchCodemirror = require('./wp-patch-codemirror');
const patchLESS = require('./wp-patch-less');

const patchCJS = {
  loader: './tools/wp-cjs-to-esm-loader.js',
  test: new RegExp(`/node_modules/(${[
    '@eight04/',
    'db-to-cloud',
    '.*?universal-base64',
    'usercss-meta',
    'webext-launch-web-auth-flow',
  ].join('|')})`.replaceAll('/', SEP_ESC)),
};
const patchLZString = {
  loader: './tools/wp-lzstring-loader.js',
  test: require.resolve('lz-string-unsafe'),
};
/** calc plugin for clamp() is broken: https://github.com/postcss/postcss-calc/issues/123 */
const skipClamp = [
  'js/dlg/config-dialog.css',
];
const skipClampUse = [
  MiniCssExtractPlugin.loader,
  {loader: 'css-loader', options: {importLoaders: 1}},
];
/** @type {import('webpack/types').ModuleOptions['rules']} */
const moduleRules = [
  ...skipClamp.flatMap(skip => [{
    test: (skip = path.resolve(SRC + skip)),
    use: [...skipClampUse, 'postcss-loader'],
  },
  {
    test: /\.css$/,
    exclude: [skip],
    use: [...skipClampUse, {
      loader: 'postcss-loader',
      options: {
        postcssOptions: augment({plugins: ['postcss-calc']}, require('../postcss.config')),
      },
    }],
  }]),
  {
    test: /\.(png|svg|jpe?g|gif|ttf)$/i,
    type: 'asset/resource',
  },
  !MV3 && {
    test: /\.m?js(\?.*)?$/,
    exclude: [CM_PACKAGE_PATH], // speedup: excluding known ES5 or ES6 libraries
    loader: 'babel-loader',
    options: {root: ROOT},
    resolve: {fullySpecified: false},
  },
  {
    loader: 'html-loader',
    test: new RegExp(SRC_ESC + String.raw`.*[/\\].*\.html$`),
    options: {
      sources: false, // false = keep the source as-is
      minimize: false, // false = use our preprocessor
      preprocessor: nukeHtmlSpaces,
    },
  },
  patchCJS,
  patchLZString,
  ...patchCodemirror,
  ...patchLESS,
].filter(Boolean);

const [terserOwn, terserVendor] = [true, false].map(isOwn => new TerserPlugin({
  [isOwn ? 'exclude' : 'include']: /^less|codemirror|csslint|parserlib|beautify|jsonlint|webdav/,
  extractComments: false,
  parallel: 4,
  terserOptions: {
    ecma: MV3 ? 2024 : 2017,
    compress: {
      builtins_ecma: MV3 ? 2024 : 2017,
      builtins_pure: true,
      /** Used in own code but also in cm/*.js that goes into codemirror.js */
      global_defs: Object.fromEntries(Object.entries(ALIASES.funcs).map(e => ['@' + e[0], e[1]])),
      join_vars: !isOwn,
      lhs_constants: !isOwn,
      pure_getters: true,
      reduce_funcs: false,
      sequences: !isOwn,
      unsafe_arrows: isOwn,
      passes: 2, // adds one second but drops debugging artifacts like 0; in place if __.DEBUGLOG
    },
    output: {
      ascii_only: false,
      beautify: isOwn, // line numbers in bug reports + no delay in devtools to auto-prettify
      indent_level: 2,
      wrap_func_args: false,
    },
    mangle: {
      keep_classnames: true,
      keep_fnames: /^(?!(__)?webpack|onScriptComplete)/i,
      reserved: isOwn ? new Set() : null,
    },
  },
}));

/**
 * @return {import('webpack/types').Configuration}
 */
const getBaseConfig = ({vars} = {}) => ({
  mode: DEV ? 'development' : 'production',
  devServer: false,
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
    rules: moduleRules,
  },
  optimization: {
    concatenateModules: true, // makes DEV code run faster
    chunkIds: false,
    mangleExports: false,
    minimizer: DEV ? [] : [
      terserOwn,
      terserVendor,
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
    vars && new RawEnvPlugin(...vars),
    new webpack.ids.NamedChunkIdsPlugin({context: SRC + JS}),
    new InlineConstantExportsPlugin([/[/\\](consts|themer|sync-util)\.js$/]),
  ].filter(Boolean),
  stats: {
    // optimizationBailout: true,
  },
});

/**
 * @param {import('webpack/types').Configuration} ovr
 * @param {import('webpack/types').Configuration} [base]
 * @param {{}} [vars]
 * @return {import('webpack/types').Configuration}
 */
function augment(ovr, base, vars) {
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
    if (+process.env.REPORT) {
      (ovr.plugins || (ovr.plugins = [])).push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          openAnalyzer: false,
          reportFilename: DST + (entry.length > 1 ? '' : '.' + entry[0]) + '.report.html',
        })
      );
    }
    const mSrc = /@\/(content)?/.exec(Object.values(ovr.entry));
    if (mSrc)
      vars = [{...VARS, ...vars}, {...RAW_VARS}];
    base = getBaseConfig({vars});
    base.devtool = DEV && (mSrc?.[1] ? 'inline-source-map' : 'source-map');
  } else {
    base = {...base};
  }
  for (const k in ovr) {
    const o = ovr[k];
    const b = base[k];
    base[k] = o && typeof o === 'object' && b && typeof b === 'object'
      ? Array.isArray(o) && Array.isArray(b) ? [...b, ...o] : augment(o, b)
      : o;
  }
  return base;
}

module.exports = augment;
