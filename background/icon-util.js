'use strict';

define(require => {
  const {ignoreChromeError} = require('/js/toolbox');

  const imageDataCache = new Map();
  // https://github.com/openstyles/stylus/issues/335
  const hasCanvas = loadImage('/images/icon/16.png')
    .then(({data}) => data.some(b => b !== 255));

  const exports = {

    /** @param {chrome.browserAction.TabIconDetails} data */
    async setIcon(data) {
      if (await hasCanvas) {
        data.imageData = {};
        for (const [key, url] of Object.entries(data.path)) {
          data.imageData[key] = imageDataCache.get(url) || await loadImage(url);
        }
        delete data.path;
      }
      safeCall('setIcon', data);
    },

    /** @param {chrome.browserAction.BadgeTextDetails} data */
    setBadgeText(data) {
      safeCall('setBadgeText', data);
    },

    /** @param {chrome.browserAction.BadgeBackgroundColorDetails} data */
    setBadgeBackgroundColor(data) {
      safeCall('setBadgeBackgroundColor', data);
    },
  };

  // Caches imageData for icon paths
  async function loadImage(url) {
    const {OffscreenCanvas} = self.createImageBitmap && self || {};
    const img = OffscreenCanvas
      ? await createImageBitmap(await (await fetch(url)).blob())
      : await new Promise((resolve, reject) =>
        Object.assign(new Image(), {
          src: url,
          onload: e => resolve(e.target),
          onerror: reject,
        }));
    const {width: w, height: h} = img;
    const canvas = OffscreenCanvas
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), {width: w, height: h});
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const result = ctx.getImageData(0, 0, w, h);
    imageDataCache.set(url, result);
    return result;
  }

  function safeCall(method, data) {
    const {browserAction = {}} = chrome;
    const fn = browserAction[method];
    if (fn) {
      try {
        // Chrome supports the callback since 67.0.3381.0, see https://crbug.com/451320
        fn.call(browserAction, data, ignoreChromeError);
      } catch (e) {
        // FIXME: skip pre-rendered tabs?
        fn.call(browserAction, data);
      }
    }
  }

  return exports;
});
