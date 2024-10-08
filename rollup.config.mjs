import alias from '@rollup/plugin-alias';
import {babel} from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import {rollupPluginHTML as html} from '@web/rollup-plugin-html';
import {Buffer} from 'buffer';
import deepmerge from 'deepmerge';
import fs from 'fs';
import * as path from 'path';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

//#region Definitions

// const BUILD = 'DEV';
const BUILD = 'CHROME';
const IS_PROD = BUILD !== 'DEV';
const DST = 'dist/';
const ASSETS = 'assets';
const JS = 'js';
const SHIM = path.resolve('tools/shim') + '/';
const PAGE_BG = 'background';
const PAGES = [
  'edit',
  'options',
  PAGE_BG,
];

//#endregion
//#region Plugins

const PLUGINS = [
  copyAndWatch([
    'manifest.json',
    '_locales',
    'assets/icons.ttf',
    'images/eyedropper',
    'images/icon',
    'npm:less/dist/less.min.js -> less.js',
    'npm:stylus-lang-bundle/dist/stylus-renderer.min.js -> stylus-lang-bundle.js',
    'npm:stylelint-bundle/dist/stylelint-bundle.min.js -> stylelint-bundle.js',
  ]),
  commonjs(),
  nodeResolve(),
  alias({
    entries: [
      {find: /^\//, replacement: path.resolve('src') + '/'},
      {find: './fs-drive', replacement: SHIM + 'null.js'},
      {find: 'fs', replacement: SHIM + 'null.js'},
      {find: 'path', replacement: SHIM + 'path.js'},
      {find: 'url', replacement: SHIM + 'url.js'},
    ],
  }),
  babel({
    babelHelpers: 'bundled',
    presets: [
      ['@babel/preset-env', {
        useBuiltIns: false,
        bugfixes: true,
        loose: true,
      }],
    ],
  }),
];
const PLUGIN_TERSER = IS_PROD && terser({
  compress: {
    ecma: 8,
    passes: 2,
    reduce_funcs: false,
    // unsafe_arrows: true, // TODO: only apply to our code as it breaks CodeMirror
  },
  output: {
    ascii_only: false,
    comments: false,
    wrap_func_args: false,
  },
});
const PLUGIN_CSS = postcss({
  extract: true,
});

//#endregion
//#region Entry

function makeEntry(pages, file, opts) {
  return deepmerge({
    input: pages
      ? Object.fromEntries(pages.map(p => [p, getEntryName(p)]))
      : {[getFileName(file)]: file},
    output: {
      dir: DST + (pages ? ASSETS : JS),
      sourcemap: IS_PROD ? '' : 'inline',
      generatedCode: 'es2015',
      externalLiveBindings: false,
      freeze: false,
      intro: chunk => 'const ' +
        Object.entries({JS, BUILD, ENTRY: chunk.name})
          .map(([k, v]) => v && `__${k} = '${v}'`)
          .filter(Boolean)
          .join(',') + ';',
      assetFileNames: 'styles.css',
      chunkFileNames: getChunkName,
      entryFileNames: '[name].js',
    },
    plugins: [
      ...PLUGINS,
      ...pages?.map(p => copyAndWatch([p + '.html'], {
        __ASSET_JS: p + '.js',
        __ASSET_CSS: p + '.css',
      })) || [],
      pages && pages !== PAGE_BG && PLUGIN_CSS,
      PLUGIN_TERSER,
    ].filter(Boolean),
  }, opts || {});
}

function makeEntryIIFE(file, name, opts) {
  return makeEntry(undefined, file, deepmerge({
    output: {
      name,
      format: 'umd',
    },
  }, opts || {}));
}

//#endregion
//#region Util

function copyAndWatch(files, vars) {
  const rxVars = vars && new RegExp(`${Object.keys(vars).join('|')}`, 'g');
  const replacer = vars && (s => vars[s]);
  const npms = {};
  const transform = (buf, name) => {
    let str = buf.toString();
    if (vars) str = str.replace(rxVars, replacer);
    if (name.endsWith('.js')) {
      const map = npms[name] + '.map';
      str = str.replace(/(\r?\n\/\/# sourceMappingURL=).+/,
        IS_PROD || !fs.existsSync(map) ? '' :
          '$1data:application/json;charset=utf-8;base64,' +
          fs.readFileSync(map).toString('base64'));
    }
    return new Buffer(str);
  };
  const targets = files.map(f => {
    const [from, to] = f.split(/\s*->\s*/);
    const isJS = from.endsWith('.js');
    const npm = from.startsWith('npm:') && from.replace('npm:', 'node_modules/');
    if (npm && isJS) npms[path.basename(npm)] = npm;
    return {
      src: npm || `src/${from}`,
      dest: DST + (
        isJS ? JS :
          /\b(css|images)\b/.test(from) ? ASSETS :
            ''
      ),
      rename: to,
      transform: (isJS || vars && /\.(js(on)?|css|html)$/.test(from)) &&
        transform,
    };
  });
  return Object.assign(copy({targets}), {
    buildStart() {
      for (const f of files) this.addWatchFile(f);
    },
  });
}

function getChunkName(chunk) {
  return path.basename(chunk.facadeModuleId || '') || 'chunk.js';
}

function getEntryName(inputs) {
  return `src/${inputs}/index.js`;
}

function getFileName(file) {
  return path.parse(file).name;
}

//#endregion
//#region Main

// fse.emptyDir(DST);

export default [
  {
    output: {
      dir: DST,
      experimentalMinChunkSize: 10e3,
    },
    plugins: [
      ...PLUGINS,
      html({
        input: PAGES.map(p => `src/${p}.html`),
      }),
    ],
  },
  makeEntry(PAGES),
  makeEntryIIFE('/background/background-worker.js'),
  makeEntryIIFE('/edit/editor-worker.js'),
  makeEntryIIFE('/js/color/color-converter.js', 'colorConverter'),
  makeEntryIIFE('/js/csslint/csslint.js', 'CSSLint', {
    external: './parserlib',
    output: {globals: id => id.match(/parserlib/)?.[0] || id},
  }),
  makeEntryIIFE('/js/csslint/parserlib.js', 'parserlib'),
  makeEntryIIFE('/js/meta-parser.js', 'metaParser'),
  makeEntryIIFE('/js/moz-parser.js', 'extractSections'),
];

//#endregion
