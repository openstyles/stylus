#!/usr/bin/env node
'use strict';

const fs = require('fs');
const rimraf = require('rimraf');

// See https://github.com/isaacs/rimraf/issues/102#issuecomment-412310309
rimraf('node_modules/!(rimraf|.bin)', fs, () => {});
