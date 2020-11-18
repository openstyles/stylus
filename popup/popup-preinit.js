/* global
  API
  URLS
*/
'use strict';

const ABOUT_BLANK = 'about:blank';
/* exported tabURL */
/** @type string */
let tabURL;

/* exported initializing */
const initializing = (async () => {
  let [tab] = await browser.tabs.query({currentWindow: true, active: true});
  if (!chrome.app && tab.status === 'loading' && tab.url === 'about:blank') {
    tab = await waitForTabUrlFF(tab);
  }
  const frames = sortTabFrames(await browser.webNavigation.getAllFrames({tabId: tab.id}));
  let url = tab.pendingUrl || tab.url || ''; // new Chrome uses pendingUrl while connecting
  if (url === 'chrome://newtab/' && !URLS.chromeProtectsNTP) {
    url = frames[0].url || '';
  }
  if (!URLS.supported(url)) {
    url = '';
    frames.length = 1;
  }
  tabURL = frames[0].url = url;
  const uniqFrames = frames.filter(f => f.url && !f.isDupe);
  const styles = await Promise.all(uniqFrames.map(getFrameStyles));
  return {frames, styles};

  async function getFrameStyles({url}) {
    return {
      url,
      styles: await getStyleDataMerged(url),
    };
  }

  /** @param {chrome.webNavigation.GetAllFrameResultDetails[]} frames */
  function sortTabFrames(frames) {
    const unknown = new Map(frames.map(f => [f.frameId, f]));
    const known = new Map([[0, unknown.get(0) || {frameId: 0, url: ''}]]);
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
    const sortedFrames = [...known.values(), ...unknown.values()];
    const urls = new Set([ABOUT_BLANK]);
    for (const f of sortedFrames) {
      if (!f.url) f.url = '';
      f.isDupe = urls.has(f.url);
      urls.add(f.url);
    }
    return sortedFrames;
  }

  function waitForTabUrlFF(tab) {
    return new Promise(resolve => {
      browser.tabs.onUpdated.addListener(...[
        function onUpdated(tabId, info, updatedTab) {
          if (info.url && tabId === tab.id) {
            browser.tabs.onUpdated.removeListener(onUpdated);
            resolve(updatedTab);
          }
        },
        ...'UpdateFilter' in browser.tabs ? [{tabId: tab.id}] : [],
        // TODO: remove both spreads and tabId check when strict_min_version >= 61
      ]);
    });
  }
})();

/* Merges the extra props from API into style data.
 * When `id` is specified returns a single object otherwise an array */
async function getStyleDataMerged(url, id) {
  const styles = (await API.styles.getByUrl(url, id))
    .map(r => Object.assign(r.style, r));
  return id ? styles[0] : styles;
}
