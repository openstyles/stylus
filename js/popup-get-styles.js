/* global API msg */// msg.js
/* global CHROME URLS getActiveTab */// toolbox.js
'use strict';

const ABOUT_BLANK = 'about:blank';

/* exported popupGetStyles */
async function popupGetStyles() {
  let tab = await getActiveTab();
  if (!CHROME && tab.status === 'loading' && tab.url === ABOUT_BLANK) {
    tab = await API.waitForTabUrl(tab.id);
  }
  let url = tab.pendingUrl || tab.url || ''; // new Chrome uses pendingUrl while connecting
  let promise, v;
  const isOwn = url.startsWith(URLS.ownOrigin);
  const jobs = [
    isOwn || (
      promise = msg.sendTab(tab.id, {method: 'ping'}, {frameId: 0})
    ),
    isOwn && CHROME ? [ // getAllFrames doesn't work in Chrome on own pages
      {frameId: 0, url},
      (v = chrome.extension.getViews({tabId: tab.id})[0]) && v[0] &&
        {frameId: 1, parentFrameId: 0, url: v[0].location.href},
    ].filter(Boolean) : (
      promise = browser.webNavigation.getAllFrames({tabId: tab.id})
    ),
  ];
  const [ping0, frames] = promise ? await Promise.all(jobs) : jobs;
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
      f.isDupe = urls.has(f.url || (f.url = ''));
      frames.push(f);
    }
  }
  if (url === 'chrome://newtab/' && !URLS.chromeProtectsNTP) {
    url = frames[0].url || '';
  }
  // webNavigation doesn't set url in some cases e.g. in our own pages
  frames[0].url = url;
  let styles = [];
  for (const f of frames) {
    if (f.url && !f.isDupe) f.stylesIdx = styles.push(f.styles = API.styles.getByUrl(f.url)) - 1;
  }
  if (!window.bgReady) {
    styles = await Promise.all(styles);
    for (const f of frames) if (f.styles) f.styles = styles[f.stylesIdx];
  }
  return [frames, ping0, tab];
}
