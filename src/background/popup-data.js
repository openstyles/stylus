import '@/js/browser';
import {kAboutBlank, k_busy, kPopup} from '@/js/consts';
import {CHROME, FIREFOX} from '@/js/ua';
import {chromeProtectsNTP, ownRoot, supported} from '@/js/urls';
import {getActiveTab} from '@/js/util-webext';
import {pingTab} from './broadcast';
import reinjectContentScripts from './content-scripts';
import {getByUrl} from './style-manager';
import * as tabMan from './tab-manager';
import {waitForTabUrl} from './tab-util';

export default async function makePopupData() {
  let tab = await getActiveTab();
  if (FIREFOX && tab.status === 'loading' && tab.url === kAboutBlank) {
    tab = await waitForTabUrl(tab.id);
  }
  let url = tab.pendingUrl || tab.url || ''; // new Chrome uses pendingUrl while connecting
  const isOwn = url.startsWith(ownRoot);
  const [
    ping0 = __.MV3 && !tabMan.get(tab.id, kPopup) && (
      tabMan.set(tab.id, kPopup, true),
      await reinjectContentScripts(tab)
    ),
    frames,
  ] = await Promise.all([
    isOwn
      || supported(url) && pingTab(tab.id),
    isOwn && CHROME && __.BUILD !== 'firefox' && getAllFrames(url, tab)
      || browser.webNavigation.getAllFrames({tabId: tab.id}),
  ]);
  // sorting frames and connecting children to parents
  const unknown = new Map(frames.map(f => [f.frameId, f]));
  const known = new Map();
  const urls = new Set([kAboutBlank]);
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
      f.isDupe = urls.has(u);
      urls.add(u);
      frames.push(f);
    }
  }
  if (url === 'chrome://newtab/' && !chromeProtectsNTP) {
    url = frames[0].url || '';
  }
  // webNavigation doesn't set url in some cases e.g. in our own pages
  frames[0].url = url;
  const urlSupported = supported(url);
  if (urlSupported) {
    if (__.IS_BG && global[k_busy]) {
      await global[k_busy];
    }
    let styles = [];
    for (const f of frames) {
      if (f.url && !f.isDupe) f.stylesIdx = styles.push(f.styles = getByUrl(f.url)) - 1;
    }
    if (!__.IS_BG) {
      styles = await Promise.all(styles);
      for (const f of frames) if (f.styles) f.styles = styles[f.stylesIdx];
    }
  }
  return [frames, ping0, tab, urlSupported];
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
