#!/usr/bin/env node
/*
 Generates a list of callbackless chrome.* API methods from chromium source
 to be used in browser.js
*/
'use strict';

const manifest = require('../src/manifest.json');

(async () => {
  manifest.permissions.push('extension', 'i18n', 'runtime');
  const FN_NO_CB = /\bstatic (\w+) (\w+)(?![^)]*callback)\(\s*([^)]*)\)/g;
  const BASE = 'https://github.com/chromium/chromium/raw/master/';
  const PATHS = [
    [BASE + 'extensions/common/api/', 'schema.gni'],
    [BASE + 'chrome/common/extensions/api/', 'api_sources.gni'],
  ];
  console.debug('Downloading...');
  const schemas = await Promise.all(PATHS.map(([path, name]) => fetchText(path + name)));
  const files = {};
  schemas.forEach((text, i) => {
    const path = PATHS[i][0];
    text.match(/\w+\.(idl|json)/g).forEach(name => {
      files[name] = path;
    });
  });
  const resList = [];
  const resObj = {};
  await Promise.all(Object.entries(files).map(processApi));
  Object.entries(resObj)
    .sort(([a], [b]) => a < b ? -1 : a > b)
    .forEach(([key, val]) => {
      delete resObj[key];
      resObj[key] = val;
      val.sort();
    });
  console.log(resList.sort().join('\n'));
  console.log(JSON.stringify(resObj));

  async function fetchText(file) {
    return (await fetch(file)).text();
  }

  async function processApi([file, path]) {
    const [fileName, ext] = file.split('.');
    const api = manifest.permissions.find(p =>
      fileName === p.replace(/([A-Z])/g, s => '_' + s.toLowerCase()) ||
      fileName === p.replace(/\./g, '_'));
    if (!api) return;
    const text = await fetchText(path + file);
    const noCmt = text.replace(/^\s*\/\/.*$/gm, '');
    if (ext === 'idl') {
      const fnBlock = (noCmt.split(/\n\s*interface Functions {\s*/)[1] || '')
        .split(/\n\s*interface \w+ {/)[0];
      for (let m; (m = FN_NO_CB.exec(fnBlock));) {
        const [, type, name, params] = m;
        resList.push(`chrome.${api}.${name}(${params.replace(/\n\s*/g, ' ')}): ${type}`);
        (resObj[api] || (resObj[api] = [])).push(name);
      }
    } else {
      for (const fn of JSON.parse(noCmt)[0].functions || []) {
        const last = fn.parameters[fn.parameters.length - 1];
        if (!fn.returns_async && (!last || last.type !== 'function')) {
          resList.push(`chrome.${api}.${fn.name}(${
            fn.parameters.map(p => `${p.optional ? '?' : ''}${p.name}: ${p.type}`).join(', ')
          })`);
          (resObj[api] || (resObj[api] = [])).push(fn.name);
        }
      }
    }
  }
})();
