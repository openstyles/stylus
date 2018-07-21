#!/usr/bin/env node
'use strict';

const fs = require('fs-extra');
const path = require('path');
const root = path.join(__dirname, '..');

const manifest = require(`${root}/manifest.json`);
const pkg = require(`${root}/package.json`);

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
  const result = compare(manifest.version, pkg.version);
  let file, obj;
  if (result === 0) {
    return console.log(good, 'Manifest & package versions match');
  } else if (result > 0) {
    pkg.version = manifest.version;
    file = 'package.json';
    obj = pkg;
  } else {
    manifest.version = pkg.version;
    file = 'manifest.json';
    obj = manifest;
  }
  console.log(warn, `Updating ${file} to ${pkg.version}`);
  return fs.writeFile(`${root}/${file}`, JSON.stringify(obj, null, '  ') + '\n');
}

updateVersions().catch(err => exit(err));
