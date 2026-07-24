import '@/js/browser';
import {k_deepCopy, kSidebar, pSideManager, pSideOptions} from '@/js/consts';
import {API} from '@/js/msg-api';
import {__values} from '@/js/prefs';
import {CHROME} from '@/js/ua';
import {ownRoot} from '@/js/urls';
import {deepCopy, isSidebar, NOP} from '@/js/util';

export let ownTab;
// Firefox uses a different id for moz-extension://
export const ownId = __.MV3 ? chrome.runtime.id : chrome.runtime.getURL('').split('/')[2];
export const MF = /*@__PURE__*/ chrome.runtime.getManifest();
export const MF_ICON = /*@__PURE__*/ MF.icons[
  __.IS_BG ? 16 : devicePixelRatio > 3 ? 128 : 16 * Math.max(1, Math.round(devicePixelRatio))
].replace(ownRoot, '');
export const MF_ICON_PATH = /*@__PURE__*/ MF_ICON.slice(0, MF_ICON.lastIndexOf('/') + 1);
export const MF_ICON_EXT = /*@__PURE__*/ MF_ICON.slice(MF_ICON.lastIndexOf('.'));

export const browserAction = __.MV3 ? chrome.action : browser.browserAction;
export const browserWindows = browser.windows;
export const browserSidepanel = chrome.sidePanel;
export const browserSidebar = browserSidepanel || browser.sidebarAction;
export const webNavigation = browser.webNavigation;

export const closeCurrentTab = async () => {
  if ((ownTab ??= await getOwnTab()))
    return chrome.tabs.remove(ownTab.id);
};

export const getOwnTab = async () => (ownTab = await browser.tabs.getCurrent() || false);

export const getActiveTab = async () => {
  let [v] = await browser.tabs.query({currentWindow: true, active: true});
  // workaround for Chrome bug when devtools for our popup is focused
  if (!v && browserWindows && (v = await browserWindows.getCurrent().catch(NOP)))
    [v] = await browser.tabs.query({windowId: v.id, active: true}).catch(NOP);
  return v;
};

export const ignoreChromeError = () => chrome.runtime.lastError;

/**
 * @param {{}} [mgr] manager options or falsy to open options
 * @param {boolean} [side]
 * @param {boolean} [close]
 * @param {{tabId?: number, windowId?: number}} [where] only one specifier is allowed
 * @return {void | Promise<void>}
 */
export const openDashboard = (mgr, side, close, where) =>
  browserSidebar && (side || __values[mgr ? pSideManager : pSideOptions])
    ? openSidebar(mgr ? 'manage.html?' + new URLSearchParams(mgr) : 'options.html', close, where)
    : API.tabs.openManager(mgr || {options: true}).then(close);

/**
 * @param {string} path
 * @param {boolean} [close]
 * @param {{tabId?: number, windowId?: number}} [where] only one specifier is allowed
 * @return {void | Promise<void>}
 */
export const openSidebar = async (path, close, where) => {
  path += (path.includes('?') ? '&' : '?') + kSidebar;
  return isSidebar ? location.assign(path)
    : (browserSidepanel
      ? (browserSidepanel.setOptions({tabId: where.tabId, path}), browserSidepanel.open(where))
      : (browserSidebar.setPanel({...where, panel: path}), browserSidebar.open())
    ).then(__.ENTRY === true && !isSidebar && close && global.close);
};

export const paintCanvas = (w, h, cb) => {
  // The check must be inlined, not reused as a variable, to enable elimination of dead code
  const canvas = __.B_CHROME || __.B_ANY && CHROME
    ? new OffscreenCanvas(w, h)
    : Object.assign($tag('canvas'), {width: w, height: h});
  const ctx = canvas.getContext('2d');
  cb(ctx, canvas);
  return ctx.getImageData(0, 0, w, h);
};

export const toggleListener = (evt, add, ...args) => add
  ? evt.addListener(...args)
  : evt.removeListener(args[0]);

global[k_deepCopy] = deepCopy; // used by other views for cloning into this JS realm
