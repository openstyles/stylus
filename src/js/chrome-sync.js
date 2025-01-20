import {compressToUTF16, decompressFromUTF16} from 'lz-string-unsafe';
import './browser';
import {sleep, tryJSONparse} from './util';

const syncApi = browser.storage.sync;
const kMAX = 'MAX_WRITE_OPERATIONS_PER_MINUTE';
export const LZ_KEY = {
  csslint: 'editorCSSLintConfig',
  stylelint: 'editorStylelintConfig',
  usercssTemplate: 'usercssTemplate',
};
/** @type {() => Promise<void>} */
export const clear = /*@__PURE__*/run.bind(syncApi.clear);
/** @type {(what: string | string[]) => Promise<void>} */
export const remove = /*@__PURE__*/run.bind(syncApi.remove);
/** @type {(what: string | string[] | object) => Promise<object>} */
export const get = /*@__PURE__*/syncApi.get.bind(syncApi);
/** @type {(what: object) => Promise<void>} */
export const set = /*@__PURE__*/run.bind(syncApi.set);
const toLZ = value => compressToUTF16(JSON.stringify(value));
export const unLZ = val => tryJSONparse(decompressFromUTF16(val));
export const getLZValue = async key => unLZ((await get(key))[key]);
export const setLZValue = (key, value) => set({[key]: toLZ(value)});

let busy;

export async function getLZValues(keys = Object.values(LZ_KEY)) {
  const data = await get(keys);
  for (const key of keys) {
    const value = data[key];
    data[key] = value && unLZ(value);
  }
  return data;
}

export function setLZValues(data) {
  const res = {};
  for (const key in data) res[key] = toLZ(data[key]);
  return set(res);
}

export async function run(...args) {
  while (true) {
    try {
      if (!busy) return await (busy = this.apply(syncApi, args));
      await busy.catch(() => 0);
    } catch (err) {
      if (!err.message.includes(kMAX)) throw err;
      busy = sleep(60e3 / (syncApi[kMAX] || 120) * (Math.random() * 2 + 1));
      await __.KEEP_ALIVE(busy);
    } finally {
      busy = null;
    }
  }
}
