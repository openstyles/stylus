import {compressToUTF16, decompressFromUTF16} from 'lz-string-unsafe';
import './browser';
import {tryJSONparse} from './util';

const syncApi = browser.storage.sync;
const kMAX = 'MAX_WRITE_OPERATIONS_PER_MINUTE';
export const LZ_KEY = {
  csslint: 'editorCSSLintConfig',
  stylelint: 'editorStylelintConfig',
  usercssTemplate: 'usercssTemplate',
};
/** @type {() => Promise<void>} */
export const clear = /*@__PURE__*/syncApi.clear.bind(syncApi);
/** @type {(what: string | string[]) => Promise<void>} */
export const remove = /*@__PURE__*/syncApi.remove.bind(syncApi);
/** @type {(what: string | string[] | object) => Promise<object>} */
export const get = /*@__PURE__*/syncApi.get.bind(syncApi);
/** @type {(what: object) => Promise<void>} */
export const set = /*@__PURE__*/syncApi.set.bind(syncApi);
export const getValue = async key => (await get(key))[key];
export const setValue = (key, value) => set({[key]: value});

let promise;

export async function getLZValue(key) {
  return tryJSONparse(decompressFromUTF16((await get(key))[key]));
}

export function setLZValue(key, value) {
  return setValue(key, compressToUTF16(JSON.stringify(value)));
}

export async function getLZValues(keys = Object.values(LZ_KEY)) {
  const data = await get(keys);
  for (const key of keys) {
    const value = data[key];
    data[key] = value && tryJSONparse(decompressFromUTF16(value));
  }
  return data;
}

export async function run(...args) {
  while (true) {
    try {
      if (!promise) return await this(...args);
      await promise;
    } catch (err) {
      if (!err.message.includes(kMAX)) throw err;
      promise = promise ? promise.then(wait) : wait();
    }
  }
}

function wait() {
  return new Promise(resolve =>
    setTimeout(onTimeout,
      60e3 / (syncApi[kMAX] || 120) * (Math.random() * 2 + 1),
      resolve));
}

function onTimeout(resolve) {
  promise = null;
  resolve();
}
