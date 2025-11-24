import {kBadFavs} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as URLS from '@/js/urls';
import {debounce} from '@/js/util';
import {getOwnTab, MF_ICON, ownId, ownTab} from '@/js/util-webext';

/** Removes negative look-ahead,
 * replaces extra characters & all but the first group entry "(abc|def|ghi)xyz" => abcxyz */
const rxDrop = /(?:\?!([^)]+\))|\(\?![\w(]+[^)]+[\w|)]+)|(?:\|[^)]+)+\)/g;
/** Skips controls like \b()[]?\\ and extracts individual parts of the host */
const rxHostFromRE = /(?:[^-\w\\](?!https?)(\w[-\w]*)(?:[^\w.]|\\\w\b)*(\.)[^\w\\]*)?(\w[-\w]*)[^\w.]*(\.)[^\w\\]*([a-z]{2,10})(?:[^-\w]*(-)[^\w\\]*([a-z]{2,10}))?(?=\W|$)/;
const rxHostFromUrl = /^(?:ht|f)tps?:\/\/(?:[^@/]*@)?([-.\w]+)/;
const rxIsExtensionUrl = /-extension:\\?\//;
const TARGET_SEL = '.target';
/** @type {Set<HTMLElement>} */
const queue = new Set();
/** @type {Set<string>} */
let badFavs;
let detecting;

function guessSite(type, val) {
  if (type === 'domain') {
    if (val === ownId)
      val = MF_ICON;
  } else if (rxIsExtensionUrl.test(val)) {
    val = MF_ICON;
  } else if (type === 'regexp') {
    val = val.replace(rxDrop, '').match(rxHostFromRE);
    if (val) {
      val[0] = ''; // filtering it out along with optional parts 1,2 and 6,7
      val = val.filter(Boolean).join('');
    }
  } else if ((val = val.match(rxHostFromUrl))) {
    val = val[1];
  }
  return val;
}

export async function renderTargetIcons(what, valueSel, valueProp) {
  const reentry = queue.size;
  if (what.forEach) what.forEach(queue.add, queue);
  else queue.add(what);
  if (reentry)
    return;
  badFavs ??= global[kBadFavs];
  while ((what = queue.values().next().value)) {
    for (const el of what.matches?.(TARGET_SEL) ? [what] : what.$$(TARGET_SEL)) {
      let val = valueSel ? el.$(valueSel)[valueProp] : el.textContent;
      if (!val
      || !(val = guessSite(el.dataset.type, val))
      || badFavs.has(val))
        continue;
      if (val !== MF_ICON)
        val = URLS.favicon(val);
      if (!detecting) {
        detecting = true;
        setupBadFavsDetector((ownTab ?? await getOwnTab()).id);
      }
      let img = el.$('img');
      if (!img) {
        img = $tag('img');
        img.loading = 'lazy';
        img.src = val;
        el.prepend(img);
      } else if ((img.dataset.src || img.src) !== val) {
        img.src = val;
      }
    }
    queue.delete(what); // removing only now to prevent re-entry
  }
}

function setupBadFavsDetector(tabId) {
  const faviconGlob = URLS.favicon('*');
  const a = faviconGlob.indexOf('*');
  const b = a - faviconGlob.length + 1 || undefined;
  const fn = e => {
    const code = e.statusCode; // absent for network error
    const host = code && code !== 200 && e.url.slice(a, b);
    if (host && !badFavs.has(host)) {
      badFavs.add(host);
      debounce(API.prefsDB.put, 250, [...badFavs], kBadFavs);
      for (const v of chrome.extension.getViews()) v[kBadFavs]?.add(host);
    }
  };
  const filter = {
    urls: [faviconGlob], // we assume there's no redirect
    types: ['image'],
    tabId,
  };
  chrome.webRequest.onCompleted.addListener(fn, filter); // works in Chrome
  chrome.webRequest.onErrorOccurred.addListener(fn, filter); // works in FF
}
