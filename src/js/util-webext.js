import './browser';
import {k_deepCopy} from './consts';
import {ownRoot} from './urls';
import {deepCopy} from './util';

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
export const browserSidebar = __.MV3 ? chrome.sidePanel : browser.sidebarAction;
export const browserWindows = browser.windows;
/** A scoped listener won't trigger for our [big] stuff in `local`, Chrome 73+, FF */
export const onStorageChanged = chrome.storage.sync.onChanged || chrome.storage.onChanged;
export const webNavigation = browser.webNavigation;

export const getOwnTab = async () => (ownTab = await browser.tabs.getCurrent() || false);

export const getActiveTab = async () =>
  (await browser.tabs.query({currentWindow: true, active: true}))[0] ||
  // workaround for Chrome bug when devtools for our popup is focused
  browserWindows &&
  (await browser.tabs.query({windowId: (await browserWindows.getCurrent()).id, active: true}))[0];

export const ignoreChromeError = () => chrome.runtime.lastError;

export const toggleListener = (evt, add, ...args) => add
  ? evt.addListener(...args)
  : evt.removeListener(args[0]);

export async function closeCurrentTab() {
  if ((ownTab ??= await getOwnTab()))
    return chrome.tabs.remove(ownTab.id);
}

global[k_deepCopy] = deepCopy; // used by other views for cloning into this JS realm
