#!/usr/bin/env node
'use strict';

const fs = require('fs-extra');
const path = require('path');
const root = path.join(__dirname, '..');

const good = '\x1b[32m%s\x1b[0m';
const warn = '\x1b[36m%s\x1b[0m';

function exit(err) {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
}

function verToArray(v) {
  return v.replace('v', '').split('.').map(Number);
}

// Simple compare function since we can't require semverCompare here
function compare(v1, v2) {
  if (v1 === v2) {
    return 0;
  }
  const [maj1, min1, pat1] = verToArray(v1);
  const [maj2, min2, pat2] = verToArray(v2);
  const majMatch = maj1 === maj2;
  const minMatch = min1 === min2;
  if (
    maj1 > maj2 ||
    majMatch && min1 > min2 ||
    majMatch && minMatch && pat1 > pat2
  ) {
    return 1;
  }
  return -1;
}

async function updateVersions() {
  const regexp = /"([v\d.]+)"/;
  const manifest = await fs.readFile(`${root}/manifest.json`, 'utf8');
  const pkg = await fs.readFile(`${root}/package.json`, 'utf8');
  const manifestVersion = manifest.match(regexp);
  const pkgVersion = pkg.match(regexp);
  if (manifestVersion && pkgVersion) {
    const result = compare(manifestVersion[1], pkgVersion[1]);
    let match, version, file, str;
    if (result === 0) {
      return console.log(good, 'Manifest & package versions match');
    } else if (result > 0) {
      match = pkgVersion;
      version = manifestVersion[1];
      file = 'package.json';
      str = pkg;
    } else {
      match = manifestVersion;
      version = pkgVersion[1];
      file = 'manifest.json';
      str = manifest;
    }
    console.log(warn, `Updating ${file} to ${version}`);
    str = str.slice(0, match.index + 1) + version + str.slice(match.index + match[1].length + 1);
    return fs.writeFile(`${root}/${file}`, str);
  }
  throw Error(`Error reading ${manifestVersion ? '' : 'manifest.json'} ${pkgVersion ? '' : 'package.json'}`);
}

updateVersions().catch(err => exit(err));
