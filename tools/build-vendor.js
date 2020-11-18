/* eslint-env node */
'use strict';
const path = require('path');

const endent = require('endent');
const fetch = require('make-fetch-happen');
const fse = require('fs-extra');
const glob = require('tiny-glob');

const files = {
  'codemirror': [
    'addon/comment/comment.js',
    'addon/dialog',
    'addon/edit/closebrackets.js',
    'addon/edit/matchbrackets.js',
    'addon/fold/brace-fold.js',
    'addon/fold/comment-fold.js',
    'addon/fold/foldcode.js',
    'addon/fold/foldgutter.*',
    'addon/fold/indent-fold.js',
    'addon/hint/css-hint.js',
    'addon/hint/show-hint.*',
    'addon/lint/css-lint.js',
    'addon/lint/json-lint.js',
    'addon/lint/lint.*',
    'addon/scroll/annotatescrollbar.js',
    'addon/search/matchesonscrollbar.*',
    'addon/search/searchcursor.js',
    'addon/selection/active-line.js',
    'keymap/*',
    'lib/*',
    'mode/css',
    'mode/javascript',
    'mode/stylus',
    'theme/*',
  ],
  'jsonlint': [
    'lib/jsonlint.js → jsonlint.js',
    'README.md → LICENSE',
  ],
  'less-bundle': [
    'dist/less.min.js → less.min.js',
  ],
  'lz-string-unsafe': [
    'lz-string-unsafe.min.js',
  ],
  'semver-bundle': [
    'dist/semver.js → semver.js',
  ],
  'stylelint-bundle': [
    'stylelint-bundle.min.js',
    'https://github.com/stylelint/stylelint/raw/{VERSION}/LICENSE → LICENSE',
  ],
  'stylus-lang-bundle': [
    'dist/stylus-renderer.min.js → stylus-renderer.min.js',
  ],
  'usercss-meta': [
    'dist/usercss-meta.min.js → usercss-meta.min.js',
  ],
  'db-to-cloud': [
    'dist/db-to-cloud.min.js → db-to-cloud.min.js',
  ],
  'webext-launch-web-auth-flow': [
    'dist/webext-launch-web-auth-flow.min.js → webext-launch-web-auth-flow.min.js',
  ],
};

main().catch(console.error);

async function main() {
  for (const pkg in files) {
    console.log('\x1b[32m%s\x1b[0m', `Building ${pkg}...`);
    // other files
    const [fetched, copied] = await buildFiles(pkg, files[pkg]);
    // README
    await fse.outputFile(`vendor/${pkg}/README.md`, generateReadme(pkg, fetched, copied));
    // LICENSE
    await copyLicense(pkg);
  }
  console.log('\x1b[32m%s\x1b[0m', 'updating codemirror themes list...');
  await fse.outputFile('edit/codemirror-themes.js', await generateThemeList());
}

async function generateThemeList() {
  const themes = (await fse.readdir('vendor/codemirror/theme'))
    .filter(name => name.endsWith('.css'))
    .map(name => name.replace('.css', ''))
    .sort();
  return endent`
    /* Do not edit. This file is auto-generated by build-vendor.js */
    'use strict';

    /* exported CODEMIRROR_THEMES */
    const CODEMIRROR_THEMES = [
    ${
      themes.map(t => `  '${t.replace(/'/g, '\\$&')}',\n`).join('')
    }];
  ` + '\n';
}

async function copyLicense(pkg) {
  try {
    await fse.access(`vendor/${pkg}/LICENSE`);
    return;
  } catch (err) {
    // pass
  }
  for (const file of await glob(`node_modules/${pkg}/LICEN[SC]E*`)) {
    await fse.copy(file, `vendor/${pkg}/LICENSE`);
    return;
  }
  throw new Error(`cannot find license file for ${pkg}`);
}

async function buildFiles(pkg, patterns) {
  const fetchedFiles = [];
  const copiedFiles = [];
  for (let pattern of patterns) {
    pattern = pattern.replace('{VERSION}', require(`${pkg}/package.json`).version);
    const [src, dest] = pattern.split(/\s*→\s*/);
    if (src.startsWith('http')) {
      const content = await (await fetch(src)).text();
      await fse.outputFile(`vendor/${pkg}/${dest}`, content);
      fetchedFiles.push([src, dest]);
    } else {
      let dirty = false;
      for (const file of await glob(`node_modules/${pkg}/${src}`)) {
        if (dest) {
          await fse.copy(file, `vendor/${pkg}/${dest}`);
        } else {
          await fse.copy(file, path.join('vendor', path.relative('node_modules', file)));
        }
        copiedFiles.push([path.relative(`node_modules/${pkg}`, file), dest]);
        dirty = true;
      }
      if (!dirty) {
        throw new Error(`Pattern ${src} matches no files`);
      }
    }
  }
  return [fetchedFiles, copiedFiles];
}

function generateReadme(lib, fetched, copied) {
  const pkg = require(`${lib}/package.json`);
  let txt = `## ${pkg.name} v${pkg.version}\n\n`;
  if (fetched.length) {
    txt += `Following files are downloaded from HTTP:\n\n${generateList(fetched)}\n\n`;
  }
  if (copied.length) {
    txt += `Following files are copied from npm (node_modules):\n\n${generateList(copied)}\n`;
  }
  return txt;
}

function generateList(list) {
  return list.map(([src, dest]) => {
    if (dest) {
      return `* ${dest}: ${src}`;
    }
    return `* ${src}`;
  }).join('\n');
}

// Rename CodeMirror$1 -> CodeMirror for development purposes
// FIXME: is this a workaround for old version of codemirror?
// function renameCodeMirrorVariable(filePath) {
  // const file = fs.readFileSync(filePath, 'utf8');
  // fs.writeFileSync(filePath, file.replace(/CodeMirror\$1/g, 'CodeMirror'));
// }
