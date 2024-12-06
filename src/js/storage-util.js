import './browser';

const StorageExtras = {
  async getValue(key) {
    return (await this.get(key))[key];
  },
  async setValue(key, value) {
    await this.set({[key]: value});
  },
};

export const chromeLocal =
  /*@__PURE__*/Object.assign(browser.storage.local, StorageExtras);
export const chromeSession = __.MV3 &&
  /*@__PURE__*/Object.assign(chrome.storage.session, StorageExtras);
