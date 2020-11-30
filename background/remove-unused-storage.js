'use strict';

// Removing unused stuff from storage on extension update
// TODO: delete this by the middle of 2021

define(require => {
  const {chromeLocal} = require('/js/storage-util');

  function cleanLocalStorage() {
    try {
      localStorage.clear();
    } catch (e) {}
  }

  async function cleanChromeLocal() {
    const del = Object.keys(await chromeLocal.get())
      .filter(key => key.startsWith('usoSearchCache'));
    if (del.length) chromeLocal.remove(del);
  }

  return () => {
    cleanLocalStorage();
    setTimeout(cleanChromeLocal, 15e3);
  };
});
