'use strict';

define(require => {
  const {tryJSONparse} = require('/js/toolbox');

  let LZString;

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
      return LZString ||
        (LZString = await require(['/vendor/lz-string-unsafe/lz-string-unsafe.min']));
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

  /** @typedef {chrome.storage.StorageArea|StorageExtras} ChromeLocal */
  /** @typedef {chrome.storage.StorageArea|StorageExtras|StorageExtrasSync} ChromeSync */

  return {
    /** @type {ChromeLocal} */
    chromeLocal: Object.assign(browser.storage.local, StorageExtras),
    /** @type {ChromeSync} */
    chromeSync: Object.assign(browser.storage.sync, StorageExtras, StorageExtrasSync),
  };
});
