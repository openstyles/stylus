import {kStyleIdPrefix, UCD} from '@/js/consts';
import {$create, $toggleDataset} from '@/js/dom';
import {setupLivePrefs, showSpinner} from '@/js/dom-util';
import {breakWord, formatDate, htmlToTemplateCache, templateCache} from '@/js/localization';
import {onConnect} from '@/js/msg';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import * as URLS from '@/js/urls';
import {
  clipString, debounce, sleep, stringAsRegExp, stringAsRegExpStr, t, tryRegExp, tryURL,
} from '@/js/util';
import {styleFinder, tabUrl, tabUrlSupported} from '.';
import * as Events from './events';
import './search.css';
import html from './search.html';

htmlToTemplateCache(html);
document.body.append(templateCache.searchUI);

const RESULT_TPL = templateCache.searchResult;
const RESULT_ID_PREFIX = RESULT_TPL.className + '-';
const RESULT_SEL = '.' + RESULT_TPL.className;
const INDEX_URL = URLS.usoaRaw[0] + 'search-index.json';
const USW_INDEX_URL = URLS.usw + 'api/index/uso-format';
const USW_ICON = $create('img', {
  src: `${URLS.usw}favicon.ico`,
  title: URLS.usw,
});
const STYLUS_CATEGORY = 'chrome-extension';
const PAGE_LENGTH = 100;
// update USO style install counter if the style isn't uninstalled immediately
const PINGBACK_DELAY = 5e3;
const USO_AUTO_PIC_SUFFIX = '-after.png';
const GLOBAL = 'global';
const dom = {};
const $searchGlobals = $id('popup.search.globals');
if (!tabUrlSupported) {
  $searchGlobals.checked = $searchGlobals.disabled = true;
} else {
  setupLivePrefs([$searchGlobals.id]);
  $searchGlobals.onchange = () => {
    searchGlobals = $searchGlobals.checked;
    ready = ready.then(start);
  };
}
/**
 * @typedef IndexEntry
 * @prop {'uso' | 'uso-android'} f - format
 * @prop {Number} i - id, later replaced with string like `uso-123`
 * @prop {string} n - name
 * @prop {string} c - category
 * @prop {Number} u - updatedTime
 * @prop {Number} t - totalInstalls
 * @prop {Number} w - weeklyInstalls
 * @prop {Number} r - rating
 * @prop {Number} ai -  authorId
 * @prop {string} an -  authorName
 * @prop {string} sn -  screenshotName
 * @prop {boolean} sa -  screenshotArchived
 *
 * @prop {number} _bias - sort bias: higher value is a worse match
 * @prop {number} _styleId - installed style id
 * @prop {boolean} _styleVars - installed style has vars
 * @prop {number} _year
 */
/** @type IndexEntry[] */
let results, resultsAllYears;
/** @type IndexEntry[] */
let index;
let host3 = '';
let category = '';
/** @type RegExp */
let rxCategory;
let searchGlobals = !tabUrlSupported || $searchGlobals.checked;
/** @type {RegExp[]} */
let query = [];
let order = prefs.__values['popup.findSort'];
let scrollToFirstResult = true;
let displayedPage = 1;
let totalPages = 1;
let ready;
/** @type {?Promise} */
let indexing;

let imgType = '.jpeg';
// detect WebP support
$create('img', {
  src: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
  onload: () => (imgType = '.webp'),
});

/** @returns {{result: IndexEntry, entry: HTMLElement}} */
const $resultEntry = el => {
  const entry = el.closest(RESULT_SEL);
  return {entry, result: entry && entry._result};
};
const rid2id = rid => rid.split('-')[1];
const eventMap = {
  styleAdded: onStyleInstalled,
  styleUpdated: onStyleInstalled,
  styleDeleted: onStyleDeleted,
};

styleFinder.on = async (msg, busy) => {
  const fn = eventMap[msg.method];
  if (!fn) return;
  if (busy) await busy;
  return fn(msg);
};
styleFinder.inline = () => {
  calcCategory();
  ready = start();
};
styleFinder.inSite = event => {
  // use a less specific category if the inline search wasn't used yet
  if (!category) calcCategory({retry: 1});
  const add = (prefix, str) => str ? prefix + str : '';
  const where = event.detail;
  const q = encodeURIComponent($id('search-query').value.trim());
  const catQ = category + add('+', q);
  const href =
    where === 'uso' &&
      `${URLS.uso}styles/browse${q ? `?search_terms=${catQ}`
        : category === GLOBAL ? '' : `/${category}`}` ||
    where === 'usoa' &&
      `${URLS.usoa}browse/styles?search=%23${catQ}` ||
    where === 'usw' &&
      `${URLS.usw}search?q=${catQ}` ||
    where === 'gf' &&
      'https://greasyfork.org/' + ($root.lang.split('-')[0] || 'en') +
      `/scripts${tabUrlSupported
        ? tryURL(tabUrl).hostname.replace(/^(www\.)?/, '/by-site/')
        : ''
      }?language=css${add('&q=', q)}`;
  Events.openURLandHide.call({href}, event);
};
$id('search-query').oninput = function () {
  query = [];
  const text = this.value.trim();
  for (let re = /(")(.+?)"|((\/)?(\S+?)(\/\w*)?)(?=\s|$)/g, m; (m = re.exec(text));) {
    const [
      all,
      q, qt,
      rawText, rx1 = '', rx, rx2 = '',
    ] = m;
    query.push(rx1 && rx2 && tryRegExp(rx, rx2.slice(1)) ||
      stringAsRegExp(q ? qt : rawText, all === all.toLocaleLowerCase() ? 'i' : ''));
  }
  if (category === STYLUS_CATEGORY) {
    query.push(/\bStylus\b/);
  }
  ready = ready.then(start);
};
$id('search-years').onchange = () => {
  ready = ready.then(() => start({keepYears: true}));
};
$id('search-order').value = order;
$id('search-order').onchange = function () {
  order = this.value;
  prefs.set('popup.findSort', order);
  results.sort(comparator);
  render();
};
dom.list = $id('search-results-list');
dom.container = $id('search-results');
dom.container.dataset.empty = '';
dom.error = $id('search-results-error');
dom.nav = {};
const navOnClick = {prev, next};
for (const place of ['top', 'bottom']) {
  const nav = $(`.search-results-nav[data-type="${place}"]`);
  nav.appendChild(templateCache.searchNav.cloneNode(true));
  dom.nav[place] = nav;
  for (const child of nav.$$('[data-type]')) {
    const type = child.dataset.type;
    child.onclick = navOnClick[type];
    nav['_' + type] = child;
  }
}

function onStyleDeleted({style: {id}}) {
  const r = results.find(_ => _._styleId === id);
  if (r) {
    if (r.f) API.uso.pingback(rid2id(r.i), false);
    delete r._styleId;
    renderActionButtons(r.i);
  }
}

async function onStyleInstalled({style}) {
  const ri = await API.styles.getRemoteInfo(style.id);
  const r = ri && results.find(_ => ri[0] === _.i);
  if (r) {
    r._styleId = style.id;
    r._styleVars = ri[1];
    renderActionButtons(ri[0]);
  }
}

function next() {
  displayedPage = Math.min(totalPages, displayedPage + 1);
  scrollToFirstResult = true;
  render();
}

function prev() {
  displayedPage = Math.max(1, displayedPage - 1);
  scrollToFirstResult = true;
  render();
}

function error(err) {
  dom.error.textContent = err && err.message || `${err}`;
  dom.error.hidden = false;
  dom.list.hidden = true;
  if (dom.error.getBoundingClientRect().bottom < 0) {
    dom.error.scrollIntoView(true);
  }
}

function errorIfNoneFound() {
  if (!results.length && !$id('search-query').value) {
    return indexing ? indexing.then(errorIfNoneFound)
      : Promise.reject(t('searchResultNoneFound'));
  }
}

async function start({keepYears} = {}) {
  try {
    results = [];
    for (let retry = 0; !results.length && retry <= 2; retry++) {
      results = await search({retry});
    }
    if (results.length) {
      const info = await API.styles.getRemoteInfo();
      for (const r of results) {
        [r._styleId, r._styleVars] = info[r.i] || [];
      }
    }
    if (!keepYears) resultsAllYears = results;
    renderYears();
    render();
    dom.list.hidden = !results.length;
    await errorIfNoneFound();
    resetUI();
    if (results.length) doScrollToFirstResult();
  } catch (reason) {
    error(reason);
  }
}

function resetUI() {
  $rootCL.add('search-results-shown');
  dom.container.hidden = false;
  dom.list.hidden = false;
  dom.error.hidden = true;
}

function renderYears() {
  const SCALE = 1000;
  const BASE = new Date(0).getFullYear(); // 1970
  const DAYS = 365.2425;
  const DAY = 24 * 3600e3;
  const YEAR = DAYS * DAY / SCALE;
  const SAFETY = 1 / DAYS; // 1 day safety margin: recheck Jan 1 and Dec 31
  const years = [];
  for (const r of resultsAllYears) {
    let y = r._year;
    if (!y) {
      y = r.u / YEAR + BASE;
      r._year = y = Math.abs(y % 1 - 1) <= SAFETY
        ? new Date(r.u * SCALE).getFullYear()
        : y | 0;
    }
    years[y] = (years[y] || 0) + 1;
  }
  const texts = years.reduceRight((res, num, y) => res.push(`${y} (${num})`) && res, []);
  const selects = [...$$('#search-years select')];
  selects.forEach((sel, selNum) => {
    if (texts.length !== sel.length || texts.some((v, i) => v !== sel[i].text)) {
      const i = sel.selectedIndex;
      const value = i && i < sel.length - 1 && sel.value;
      sel.textContent = '';
      sel.append(...texts.map(_ => $create('option', {value: _.split(' ')[0]}, _)));
      sel.value = value || sel[`${selNum ? 'first' : 'last'}Child`]?.value;
    }
  });
  const [y1, y2] = selects.map(el => Number(el.value)).sort();
  results = y1 ? resultsAllYears.filter(r => (r = r._year) >= y1 && r <= y2) : resultsAllYears;
}

function render() {
  totalPages = Math.ceil(results.length / PAGE_LENGTH);
  displayedPage = Math.min(displayedPage, totalPages) || 1;
  let startAt = (displayedPage - 1) * PAGE_LENGTH;
  const end = displayedPage * PAGE_LENGTH;
  let plantAt = 0;
  let slot = dom.list.children[0];
  // keep rendered elements with ids in the range of interest
  while (
    plantAt < PAGE_LENGTH &&
    slot && slot.id === RESULT_ID_PREFIX + results[startAt]?.i
  ) {
    slot = slot.nextElementSibling;
    plantAt++;
    startAt++;
  }
  // add new elements
  while (startAt < Math.min(end, results.length)) {
    const entry = createSearchResultNode(results[startAt++]);
    if (slot) {
      dom.list.replaceChild(entry, slot);
      slot = entry.nextElementSibling;
    } else {
      dom.list.appendChild(entry);
    }
    plantAt++;
  }
  // remove extraneous elements
  const pageLen = end > results.length &&
    results.length % PAGE_LENGTH ||
    Math.min(results.length, PAGE_LENGTH);
  while (dom.list.children.length > pageLen) {
    dom.list.lastElementChild.remove();
  }
  if (results.length && 'empty' in dom.container.dataset) {
    delete dom.container.dataset.empty;
  }
  if (scrollToFirstResult) {
    debounce(doScrollToFirstResult);
  }
  // navigation
  for (const place in dom.nav) {
    const nav = dom.nav[place];
    nav._prev.disabled = displayedPage <= 1;
    nav._next.disabled = displayedPage >= totalPages;
    nav._page.textContent = displayedPage;
    nav._total.textContent = totalPages;
    nav._num.textContent = results.length;
  }
}

function doScrollToFirstResult() {
  if (dom.container.scrollHeight > window.innerHeight * 2) {
    scrollToFirstResult = false;
    dom.container.scrollIntoView(true);
  }
}

/**
 * @param {IndexEntry} result
 * @returns {Node}
 */
function createSearchResultNode(result) {
  const entry = RESULT_TPL.cloneNode(true);
  const {
    i: rid,
    n: name,
    r: rating,
    u: updateTime,
    w: weeklyInstalls,
    t: totalInstalls,
    ai: authorId,
    an: author,
    sa: shotArchived,
    sn: shot,
    f: fmt,
  } = entry._result = result;
  const id = rid2id(rid);
  entry.id = RESULT_ID_PREFIX + rid;
  // title
  Object.assign(entry.$('.search-result-title'), {
    onclick: Events.openURLandHide,
    href: `${fmt ? URLS.usoa : URLS.usw}style/${id}`,
  });
  if (!fmt) entry.$('.search-result-title').prepend(USW_ICON.cloneNode(true));
  entry.$('.search-result-title span').textContent =
    breakWord(clipString(name, 300));
  // screenshot
  const elShot = entry.$('.search-result-screenshot');
  let shotSrc;
  if (!fmt) {
    shotSrc = /^https?:/i.test(shot) && shot.replace(/\.\w+$/, imgType);
  } else {
    elShot._src = URLS.uso + `auto_style_screenshots/${id}${USO_AUTO_PIC_SUFFIX}`;
    shotSrc = shot && !shot.endsWith(USO_AUTO_PIC_SUFFIX)
      ? `${shotArchived ? URLS.usoaRaw[0] : URLS.uso + 'style_'}screenshots/${shot}`
      : elShot._src;
  }
  if (shotSrc) {
    elShot._entry = entry;
    elShot.src = shotSrc;
    elShot.onerror = fixScreenshot;
  } else {
    entry.dataset.noImage = '';
  }
  // author
  Object.assign(entry.$('[data-type="author"] a'), {
    textContent: author,
    title: author,
    href: !fmt ? `${URLS.usw}user/${encodeURIComponent(author)}` :
      `${URLS.usoa}browse/styles?search=%40${authorId}`,
    onclick: Events.openURLandHide,
  });
  // rating
  entry.$('[data-type="rating"]').dataset.class =
    !rating ? 'none' :
      rating >= 2.5 ? 'good' :
        rating >= 1.5 ? 'okay' :
          'bad';
  entry.$('[data-type="rating"] dd').textContent = rating && rating.toFixed(1) || '';
  // time
  Object.assign(entry.$('[data-type="updated"] time'), {
    dateTime: updateTime * 1000,
    textContent: formatDate(updateTime * 1000),
  });
  // totals
  entry.$('[data-type="weekly"] dd').textContent = formatNumber(weeklyInstalls);
  entry.$('[data-type="total"] dd').textContent = formatNumber(totalInstalls);
  renderActionButtons(entry);
  return entry;
}

function formatNumber(num) {
  return (
    num > 1e9 ? (num / 1e9).toFixed(1) + 'B' :
    num > 10e6 ? (num / 1e6).toFixed(0) + 'M' :
    num > 1e6 ? (num / 1e6).toFixed(1) + 'M' :
    num > 10e3 ? (num / 1e3).toFixed(0) + 'k' :
    num > 1e3 ? (num / 1e3).toFixed(1) + 'k' :
    num
  );
}

function fixScreenshot() {
  const {_src} = this;
  if (_src && _src !== this.src) {
    this.src = _src;
    delete this._src;
  } else {
    this.onerror = null;
    this.removeAttribute('src');
    this._entry.dataset.noImage = '';
    renderActionButtons(this._entry);
  }
}

function renderActionButtons(entry) {
  if (typeof entry !== 'object') {
    entry = $id(RESULT_ID_PREFIX + entry);
  }
  if (!entry) return;
  const result = entry._result;
  const installedId = result._styleId;
  const isInstalled = installedId > 0; // must be boolean for comparisons below
  const status = entry.$('.search-result-status').textContent =
    isInstalled ? t('clickToUninstall') :
      entry.dataset.noImage != null ? t('installButton') :
        '';
  const notMatching = isInstalled && !$id(kStyleIdPrefix + installedId);
  if (notMatching !== entry.classList.contains('not-matching')) {
    entry.classList.toggle('not-matching');
    if (notMatching) {
      entry.prepend(templateCache.searchResultNotMatching.cloneNode(true));
    } else {
      entry.firstElementChild.remove();
    }
  }
  Object.assign(entry.$('.search-result-screenshot'), {
    onclick: isInstalled ? uninstall : install,
    title: status ? '' : t('installButton'),
  });
  entry.$('.search-result-uninstall').onclick = uninstall;
  entry.$('.search-result-install').onclick = install;
  Object.assign(entry.$('.search-result-customize'), {
    onclick: configure,
    disabled: notMatching,
  });
  $toggleDataset(entry, 'installed', isInstalled);
  $toggleDataset(entry, 'customizable', result._styleVars);
}

function renderFullInfo(entry, style) {
  let {description, vars} = style[UCD];
  // description
  description = (description || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/([^.][.。?!]|[\s,].{50,70})\s+/g, '$1\n')
    .replace(/([\r\n]\s*){3,}/g, '\n\n');
  entry.$('.search-result-description').textContent = description;
  vars = !!vars;
  entry._result._styleVars = vars;
  $toggleDataset(entry, 'customizable', vars);
}

function configure() {
  const styleEntry = $id(kStyleIdPrefix + $resultEntry(this).result._styleId);
  Events.configure.call(this, {}, styleEntry);
}

async function install() {
  const {entry, result} = $resultEntry(this);
  const {f: fmt} = result;
  const id = rid2id(result.i);
  const installButton = entry.$('.search-result-install');

  const spinner = showSpinner(entry);
  installButton.disabled = true;
  entry.style.setProperty('pointer-events', 'none', 'important');
  delete entry.dataset.error;
  if (fmt) API.uso.pingback(id, PINGBACK_DELAY);

  const updateUrl = URLS.makeUpdateUrl(fmt ? 'usoa' : 'usw', id);
  try {
    const sourceCode = await (await fetch(updateUrl)).text();
    const style = await API.usercss.install({sourceCode, updateUrl});
    renderFullInfo(entry, style);
  } catch (e) {
    entry.dataset.error = `${t('genericError')}: ${e && e.message || e}`;
    entry.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
  spinner.remove();
  installButton.disabled = false;
  entry.style.pointerEvents = '';
}

function uninstall() {
  const {result} = $resultEntry(this);
  API.styles.remove(result._styleId);
}

/**
 * Resolves the Userstyles.org "category" for a given URL.
 * @returns {boolean} true if the category has actually changed
 */
function calcCategory({retry} = {}) {
  const old = category;
  const u = tabUrlSupported && tryURL(tabUrl);
  if (!u?.href) {
    category = GLOBAL;
  } else if (u.protocol === 'file:') {
    category = 'file:';
  } else if (u.protocol === location.protocol) {
    category = STYLUS_CATEGORY;
  } else {
    const parts = u.hostname.replace(/\.(?:com?|org)(\.\w{2,3})$/, '$1').split('.');
    const [tld, main = u.hostname, third, fourth] = parts.reverse();
    const keepTld = retry !== 1 && !(
      tld === 'com' ||
      tld === 'org' && main !== 'userstyles'
    );
    const keepThird = !retry && (
      fourth ||
      third && third !== 'www' && third !== 'm'
    );
    category = (keepThird && `${third}.` || '') + main + (keepTld || keepThird ? `.${tld}` : '');
    if (!host3) host3 = keepThird && category;
  }
  rxCategory = new RegExp(`\\b${stringAsRegExpStr(category)}\\b`, 'i');
  return category !== old;
}

async function fetchIndex() {
  const elNote = $id('pct').firstChild;
  const jobs = [
    [INDEX_URL, 'uso', json => json.filter(v => v.f === 'uso')],
    [USW_INDEX_URL, 'usw', json => json.data],
  ].map(fetchIndexJob);
  indexing = Promise.all(jobs).then(() => {
    indexing = null;
    elNote.style.opacity = 0;
    start();
  });
  // Polyfilling a leaky Promise.race, https://crbug.com/42203149
  await new Promise((resolve, reject) => {
    for (const job of jobs) job.then(resolve, reject);
  });
  return index;
}

async function fetchIndexJob([url, prefix, transform]) {
  let el = $create('div', {title: url});
  $id('pct').append(el);
  onConnect[prefix] = port => {
    port.onMessage.addListener(([done, total]) => {
      if (!el) return;
      el.textContent = total
        ? (done / total * 100 | 0) + '%'
        : formatNumber(done) + '...';
    });
  };
  for (let triesLeft = 3; triesLeft--;) {
    try {
      const res = transform(JSON.parse(await API.download(url, {port: prefix})));
      for (const v of res) v.i = `${prefix}-${v.i}`;
      if (!index) {
        index = res;
      } else {
        index = index.concat(res);
      }
      break;
    } catch (e) {
      // CDN weirdly fails the first time, so we'll retry
      if (!triesLeft) error(e.message);
      else await sleep(250);
    }
  }
  el = el.style.opacity = 0;
}

async function search({retry} = {}) {
  return retry && !query.length && !calcCategory({retry})
    ? []
    : (index || await fetchIndex()).filter(isResultMatching).sort(comparator);
}

function isResultMatching(res) {
  const {c} = res;
  let bias;
  return (bias =
    c === category ||
    host3 && (
      c.includes('.')
        ? host3.charCodeAt(host3.length - c.length - 1) === 46/*.*/ && host3.endsWith(c)
        : host3.includes(`.${c}.`)
    ) && 2 + !res.n.includes(host3) ||
    (category === STYLUS_CATEGORY
      ? c === 'stylus' // USW
      : c === GLOBAL && searchGlobals &&
        (query.length || rxCategory.test(res.n))
    )
  ) && query.every(isInHaystack, res)
    && (res._bias = bias);
}

/**
 * @this {IndexEntry} haystack
 * @param {RegExp} q
 */
function isInHaystack(q) {
  return q.test(this.n);
}

/**
 * @param {IndexEntry} a
 * @param {IndexEntry} b
 */
function comparator(a, b) {
  return a._bias - b._bias || (
    order === 'n'
      ? a.n < b.n ? -1 : a.n > b.n
      : b[order] - a[order]
  ) || b.t - a.t;
}
