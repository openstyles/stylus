#!/usr/bin/env node
'use strict';

const fs = require('fs-extra');
const path = require('path');

const root = path.join(__dirname, '..');

const files = {
  'codemirror': [
    '*', // only update existing vendor files
    'theme' // update all theme files
  ],
  'jsonlint': [
    'lib/jsonlint.js → jsonlint.js'
  ],
  'less': [
    'dist/less.min.js → less.min.js'
  ],
  'lz-string-unsafe': [
    'lz-string-unsafe.min.js'
  ],
  'semver-bundle': [
    'dist/semver.js → semver.js'
  ],
  'stylelint-bundle': [
    'stylelint-bundle.min.js'
  ],
  'stylus-lang-bundle': [
    'stylus.min.js'
  ]
};

async function updateReadme(lib) {
  const pkg = await fs.readJson(`${root}/node_modules/${lib}/package.json`);
  const file = `${root}/vendor/${lib}/README.md`;
  const txt = await fs.readFile(file, 'utf8');
  return fs.writeFile(file, txt.replace(/\bv[\d.]+[-\w]*\b/g, `v${pkg.version}`));
}

function isFolder(fileOrFolder) {
  const stat = fs.statSync(fileOrFolder);
  return stat.isDirectory();
}

// Rename CodeMirror$1 -> CodeMirror for development purposes
function renameCodeMirrorVariable(filePath) {
  const file = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(filePath, file.replace(/CodeMirror\$1/g, 'CodeMirror'));
}

function updateExisting(lib) {
  const libRoot = `${root}/node_modules/`;
  const vendorRoot = `${root}/vendor/`;
  const folders = [lib];

  const process = function () {
    if (folders.length) {
      const folder = folders.shift();
      const folderRoot = `${vendorRoot}${folder}`;
      const entries = fs.readdirSync(folderRoot);
      entries.forEach(entry => {
        // Remove $1 from "CodeMirror$1" in codemirror.js
        if (entry === 'codemirror.js') {
          renameCodeMirrorVariable(`${folderRoot}/${entry}`);
        } else if (entry !== 'README.md' && entry !== 'LICENSE') {
          // Ignore README.md & LICENSE files
          const entryPath = `${folderRoot}/${entry}`;
          try {
            if (fs.existsSync(entryPath)) {
              if (isFolder(entryPath)) {
                folders.push(`${folder}/${entry}`);
              } else {
                fs.copySync(`${libRoot}${folder}/${entry}`, entryPath);
              }
            }
          } catch (err) {
            // Show error in case file exists in vendor, but not in node_modules
            console.log('\x1b[36m%s\x1b[0m', `"${entryPath}" doesn't exist!`);
          }
        }
      });
    }
    if (folders.length) {
      process();
    }
  };

  process();
}

async function copy(lib, folder) {
  const [src, dest] = folder.split(/\s*→\s*/);
  try {
    if (folder === '*') {
      updateExisting(lib);
    } else {
      await fs.copy(`${root}/node_modules/${lib}/${src}`, `${root}/vendor/${lib}/${dest || src}`);
    }
  } catch (err) {
    exit(err);
  }
}

function exit(err) {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
}

Object.keys(files).forEach(lib => {
  updateReadme(lib);
  files[lib].forEach(folder => {
    if (folder === '*') {
      updateExisting(lib);
    } else {
      copy(lib, folder);
    }
  });
  console.log('\x1b[32m%s\x1b[0m', `${lib} files updated`);
});
