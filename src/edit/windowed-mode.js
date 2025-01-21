import '@/js/browser';
import * as prefs from '@/js/prefs';
import {FIREFOX} from '@/js/ua';
import {sessionStore, tryJSONparse} from '@/js/util';
import {browserWindows, getOwnTab} from '@/js/util-webext';
import editor from './editor';
import EmbeddedPopup from './embedded-popup';

let ownTabId;
if (browserWindows) {
  initWindowedMode();
  const pos = tryJSONparse(sessionStore.windowPos);
  delete sessionStore.windowPos;
  // resize the window on 'undo close'
  if (pos && pos.left != null) {
    browserWindows.update(browserWindows.WINDOW_ID_CURRENT, pos);
  }
}

getOwnTab().then(tab => {
  ownTabId = tab.id;
  if (sessionStore['manageStylesHistory' + ownTabId] === location.href) {
    editor.cancel = () => history.back();
  }
});

async function initWindowedMode() {
  chrome.tabs.onAttached.addListener(onTabAttached);
  // Chrome 96+ bug: the type is 'app' for a window that was restored via Ctrl-Shift-T
  const isSimple = ['app', 'popup'].includes((await browserWindows.getCurrent()).type);
  if (isSimple) EmbeddedPopup();
  editor.isWindowed = isSimple || (
    history.length === 1 &&
    (__.MV3 || await prefs.ready, prefs.__values['openEditInWindow']) &&
    (await browserWindows.getAll()).length > 1 &&
    (await browser.tabs.query({currentWindow: true})).length === 1
  );
}

async function onTabAttached(tabId, info) {
  if (tabId !== ownTabId) {
    return;
  }
  if (info.newPosition !== 0) {
    prefs.set('openEditInWindow', false);
    return;
  }
  const win = await browserWindows.get(info.newWindowId, {populate: true});
  // If there's only one tab in this window, it's been dragged to new window
  const openEditInWindow = win.tabs.length === 1;
  // FF-only because Chrome retardedly resets the size during dragging
  if (openEditInWindow && FIREFOX) {
    browserWindows.update(info.newWindowId, prefs.__values['windowPosition']);
  }
  prefs.set('openEditInWindow', openEditInWindow);
}
