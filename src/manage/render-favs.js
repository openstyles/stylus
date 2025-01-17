import {$create} from '@/js/dom';
import {API} from '@/js/msg-api';
import * as URLS from '@/js/urls';
import {debounce, stringAsRegExpStr} from '@/js/util';
import {getOwnTab, MF_ICON} from '@/js/util-webext';
import {createTargetsElement} from './render';
import {installed, newUI} from './util';

const BAD_FAVS_KEY = 'badFavs';
/** @type {string[] | Promise<string[]>} */
let badFavs;
let dbBusy;

export async function renderFavs(container = installed) {
  if (!newUI.hasFavs()) return;
  if (!badFavs) initBadFavs();
  if (badFavs.then) await badFavs;
  const regexpRemoveNegativeLookAhead = /(\?!([^)]+\))|\(\?![\w(]+[^)]+[\w|)]+)/g;
  // replace extra characters & all but the first group entry "(abc|def|ghi)xyz" => abcxyz
  const regexpReplaceExtraCharacters = /[\\(]|((\|\w+)+\))/g;
  const regexpMatchRegExp = /[\w-]+[.(]+(com|org|co|net|im|io|edu|gov|biz|info|de|cn|uk|nl|eu|ru)\b/g;
  const regexpMatchDomain = /^.*?:\/\/\W*([-.\w]+)/;
  for (const target of container.$$('.target')) {
    const type = target.dataset.type;
    const targetValue = target.textContent;
    if (!targetValue) continue;
    let favicon = '';
    if (type === 'domains') {
      favicon = targetValue;
    } else if (/-extension:\\?\//.test(targetValue)) {
      favicon = MF_ICON;
    } else if (type === 'regexps') {
      favicon = targetValue
        .replace(regexpRemoveNegativeLookAhead, '')
        .replace(regexpReplaceExtraCharacters, '')
        .match(regexpMatchRegExp);
      favicon = favicon ? favicon.shift() : '';
    } else if (/^(f|ht)tps?:/.test(targetValue)) {
      favicon = targetValue.match(regexpMatchDomain);
      favicon = favicon ? favicon[1].replace(/\W+$/, '') : '';
    }
    if (!favicon || badFavs.includes(favicon)) {
      if (!target.firstElementChild) target.prepend($create('b'));
      continue;
    }
    if (favicon !== MF_ICON) {
      favicon = URLS.favicon(favicon);
    }
    const img = target.$(':scope > img:first-child') ||
      target.insertAdjacentElement('afterbegin', $create('img', {loading: 'lazy'}));
    if ((img.dataset.src || img.src) !== favicon) {
      img.src = favicon;
    }
  }
}

export async function readBadFavs(val) {
  if (!val) {
    val = await (dbBusy || (dbBusy = API.prefsDB.get(BAD_FAVS_KEY)));
    dbBusy = false;
  }
  return (newUI.cfg[BAD_FAVS_KEY] = Array.isArray(val) ? val : []);
}

async function initBadFavs() {
  // API creates a new function each time so we save it for `debounce` which is keyed on function object
  const {put} = API.prefsDB;
  const rxHost = new RegExp(
    `^${stringAsRegExpStr(URLS.favicon('\n')).replace('\n', '(.*)')}$`);
  badFavs = newUI.cfg[BAD_FAVS_KEY] || await (badFavs = readBadFavs());
  const fn = e => {
    const code = e.statusCode; // absent for network error
    const host = code && code !== 200 && e.url.match(rxHost)[1];
    if (host && !badFavs.includes(host)) {
      badFavs.push(host);
      debounce(put, 250, badFavs, BAD_FAVS_KEY);
    }
  };
  const filter = {
    urls: [URLS.favicon('*')], // we assume there's no redirect
    types: ['image'],
    tabId: (await getOwnTab()).id,
  };
  chrome.webRequest.onCompleted.addListener(fn, filter); // works in Chrome
  chrome.webRequest.onErrorOccurred.addListener(fn, filter); // works in FF
}

export function renderMissingFavs(num, iconsMissing, iconsEnabled) {
  for (const entry of installed.children) {
    entry.$('.applies-to').classList.toggle('has-more', entry._numTargets > num);
    if (!entry._allTargetsRendered && num > entry.$('.targets').childElementCount) {
      createTargetsElement({entry});
      iconsMissing |= iconsEnabled;
    } else if ((+entry.style.getPropertyValue('--num-targets') || 1e9) > num) {
      entry.style.setProperty('--num-targets', num);
    }
  }
  return iconsMissing;
}
