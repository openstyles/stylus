#!/usr/bin/env node
'use strict';

const fs = require('fs');
const {MANIFEST, ROOT, SRC} = require('./util');
const {version} = require(ROOT + 'package.json');

const mjPath = SRC + MANIFEST;
const mjText = fs.readFileSync(mjPath, 'utf8');
const [mjVer] = mjText.match(/(?<="version"\s*:\s*")[^"]+/);
if (mjVer !== version) {
  const res = mjText.replace(/(?<="version"\s*:\s*")[^"]+/, version);
  fs.writeFileSync(mjPath, res, 'utf8');
}
