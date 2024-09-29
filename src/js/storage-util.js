import browser from '/js/browser';
import {tryJSONparse} from './toolbox';
import {compressToUTF16, decompressFromUTF16} from 'lz-string-unsafe';

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
    const data = await this.get(keys);
    for (const key of keys) {
      const value = data[key];
      data[key] = value && tryJSONparse(decompressFromUTF16(value));
    }
    return data;
  },
  setLZValue(key, value) {
    return this.setValue(key, compressToUTF16(JSON.stringify(value)));
  },
};

export const chromeLocal = Object.assign(browser.storage.local, StorageExtras);
export const chromeSync = Object.assign(browser.storage.sync, StorageExtras, {
  // TODO: export directly
  LZ_KEY: {
    csslint: 'editorCSSLintConfig',
    stylelint: 'editorStylelintConfig',
    usercssTemplate: 'usercssTemplate',
  },
});
