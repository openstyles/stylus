import browser from '/js/browser';

export const bgReady = self.bgReady = {};
bgReady.styles = new Promise(r => (bgReady._resolveStyles = r));
bgReady.all = new Promise(r => (bgReady._resolveAll = r));

export const API = {};

export const browserCommands = {};

export const uuidIndex = Object.assign(new Map(), {
  custom: {},
  /** `obj` must have a unique `id`, a UUIDv4 `_id`, and Date.now() for `_rev`. */
  addCustom(obj, {get = () => obj, set}) {
    Object.defineProperty(uuidIndex.custom, obj._id, {get, set});
  },
});

export let isVivaldi = chrome.app ? null : false;

export function addAPI(methods) {
  for (const [key, val] of Object.entries(methods)) {
    const old = API[key];
    if (old && Object.prototype.toString.call(old) === '[object Object]') {
      Object.assign(old, val);
    } else {
      API[key] = val;
    }
  }
}

export async function detectVivaldi() {
  const wnd = await browser.windows.getCurrent();
  return (isVivaldi = wnd && !!(wnd.vivExtData || wnd.extData));
}
