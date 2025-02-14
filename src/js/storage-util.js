import './browser';

const StorageExtras = {
  async getValue(key) {
    return (await this.get(key))[key];
  },
};

export const chromeLocal =
  /*@__PURE__*/Object.assign(browser.storage.local, StorageExtras);
export const chromeSession = browser.storage.session;
export const GET_KEYS = !!chromeLocal.getKeys;
