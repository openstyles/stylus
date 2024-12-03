'use strict';

const fse = require('fs-extra');

fse.emptyDirSync(__dirname + '/../node_modules/.cache/webpack');
