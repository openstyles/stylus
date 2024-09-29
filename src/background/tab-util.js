import browser from '/js/browser';
import * as msg from '/js/msg';
import {getActiveTab} from '/js/toolbox';
import {addAPI, API} from './common';
import * as prefs from '/js/prefs';

// FF57+ supports openerTabId, but not in Android
// (detecting FF57 by the feature it added, not navigator.ua which may be spoofed in about:config)
const HAS_OPENER = (CHROME || window.AbortController) && chrome.windows != null;
const EMPTY_TAB = [
  // Chrome and simple forks
  'chrome://newtab/',
  // Opera
  'chrome://startpage/',
  'chrome://startpageshared/',
  // Vivaldi
  'chrome-extension://mpognobbkildjkofajifpdfhcoklimli/components/startpage/startpage.html',
  'chrome://vivaldi-webui/startpage',
  // Firefox
  'about:home',
  'about:newtab',
];

addAPI(/** @namespace API */ {

  openURL,

  /**
   * Opens the editor or activates an existing tab
   * @param {string|{id?: number, domain?: string, 'url-prefix'?: string}} [params]
   * @returns {Promise<chrome.tabs.Tab>}
   */
  async openEditor(params) {
    const u = new URL(chrome.runtime.getURL('edit.html'));
    u.search = new URLSearchParams(params);
    const wnd = chrome.windows && prefs.get('openEditInWindow');
    const wndPos = wnd && prefs.get('windowPosition');
    const wndBase = wnd && prefs.get('openEditInWindow.popup') ? {type: 'popup'} : {};
    const ffBug = wnd && FIREFOX; // https://bugzil.la/1271047
    for (let tab, retry = 0; retry < (wndPos ? 2 : 1); ++retry) {
      try {
        tab = tab || await openURL({
          url: `${u}`,
          currentWindow: null,
          newWindow: wnd && Object.assign({}, wndBase, !ffBug && !retry && wndPos),
        });
        if (ffBug && !retry) await browser.windows.update(tab.windowId, wndPos);
        return tab;
      } catch (e) {}
    }
  },

  /**
   * @param {{}} [opts]
   * @param {boolean} [opts.options]
   * @param {string} [opts.search]
   * @param {string} [opts.searchMode]
   * @returns {Promise<chrome.tabs.Tab>}
   */
  async openManage(opts = {}) {
    const setUrlParams = url => {
      const u = new URL(url);
      for (const key of ['search', 'searchMode']) {
        if (key in opts) u.searchParams.set(key, opts[key]);
        else u.searchParams.delete(key);
      }
      u.hash = opts.options ? '#stylus-options' : '';
      return u.href;
    };
    const base = chrome.runtime.getURL('manage.html');
    const url = setUrlParams(base);
    const tabs = await browser.tabs.query({url: base + '*'});
    const same = tabs.find(t => t.url === url);
    let tab = same || tabs[0];
    if (!tab) {
      API.prefsDb.get('badFavs'); // prime the cache to avoid flicker/delay when opening the page
      tab = await openURL({url, newTab: true});
    } else if (!same) {
      await msg.sendTab(tab.id, {method: 'pushState', url: setUrlParams(tab.url)});
    }
    return activateTab(tab); // activateTab unminimizes the window
  },

  waitForTabUrl,
});

/**
 * Opens a tab or activates an existing one,
 * reuses the New Tab page or about:blank if it's focused now
 * @param {Object} _
 * @param {string} _.url - if relative, it's auto-expanded to the full extension URL
 * @param {number} [_.index] move the tab to this index in the tab strip, -1 = last
 * @param {number} [_.openerTabId] defaults to the active tab
 * @param {Boolean} [_.active=true] `true` to activate the tab
 * @param {Boolean|null} [_.currentWindow=true] `null` to check all windows
 * @param {chrome.windows.CreateData} [_.newWindow] creates a new window with these params if specified
 * @param {boolean} [_.newTab] `true` to force a new tab instead of switching to an existing tab
 * @returns {Promise<chrome.tabs.Tab>} Promise -> opened/activated tab
 */
export async function openURL({
  url,
  index,
  openerTabId,
  active = true,
  currentWindow = true,
  newWindow,
  newTab,
}) {
  if (!url.includes('://')) {
    url = chrome.runtime.getURL(url);
  }
  let tab = !newTab && (await browser.tabs.query({url: url.split('#')[0], currentWindow}))[0];
  if (tab) {
    return activateTab(tab, {
      index,
      openerTabId,
      // when hash is different we can only set `url` if it has # otherwise the tab would reload
      url: url !== (tab.pendingUrl || tab.url) && url.includes('#') ? url : undefined,
    });
  }
  if (newWindow && browser.windows) {
    return (await browser.windows.create(Object.assign({url}, newWindow))).tabs[0];
  }
  tab = await getActiveTab() || {url: ''};
  if (tab &&
      EMPTY_TAB.includes((tab.pendingUrl || tab.url || '').replace('edge://', 'chrome://')) &&
      !(tab.incognito && url.startsWith('chrome'))) {
    return activateTab(tab, {url, openerTabId});
  }
  const id = openerTabId == null ? tab.id : openerTabId;
  const opener = id != null && !tab.incognito && HAS_OPENER && {openerTabId: id};
  return browser.tabs.create(Object.assign({url, index, active}, opener));
}

async function activateTab(tab, {url, index, openerTabId} = {}) {
  const options = {active: true};
  if (url) {
    options.url = url;
  }
  if (openerTabId != null && HAS_OPENER) {
    options.openerTabId = openerTabId;
  }
  await Promise.all([
    browser.tabs.update(tab.id, options),
    browser.windows && browser.windows.update(tab.windowId, {focused: true}),
    index != null && browser.tabs.move(tab.id, {index}),
  ]);
  return tab;
}

export function getUrlOrigin(url = '') {
  return url.substring(0, url.indexOf('/', url.indexOf(':') + 3));
}

export function waitForTabUrl(tabId) {
  return new Promise(resolve => {
    browser.tabs.onUpdated.addListener(...[
      function onUpdated(updatedId, info, updatedTab) {
        if (info.url && updatedId === tabId) {
          browser.tabs.onUpdated.removeListener(onUpdated);
          resolve(updatedTab);
        }
      },
      ...'UpdateFilter' in browser.tabs ? [{tabId}] : [], // FF only
    ]);
  });
}
