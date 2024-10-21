const loadedUrls = [];

export const importScriptsOnce = (...urls) => {
  urls = urls.map(u => !loadedUrls.includes(u = `/${process.env.JS}${u}`) && u).filter(Boolean);
  if (urls.length) {
    loadedUrls.push(...urls);
    importScripts(...urls);
  }
};
