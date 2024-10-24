import browser from './browser';
import {CHROME} from './ua';
import {ownRoot} from './urls';
import {deepCopy} from './util';

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

export async function closeCurrentTab() {
  // https://bugzil.la/1409375
  const tab = await getOwnTab();
  if (tab) return chrome.tabs.remove(tab.id);
}

global._deepCopy = deepCopy; // used by other views for cloning into this JS realm
