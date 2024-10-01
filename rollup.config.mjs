import alias from '@rollup/plugin-alias';
import {babel} from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import * as fse from 'fs-extra';
import * as path from 'path';
import {Buffer} from 'buffer';
import copy from 'rollup-plugin-copy';
import css from 'rollup-plugin-css-only';

const BUILD = 'DEV';
const SRC = path.resolve('src') + '/';
const DST = SRC + 'dist/';
const SHIM = path.resolve('tools/shim') + '/';

const ENTRY_BG = 'background';
const ENTRIES = [
  'edit',
  ENTRY_BG,
];

const getChunkName = chunk => path.basename(chunk.facadeModuleId || '') || 'chunk.js';

const PLUGINS = [
  copyAndWatch([
    'manifest.json',
    '_locales',
    'css/icons.ttf',
    'images/eyedropper',
    'images/icon',
  ]),
  commonjs(),
  nodeResolve(),
  alias({
    entries: [
      {find: /^\//, replacement: SRC},
      {find: './fs-drive', replacement: SHIM + 'empty.js'},
      {find: 'fs', replacement: SHIM + 'empty.js'},
      {find: 'path', replacement: SHIM + 'path.js'},
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
const PLUGIN_TERSER = BUILD !== 'DEV' && terser({
  compress: {
    ecma: 8,
    passes: 2,
    reduce_funcs: false,
    unsafe_arrows: true,
  },
  output: {
    ascii_only: false,
    comments: false,
    wrap_func_args: false,
  },
});
const PLUGIN_CSS = css();

function makeEntry(entry, file, output, opts) {
  const entryPrefix = entry ? entry + '-' : '';
  const entryCss = entry ? 'css/' + entry + '.css' : undefined;
  const entryJs = `js/${entry || '[name]'}.js`;
  return ({
    input: {
      [entry || path.parse(file).name]: file || `src/${entry}/index.js`,
    },
    output: {
      dir: DST,
      // sourcemap: 'inline',
      generatedCode: 'es2015',
      externalLiveBindings: false,
      freeze: false,
      intro: entry ? `const __BUILD = "${BUILD}", __ENTRY = "${entry}";` : '',
      assetFileNames: entryCss,
      chunkFileNames: chunk => 'js/' + entryPrefix + getChunkName(chunk),
      entryFileNames: entryJs,
      ...output,
    },
    plugins: [
      ...PLUGINS,
      entry && entry !== ENTRY_BG && PLUGIN_CSS,
      PLUGIN_TERSER,
      copyAndWatch([`${entry}.html`], {__ENTRY_JS: entryJs, __ENTRY_CSS: entryCss}),
    ].filter(Boolean),
    ...opts,
  });
}

function makeEntryIIFE(file, opts) {
  return makeEntry(undefined, file, {format: 'iife'}, opts);
}

function copyAndWatch(files, vars) {
  const transform = vars && (
    buf => new Buffer(buf.toString().replace(
      new RegExp(`${Object.keys(vars).join('|')}`, 'g'),
      s => vars[s]
    )));
  return Object.assign(copy({
    flatten: false,
    targets: files.map(f => ({
      src: 'src/' + f,
      dest: DST,
      transform,
    })),
  }), {
    buildStart() {
      for (const f of files) this.addWatchFile(f);
    },
  });
}

fse.emptyDir(DST);

export default [
  ...ENTRIES.map(e => makeEntry(e)),
  makeEntryIIFE('/edit/editor-worker.js'),
  makeEntryIIFE('/js/csslint/csslint.js', {external: './parserlib'}),
  makeEntryIIFE('/js/csslint/parserlib.js'),
];
