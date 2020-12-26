/* global chromeLocal */// storage-util.js
'use strict';

// Removing unused stuff from storage on extension update
// TODO: delete this by the middle of 2021

try {
  localStorage.clear();
} catch (e) {}

setTimeout(async () => {
  const del = Object.keys(await chromeLocal.get())
    .filter(key => key.startsWith('usoSearchCache'));
  if (del.length) chromeLocal.remove(del);
}, 15e3);
