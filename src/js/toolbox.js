import browser from './browser';
import {CHROME} from './ua';
import {ownRoot} from './urls';
import {deepCopy, hasOwn} from './util-base';

export * from './ua';
export * as URLS from './urls';
export * from './util-base';

export const MF = /*@__PURE__*/ chrome.runtime.getManifest();
export const MF_ICON = /*@__PURE__*/ MF.icons[16].replace(ownRoot, '');
export const MF_ICON_PATH = /*@__PURE__*/ MF_ICON.slice(0, MF_ICON.lastIndexOf('/') + 1);
export const MF_ICON_EXT = /*@__PURE__*/ MF_ICON.slice(MF_ICON.lastIndexOf('.'));
export const MF_ACTION_HTML = (process.env.MV3 ? MF.action : MF.browser_action).default_popup;

// see PR #781
export const CHROME_POPUP_BORDER_BUG = !process.env.MV3 && (CHROME >= 62 && CHROME <= 74);
export const browserWindows = browser.windows;
/** A scoped listener won't trigger for our [big] stuff in `local`, Chrome 73+, FF */
export const onStorageChanged = chrome.storage.sync.onChanged || chrome.storage.onChanged;

export const getOwnTab = () => browser.tabs.getCurrent();
export const getActiveTab = async () =>
  (await browser.tabs.query({currentWindow: true, active: true}))[0] ||
  // workaround for Chrome bug when devtools for our popup is focused
  browserWindows &&
  (await browser.tabs.query({windowId: (await browserWindows.getCurrent()).id, active: true}))[0];
export const ignoreChromeError = () => chrome.runtime.lastError;

// TODO: remove when min_chrome_version >= 113, strict_min_version >= 112
if (!process.env.MV3 && !hasOwn(URLSearchParams.prototype, 'size')) {
  Object.defineProperty(URLSearchParams.prototype, 'size', {
    get() { return [...this.keys()].length; },
  });
}

export function debounce(fn, delay, ...args) {
  delay = +delay || 0;
  const t = performance.now() + delay;
  let old = debounce.timers.get(fn);
  if (!old && debounce.timers.set(fn, old = {})
    || delay && old.time < t && (clearTimeout(old.timer), true)
    || old.args.length !== args.length
    || old.args.some((a, i) => a !== args[i]) // note that we can't use deepEqual here
  ) {
    old.args = args;
    old.time = t;
    old.timer = setTimeout(debounce.run, delay, fn, args);
  }
}

Object.assign(debounce, {
  timers: new Map(),
  run(fn, args) {
    debounce.timers.delete(fn);
    fn(...args);
  },
  unregister(fn) {
    const data = debounce.timers.get(fn);
    if (data) {
      clearTimeout(data.timer);
      debounce.timers.delete(fn);
    }
  },
});

/* A simple polyfill in case DOM storage is disabled in the browser */
export let sessionStore = /*@__PURE__*/ new Proxy({}, {
  get(target, name) {
    try {
      const val = sessionStorage[name];
      sessionStore = sessionStorage;
      return val;
    } catch {
      Object.defineProperty(window, 'sessionStorage', {value: target});
    }
  },
  set(target, name, value) {
    try {
      sessionStorage[name] = `${value}`;
      sessionStore = sessionStorage;
    } catch {
      this.get(target);
      target[name] = `${value}`;
    }
    return true;
  },
  deleteProperty(target, name) {
    return delete target[name];
  },
});

export async function closeCurrentTab() {
  // https://bugzil.la/1409375
  const tab = await getOwnTab();
  if (tab) return chrome.tabs.remove(tab.id);
}

global._deepCopy = deepCopy; // used by other views for cloning into this JS realm
