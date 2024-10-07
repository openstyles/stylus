'use strict';

const fetch = require('node-fetch');
const fs = require('fs');
const fse = require('fs-extra');
const glob = require('fast-glob').sync;
const path = require('path');

const files = {
  'jsonlint': [
    // TODO: migrate to a webpack loader
    {'lib/jsonlint.js': text =>
      text.replace('var jsonlint = (function(){', '')
        .split('return parser;', 1)[0] + 'export default parser;',
    },
    'README.md -> LICENSE',
  ],
};

main().catch(console.error);

async function main() {
  fse.emptyDirSync('vendor');
  await Promise.all(Object.keys(files).map(async pkg => {
    console.log(`Building ${pkg}...`);
    const pkgName = getFileName(pkg);
    const flatPkg = pkg === pkgName || files[pkgName]
      ? pkg.replace(/\//g, '-')
      : pkgName;
    const res = await buildFiles(pkg, flatPkg, files[pkg]);
    buildLicense(pkg, flatPkg);
    buildReadme(pkg, flatPkg, res);
  }));
}

async function buildFiles(pkg, flatPkg, patterns) {
  let fetched = '';
  let copied = '';
  for (let pattern of patterns) {
    let func;
    if (typeof pattern === 'object') [pattern, func] = Object.entries(pattern)[0];
    const [src, dest = getFileName(src)] = (func?.name || pattern).split(/\s*->\s*/);
    if (/^https?:/.test(src)) {
      const req = await fetch(src);
      if (req.status >= 400) throw new Error(`Network error ${req.status} for ${src}`);
      fse.outputFileSync(`vendor/${flatPkg}/${dest}`, await req.text());
      fetched += `* ${dest}: ${src}\n`;
    } else {
      const files = glob(`node_modules/${pkg}/${src}`);
      if (!files.length) {
        throw new Error(`Pattern ${src} matches no files`);
      }
      for (const file of files) {
        const destPath = dest
          ? `vendor/${flatPkg}/${dest}`
          : `vendor/${path.relative('node_modules', file).replace(pkg + '/', flatPkg + '/')}`;
        const txt = file.endsWith('.js') && fs.readFileSync(file, 'utf8');
        const txt2 = txt && (func ? func(txt) : txt.replace(/\n\/\/# sourceMappingURL=.*\s*$/, '\n'));
        const hasSM = txt && !func && txt !== txt2;
        if (txt !== txt2) {
          fse.outputFileSync(destPath, txt2);
        } else {
          fse.copySync(file, destPath);
        }
        copied += `* ${reportFile(pkg, file, dest)}${hasSM ? ' (removed sourceMappingURL)' : ''}\n`;
      }
    }
  }
  return {fetched, copied};
}

function buildLicense(pkg, flatPkg) {
  const LICENSE = `vendor/${flatPkg}/LICENSE`;
  if (!fs.existsSync(LICENSE)) {
    const [src] = glob(`node_modules/${pkg}/LICEN[SC]E*`);
    if (!src) throw new Error(`Cannot find license file for ${pkg}`);
    fse.copySync(src, LICENSE);
  }
}

function buildReadme(pkg, flatPkg, {fetched, copied}) {
  const {name, version} = require(`${pkg}/package.json`);
  fse.outputFileSync(`vendor/${flatPkg}/README.md`, [
    `## ${name} v${version}`,
    fetched && `Files downloaded from URL:\n${fetched}`,
    copied && `Files copied from NPM (node_modules):\n${copied}`,
  ].filter(Boolean).join('\n\n'));
}

function getFileName(path) {
  return path.split('/').pop();
}

function reportFile(pkg, file, dest) {
  file = path.relative(`node_modules/${pkg}`, file).replace(/\\/g, '/');
  if (!dest || dest === file) {
    return file;
  }
  if (file.includes('/') && getFileName(dest) === getFileName(file)) {
    file = file.replace(/[^/]+$/, '*');
  }
  return `${dest}: ${file}`;
}
