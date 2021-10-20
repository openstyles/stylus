/* global chromeLocal */// storage-util.js
'use strict';

/* exported createChromeStorageDB */
function createChromeStorageDB() {
  let INC;

  const PREFIX = 'style-';
  const METHODS = {

    delete(id) {
      return chromeLocal.remove(PREFIX + id);
    },

    // FIXME: we don't use this method at all. Should we remove this?
    get(id) {
      return chromeLocal.getValue(PREFIX + id);
    },

    async getAll() {
      const all = await chromeLocal.get();
      if (!INC) prepareInc(all);
      return Object.entries(all)
        .map(([key, val]) => key.startsWith(PREFIX) && Number(key.slice(PREFIX.length)) && val)
        .filter(Boolean);
    },

    async put(item) {
      if (!item.id) {
        if (!INC) await prepareInc();
        item.id = INC++;
      }
      await chromeLocal.setValue(PREFIX + item.id, item);
      return item.id;
    },

    async putMany(items) {
      const data = {};
      for (const item of items) {
        if (!item.id) {
          if (!INC) await prepareInc();
          item.id = INC++;
        }
        data[PREFIX + item.id] = item;
      }
      await chromeLocal.set(data);
      return items.map(_ => _.id);
    },
  };

  async function prepareInc(data) {
    INC = 1;
    for (const key in data || await chromeLocal.get()) {
      if (key.startsWith(PREFIX)) {
        const id = Number(key.slice(PREFIX.length));
        if (id >= INC) {
          INC = id + 1;
        }
      }
    }
  }

  return function dbExecChromeStorage(method, ...args) {
    return METHODS[method](...args);
  };
}
