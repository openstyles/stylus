import {DB, UCD} from '@/js/consts';
import {chromeLocal, GET_KEYS} from '@/js/storage-util';

export default class ChromeStorageDB {

  constructor(dbName, mirror) {
    this._max = dbName === DB ? 0 : 1;
    this._mirror = mirror;
    this._prefix = dbName === DB ? 'style-' : `${dbName}-`;
  }

  delete(id) {
    return chromeLocal.remove(this._prefix + id);
  }

  async get(id) {
    return (await chromeLocal.get(id = this._prefix + id))[id];
  }

  async getAll() {
    const all = !GET_KEYS && await chromeLocal.get();
    const keys = GET_KEYS ? await chromeLocal.getKeys() : Object.keys(all);
    const res = [];
    if (!this._max)
      await this._init(keys);
    for (const key of keys)
      if (key.startsWith(this._prefix))
        res.push(GET_KEYS ? key : all[key]);
    return GET_KEYS
      ? Object.values(await chromeLocal.get(res))
      : res;
  }

  async put(item, key) {
    key ??= item.id ??= (!this._max && await this._init(), this._max++);
    await chromeLocal.set({
      [this._prefix + key]: this._mirror && item[UCD]
        ? {...item, sections: undefined}
        : item,
    });
    return key;
  }

  async putMany(items, keys) {
    const data = {};
    const res = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const id = keys ? keys[i] : item.id ??= (!this._max && await this._init(), this._max++);
      data[this._prefix + id] = this._mirror && item[UCD]
        ? {...item, sections: undefined}
        : item;
      res.push(id);
    }
    await chromeLocal.set(data);
    return res;
  }

  async _init(keys) {
    let res = 1;
    let id;
    keys ??= GET_KEYS
      ? await chromeLocal.getKeys()
      : Object.keys(await chromeLocal.get());
    for (const key of keys)
      if (key.startsWith(this._prefix) && (id = +key.slice(this._prefix.length)) >= res)
        res = id + 1;
    this._max = res;
  }
}
