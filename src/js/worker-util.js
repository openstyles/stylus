const loadedUrls = [];
const KEY = 'importScriptsOnce';

export const importScriptsOnce = __.ENTRY !== 'worker' ? global[KEY] : global[KEY] = (...urls) => {
  // `urls` are actually path-less file names in the same directory
  urls = urls.filter(u => !loadedUrls.includes(u));
  if (urls.length) {
    loadedUrls.push(...urls);
    importScripts(...urls);
  }
};
