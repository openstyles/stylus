#!/usr/bin/env node
'use strict';

const fs = require('fs-extra');
const path = require('path');

const root = path.join(__dirname, '..');

const files = {
  'codemirror': [
    'addon/comment/comment.js',
    'addon/dialog',
    'addon/edit/closebrackets.js',
    'addon/edit/matchbrackets.js',
    'addon/fold/brace-fold.js',
    'addon/fold/comment-fold.js',
    'addon/fold/foldcode.js',
    'addon/fold/foldgutter.css',
    'addon/fold/foldgutter.js',
    'addon/fold/indent-fold.js',
    'addon/hint/css-hint.js',
    'addon/hint/show-hint.css',
    'addon/hint/show-hint.js',
    'addon/lint/css-lint.js',
    'addon/lint/json-lint.js',
    'addon/lint/lint.css',
    'addon/lint/lint.js',
    'addon/scroll/annotatescrollbar.js',
    'addon/search/match-highlighter.js',
    'addon/search/matchesonscrollbar.css',
    'addon/search/matchesonscrollbar.js',
    'addon/search/searchcursor.js',
    'addon/selection/active-line.js',
    'keymap',
    'lib',
    'mode/css',
    'mode/javascript',
    'mode/stylus',
    'theme'
  ],
  'jsonlint': [
    'lib/jsonlint.js → jsonlint.js'
  ],
  'less': [
    'dist/less.min.js → less.min.js'
  ],
  'lz-string-unsafe': [
    'lz-string-unsafe.min.js → lz-string-unsafe.min.js'
  ]
};

async function updateReadme(lib) {
  const pkg = await fs.readJson(`${root}/node_modules/${lib}/package.json`);
  const file = `${root}/vendor/${lib}/README.md`;
  const txt = await fs.readFile(file, 'utf8');
  return fs.writeFile(file, txt.replace(/\bv[\d.]+[-\w]*\b/g, `v${pkg.version}`));
}

async function copy(lib, folder) {
  const [src, dest] = folder.split(/\s*→\s*/);
  try {
    await fs.copy(`${root}/node_modules/${lib}/${src}`, `${root}/vendor/${lib}/${dest || src}`);
  } catch (err) {
    exit(err);
  }
}

function exit(err) {
  if (err) console.error(err);
  process.exit(err ? 1 : 0);
}

Object.keys(files).forEach(lib => {
  updateReadme(lib);
  files[lib].forEach(folder => {
    copy(lib, folder);
  });
  console.log('\x1b[32m%s\x1b[0m', `${lib} files updated`);
});
