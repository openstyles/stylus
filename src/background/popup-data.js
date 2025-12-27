import '@/js/browser';
import {kAboutBlank, kPopup, kStyleIds, kTabOvrToggle, kUrl} from '@/js/consts';
import {onConnect, onDisconnect} from '@/js/msg';
import {CHROME, FIREFOX} from '@/js/ua';
import {ownRoot, supported} from '@/js/urls';
import {getActiveTab, toggleListener} from '@/js/util-webext';
import {pingTab} from './broadcast';
import {bgBusy} from './common';
import reinjectContentScripts from './content-scripts';
import {getByUrl} from './style-manager';
import {set as tabSet, tabCache} from './tab-manager';
import {waitForTabUrl} from './tab-util';

/** @type {Map<number,Set<chrome.runtime.Port>>} tabs can have popup & popup-in-sidebar */
const popups = new Map();
const onTabUpdated = async (tabId, {url}) => {
  if (url && popups.has(tabId)) {
    const data = await makePopupData(tabId);
    for (const port of popups.get(tabId) || [])
      port.postMessage(data);
  }
};
/** Using chrome.tabs.onUpdated to see unsupported URLs */
const toggleObserver = enable => toggleListener(chrome.tabs.onUpdated, enable, onTabUpdated);
onConnect[kPopup] = port => {
  if (!popups.size)
    toggleObserver(true);
  const tabId = +port.name.split(':')[1];
  const ports = popups.get(tabId);
  if (ports) ports.add(port);
  else popups.set(tabId, new Set([port]));
};
onDisconnect[kPopup] = port => {
  const tabId = +port.name.split(':')[1];
  const ports = popups.get(tabId);
  if (ports?.delete(port) && !ports.size && popups.delete(tabId) && !popups.size)
    toggleObserver(false);
};

export default async function makePopupData(tabId) {
  let tmp;
  let tab = await (tabId != null ? browser.tabs.get(tabId) : getActiveTab());
  tabId ??= tab.id;
  if (FIREFOX && tab.status === 'loading' && tab.url === kAboutBlank) {
    tab = await waitForTabUrl(tabId);
  }
  // In modern Chrome `url` is for the current tab's contents, so it may be undefined
  // when a newly created tab is still connecting to `pendingUrl`.
  const url = tab.url || tab.pendingUrl || '';
  const td = tabCache[tabId] || false;
  const isOwn = url.startsWith(ownRoot);
  const [
    ping0 = __.MV3 && !td[kPopup] && (
      tabSet(tabId, kPopup, true),
      await reinjectContentScripts(tab)
    ),
    frames,
  ] = await Promise.all([
    isOwn
      || supported(url) && pingTab(tabId),
    isOwn && CHROME && __.BUILD !== 'firefox' && getAllFrames(url, tab)
      || browser.webNavigation.getAllFrames({tabId}),
  ]);
  // sorting frames and connecting children to parents
  const unknown = new Map(frames.map(f => [f.frameId, f]));
  const known = new Map();
  const urls = new Set([kAboutBlank]);
  if (td && (tmp = td[kStyleIds])) {
    for (let id in tmp) {
      if (!unknown.has(id = +id)) { // chrome bug: getAllFrames misses some frames
        const frameUrl = td[kUrl][id];
        unknown.set(id, {
          frameId: id,
          parentFrameId: 0,
          styles: getByUrl(frameUrl, undefined, tabId),
          url: frameUrl,
        });
      }
    }
  }
  known.set(0, unknown.get(0) || {frameId: 0, url: ''});
  unknown.delete(0);
  let lastSize = 0;
  while (unknown.size !== lastSize) {
    for (const [frameId, f] of unknown) {
      if (known.has(f.parentFrameId)) {
        unknown.delete(frameId);
        if (!f.errorOccurred) known.set(frameId, f);
        if (f.url === kAboutBlank) f.url = known.get(f.parentFrameId).url;
      }
    }
    lastSize = unknown.size; // guard against an infinite loop due to a weird frame structure
  }
  frames.length = 0;
  for (const sortedFrames of [known, unknown]) {
    for (const f of sortedFrames.values()) {
      const u = f.url ??= '';
      f.isDupe = f.frameId && urls.has(u);
      urls.add(u);
      frames.push(f);
    }
  }
  // webNavigation doesn't set url in some cases e.g. in our own pages
  frames[0].url = url;
  const urlSupported = supported(url);
  if (urlSupported) {
    if (bgBusy) await bgBusy;
    for (const f of frames) {
      if (f.url && !f.isDupe)
        f.styles ??= getByUrl(f.url, undefined, tabId);
    }
  }
  /** @namespace PopupData */
  return {
    frames,
    ping0,
    tab,
    urlSupported,
    [kTabOvrToggle]: td[kTabOvrToggle],
  };
}

/** webNavigation.getAllFrames doesn't work in Chrome on own pages */
async function getAllFrames(url, {id: tabId}) {
  let res;
  if (__.MV3) {
    res = await chrome.runtime.getContexts({tabIds: [tabId]});
    res = res[1]?.documentUrl;
  } else {
    // first 0 = view, second 0 = iframe inside
    res = chrome.extension.getViews({tabId: tabId})[0]?.[0]?.location.href;
  }
  return [
    {frameId: 0, url},
    res && {frameId: 1, parentFrameId: 0, url: res},
  ].filter(Boolean);
}
