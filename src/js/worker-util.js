const loadedUrls = [];

export const importScriptsOnce = (...urls) => {
  // All files are in the same directory; not loading via an absolute path as it's bugged in Orion
  urls = urls.filter(u => !loadedUrls.includes(u));
  if (urls.length) {
    loadedUrls.push(...urls);
    importScripts(...urls);
  }
};
