import alias from '@rollup/plugin-alias';
import {babel} from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import * as fse from 'fs-extra';
import * as path from 'path';
import css from 'rollup-plugin-css-only';

const BUILD = 'DEV';
const SRC = path.resolve('src');
const DST = SRC + '/dist';
const DST_JS = DST + '/js';
const ENTRY_BG = 'background';
const ENTRIES = [
  'edit',
  ENTRY_BG,
];

const getChunkName = chunk => path.basename(chunk.facadeModuleId || '') || 'chunk.js';

const OUTPUT = {
  dir: DST,
  chunkFileNames: getChunkName,
  entryFileNames: '[name].js',
  generatedCode: 'es2015',
  externalLiveBindings: false,
  freeze: false,
  // sourcemap: 'inline',
};
const PLUGINS = [
  commonjs(),
  nodeResolve(),
  alias({
    entries: [
      {find: /^(?=\/)/, replacement: SRC},
      {find: './fs-drive', replacement: path.resolve('tools/shim/empty.js')},
      {find: 'fs', replacement: path.resolve('tools/shim/empty.js')},
      {find: 'path', replacement: path.resolve('tools/shim/path.js')},
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
const PLUGINS_CSS = [...PLUGINS, css()];

const makeEntry = (entry, file, output, opts) => {
  const plugins = !entry || entry === ENTRY_BG ? PLUGINS : PLUGINS_CSS;
  const entryPrefix = entry ? entry + '-' : '';
  return ({
    input: {
      [entry || path.parse(file).name]: file || `${SRC}/${entry}/index.js`,
    },
    output: {
      ...OUTPUT,
      dir: entry ? DST : DST_JS,
      intro: entry ? `const __BUILD = "${BUILD}", __ENTRY = "${entry}";` : '',
      assetFileNames: entry ? entry + '.css' : undefined,
      chunkFileNames: chunk => entryPrefix + getChunkName(chunk),
      ...output,
    },
    plugins: !entry ? plugins : [
      ...plugins,
      copy({targets: [{src: path.resolve(`${SRC}/${entry}.html`), dest: DST}]}),
    ],
    ...opts,
  });
};

const makeEntryIIFE = (file, opts) => makeEntry(undefined, file, {format: 'iife'}, opts);

if (PLUGIN_TERSER) {
  PLUGINS.push(PLUGIN_TERSER);
  PLUGINS_CSS.push(PLUGIN_TERSER);
}

fse.emptyDirSync(DST);
for (const e of [
  'manifest.json',
  'css/icons.ttf',
  ...ENTRIES.map(e => e + '.html'),
]) {
  fse.copy(`${SRC}/${e}`, `${DST}/${path.basename(e)}`, {
    overwrite: true,
    preserveTimestamps: true,
  });
}

export default [
  ...ENTRIES.map(e => makeEntry(e)),
  makeEntryIIFE('/edit/editor-worker.js'),
  makeEntryIIFE('/js/csslint/csslint.js', {external: './parserlib'}),
  makeEntryIIFE('/js/csslint/parserlib.js'),
];
