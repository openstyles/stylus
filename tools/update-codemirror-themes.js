#!/usr/bin/env node
'use strict';

const fs = require('fs-extra');
const path = require('path');

// Update theme names list in codemirror-editing-hook.js
async function getThemes() {
  const p = path.join(__dirname, '..', 'vendor/codemirror/theme/');
  const files = await fs.readdir(p);
  return files
    .filter(name => name.endsWith('.css'))
    .map(name => name.replace('.css', ''))
    .sort();
}

function replaceThemes(content, themes) {
  const lineFeed = content.includes('\r\n') ? '\r\n' : '\n';
  return content.replace(
    /(\x20+)(\/\*\s*populate-theme-start\s*\*\/)[\s\S]+?(\/\*\s*populate-theme-end\s*\*\/)/,
    (_, indent, intro, outro) =>
      indent + intro + lineFeed +
      themes.map(_ => `${indent}'${_}',`).join(lineFeed) + lineFeed +
      indent + outro
  );
}

async function updateHook(themes) {
  const fileName = path.join(__dirname, '..', 'edit/codemirror-editing-hooks.js');
  const content = await fs.readFile(fileName, 'utf-8');
  fs.writeFile(fileName, replaceThemes(content, themes));
}

function exit(err) {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
}

getThemes()
  .then(themes => updateHook(themes))
  .then(() => console.log('\x1b[32m%s\x1b[0m', 'codemirror themes list updated'))
  .catch(exit);
