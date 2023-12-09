/* global API msg */// msg.js
/* global CHROME URLS getActiveTab */// toolbox.js
'use strict';

const ABOUT_BLANK = 'about:blank';
/* exported preinit */
const preinit = (async () => {
  let tab = await getActiveTab();
  if (!chrome.app && tab.status === 'loading' && tab.url === ABOUT_BLANK) {
    tab = await API.waitForTabUrl(tab.id);
  }
  let url = tab.pendingUrl || tab.url || ''; // new Chrome uses pendingUrl while connecting
  let promise;
  const isOwn = url.startsWith(URLS.ownOrigin);
  const jobs = [
    isOwn
      || (promise = msg.sendTab(tab.id, {method: 'ping'}, {frameId: 0})),
    isOwn && CHROME
      ? getOwnFrames(tab.id, url) // getAllFrames doesn't work in Chrome on own pages
      : (promise = browser.webNavigation.getAllFrames({tabId: tab.id})),
  ];
  const [ping0, frames] = promise ? await Promise.all(jobs) : jobs;
  sortTabFrames(frames);
  frames.ping0 = ping0;
  frames.tab = tab;
  if (url === 'chrome://newtab/' && !URLS.chromeProtectsNTP) {
    url = frames[0].url || '';
  }
  // webNavigation doesn't set url in some cases e.g. in our own pages
  frames[0].url = url;
  const uniqFrames = frames.filter(f => f.url && !f.isDupe);
  const styles = await Promise.all(uniqFrames.map(async ({url}) => ({
    url,
    styles: await getStyleDataMerged(url),
  })));
  return {frames, styles, url};
})();

function getOwnFrames(tabId, url) {
  const frames = [{frameId: 0, url}];
  const [fw] = chrome.extension.getViews({tabId});
  if (fw && fw[0]) frames.push({frameId: 1, parentFrameId: 0, url: fw[0].location.href});
  return frames;
}

/* Merges the extra props from API into style data.
 * When `id` is specified returns a single object otherwise an array */
async function getStyleDataMerged(url, id) {
  const styles = (await API.styles.getByUrl(url, id))
    .map(r => Object.assign(r.style, r));
  return id ? styles[0] : styles;
}

/** @param {browser.webNavigation._GetAllFramesReturnDetails[]} frames */
function sortTabFrames(frames) {
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
      frames.push(f);
      if (!f.url) f.url = '';
      f.isDupe = urls.has(f.url);
      urls.add(f.url);
    }
  }
}
