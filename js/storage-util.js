/* global loadScript tryJSONparse */
'use strict';

(() => {
  /** @namespace StorageExtras */
  const StorageExtras = {
    async getValue(key) {
      return (await this.get(key))[key];
    },
    async setValue(key, value) {
      await this.set({[key]: value});
    },
    async getLZValue(key) {
      return (await this.getLZValues([key]))[key];
    },
    async getLZValues(keys = Object.values(this.LZ_KEY)) {
      const [data, LZString] = await Promise.all([
        this.get(keys),
        this.getLZString(),
      ]);
      for (const key of keys) {
        const value = data[key];
        data[key] = value && tryJSONparse(LZString.decompressFromUTF16(value));
      }
      return data;
    },
    async setLZValue(key, value) {
      const LZString = await this.getLZString();
      return this.setValue(key, LZString.compressToUTF16(JSON.stringify(value)));
    },
    async getLZString() {
      if (!window.LZString) {
        await loadScript('/vendor/lz-string-unsafe/lz-string-unsafe.min.js');
        window.LZString = window.LZString || window.LZStringUnsafe;
      }
      return window.LZString;
    },
  };
  /** @namespace StorageExtrasSync */
  const StorageExtrasSync = {
    LZ_KEY: {
      csslint: 'editorCSSLintConfig',
      stylelint: 'editorStylelintConfig',
      usercssTemplate: 'usercssTemplate',
    },
  };
  /** @type {chrome.storage.StorageArea|StorageExtras} */
  window.chromeLocal = Object.assign(browser.storage.local, StorageExtras);
  /** @type {chrome.storage.StorageArea|StorageExtras|StorageExtrasSync} */
  window.chromeSync = Object.assign(browser.storage.sync, StorageExtras, StorageExtrasSync);
})();
