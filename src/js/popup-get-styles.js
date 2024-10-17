import browser from '/js/browser';
import * as msg from '/js/msg';
import {API, isBg} from '/js/msg';
import {CHROME, FIREFOX, getActiveTab, URLS} from '/js/toolbox';

export const ABOUT_BLANK = 'about:blank';

export default async function popupGetStyles() {
  let tab = await getActiveTab();
  if (FIREFOX && tab.status === 'loading' && tab.url === ABOUT_BLANK) {
    tab = await API.waitForTabUrl(tab.id);
  }
  let url = tab.pendingUrl || tab.url || ''; // new Chrome uses pendingUrl while connecting
  const isOwn = url.startsWith(URLS.ownOrigin);
  const [ping0, frames] = await Promise.all([
    isOwn
      || msg.sendTab(tab.id, {method: 'ping'}, {frameId: 0}),
    isOwn && CHROME && getAllFrames(url, tab)
      || browser.webNavigation.getAllFrames({tabId: tab.id}),
  ]);
  // sorting frames and connecting children to parents
  const unknown = new Map(frames.map(f => [f.frameId, f]));
  const known = new Map([[0, unknown.get(0) || {frameId: 0, url: ''}]]);
  const urls = new Set([ABOUT_BLANK]);
  unknown.delete(0);
  let lastSize = 0;
  while (unknown.size !== lastSize) {
    for (const [frameId, f] of unknown) {
      if (known.has(f.parentFrameId)) {
        unknown.delete(frameId);
        if (!f.errorOccurred) known.set(frameId, f);
        if (f.url === ABOUT_BLANK) f.url = known.get(f.parentFrameId).url;
      }
    }
    lastSize = unknown.size; // guard against an infinite loop due to a weird frame structure
  }
  frames.length = 0;
  for (const sortedFrames of [known, unknown]) {
    for (const f of sortedFrames.values()) {
      const u = f.url || (f.url = '');
      f.isDupe = urls.has(u);
      urls.add(u);
      frames.push(f);
    }
  }
  if (url === 'chrome://newtab/' && !URLS.chromeProtectsNTP) {
    url = frames[0].url || '';
  }
  // webNavigation doesn't set url in some cases e.g. in our own pages
  frames[0].url = url;
  const urlSupported = URLS.supported(url);
  if (urlSupported) {
    let styles = [];
    for (const f of frames) {
      if (f.url && !f.isDupe) f.stylesIdx = styles.push(f.styles = API.styles.getByUrl(f.url)) - 1;
    }
    if (!isBg) {
      styles = await Promise.all(styles);
      for (const f of frames) if (f.styles) f.styles = styles[f.stylesIdx];
    }
  }
  return [frames, ping0, tab, urlSupported];
}

/** webNavigation.getAllFrames doesn't work in Chrome on own pages */
async function getAllFrames(url, {id: tabId}) {
  let res;
  if (process.env.MV3) {
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
