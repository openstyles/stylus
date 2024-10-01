import browser from '/js/browser';
import * as prefs from '/js/prefs';
import {FIREFOX, getOwnTab, sessionStore, tryJSONparse} from '/js/toolbox';
import editor from './editor';
import EmbeddedPopup from './embedded-popup';

let ownTabId;
if (chrome.windows) {
  initWindowedMode();
  const pos = tryJSONparse(sessionStore.windowPos);
  delete sessionStore.windowPos;
  // resize the window on 'undo close'
  if (pos && pos.left != null) {
    chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, pos);
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
  const isSimple = ['app', 'popup'].includes((await browser.windows.getCurrent()).type);
  if (isSimple) EmbeddedPopup();
  editor.isWindowed = isSimple || (
    history.length === 1 &&
    await prefs.ready && prefs.get('openEditInWindow') &&
    (await browser.windows.getAll()).length > 1 &&
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
  const win = await browser.windows.get(info.newWindowId, {populate: true});
  // If there's only one tab in this window, it's been dragged to new window
  const openEditInWindow = win.tabs.length === 1;
  // FF-only because Chrome retardedly resets the size during dragging
  if (openEditInWindow && FIREFOX) {
    chrome.windows.update(info.newWindowId, prefs.get('windowPosition'));
  }
  prefs.set('openEditInWindow', openEditInWindow);
}
