import '@/js/browser';
import {kPopup, pOpenEditInWindow} from '@/js/consts';
import {urlParams} from '@/js/dom';
import * as prefs from '@/js/prefs';
import {FIREFOX} from '@/js/ua';
import {sessionStore, tryJSONparse} from '@/js/util';
import {browserWindows, getOwnTab, ownTab} from '@/js/util-webext';
import editor from './editor';
import EmbeddedPopup from './embedded-popup';

export let isWindowed;
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
  if (sessionStore['manageStylesHistory' + tab.id] === location.href) {
    editor.cancel = () => history.back();
  }
});

async function initWindowedMode() {
  chrome.tabs.onAttached.addListener(onTabAttached);
  isWindowed = urlParams.has(kPopup);
  if (isWindowed) EmbeddedPopup();
  else isWindowed = history.length === 1 &&
    (__.MV3 || await prefs.ready, prefs.__values[pOpenEditInWindow]) &&
    (await browserWindows.getAll()).length > 1 &&
    (await browser.tabs.query({currentWindow: true})).length === 1;
}

async function onTabAttached(tabId, info) {
  if (tabId !== ownTab.id) {
    return;
  }
  if (info.newPosition !== 0) {
    prefs.set(pOpenEditInWindow, false);
    return;
  }
  const win = await browserWindows.get(info.newWindowId, {populate: true});
  // If there's only one tab in this window, it's been dragged to new window
  const openEditInWindow = win.tabs.length === 1;
  // FF-only because Chrome retardedly resets the size during dragging
  if (openEditInWindow && FIREFOX) {
    browserWindows.update(info.newWindowId, prefs.__values['windowPosition']);
  }
  prefs.set(pOpenEditInWindow, openEditInWindow);
}
