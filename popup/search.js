/* global $ $$ $create $remove */// dom.js
/* global $entry tabURL */// popup.js
/* global API */// msg.js
/* global Events */
/* global FIREFOX URLS debounce download tryCatch */// toolbox.js
/* global prefs */
/* global t */// localization.js
'use strict';

(() => {
  require(['/popup/search.css']);

  const RESULT_ID_PREFIX = 'search-result-';
  const INDEX_URL = URLS.usoArchiveRaw + 'search-index.json';
  const STYLUS_CATEGORY = 'chrome-extension';
  const PAGE_LENGTH = 10;
  // update USO style install counter if the style isn't uninstalled immediately
  const PINGBACK_DELAY = 5e3;
  const BUSY_DELAY = .5e3;
  const USO_AUTO_PIC_SUFFIX = '-after.png';
  const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const dom = {};
  /**
   * @typedef IndexEntry
   * @prop {'uso' | 'uso-android'} f - format
   * @prop {Number} i - id
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
   */
  /** @type IndexEntry[] */
  let results;
  /** @type IndexEntry[] */
  let index;
  let category = '';
  let searchGlobals = $('#search-globals').checked;
  /** @type string[] */
  let query = [];
  /** @type 'n' | 'u' | 't' | 'w' | 'r'  */
  let order = 't';
  let scrollToFirstResult = true;
  let displayedPage = 1;
  let totalPages = 1;
  let ready;

  const $class = sel => (sel instanceof Node ? sel : $(sel)).classList;
  const show = sel => $class(sel).remove('hidden');
  const hide = sel => $class(sel).add('hidden');

  Object.assign(Events, {
    /**
     * @param {HTMLAnchorElement} a
     * @param {Event} event
     */
    searchOnClick(a, event) {
      if (!prefs.get('popup.findStylesInline') || dom.container) {
        // use a less specific category if the inline search wasn't used yet
        if (!category) calcCategory({retry: 1});
        a.search = new URLSearchParams({category, search: $('#search-query').value});
        Events.openURLandHide.call(a, event);
        return;
      }
      a.textContent = a.title;
      a.title = '';
      init();
      calcCategory();
      ready = start();
    },
  });

  function init() {
    setTimeout(() => document.body.classList.add('search-results-shown'));
    hide('#find-styles-inline-group');
    $('#search-globals').onchange = function () {
      searchGlobals = this.checked;
      ready = ready.then(start);
    };
    $('#search-query').oninput = function () {
      query = [];
      const text = this.value.trim().toLocaleLowerCase();
      const thisYear = new Date().getFullYear();
      for (let re = /"(.+?)"|(\S+)/g, m; (m = re.exec(text));) {
        const n = Number(m[2]);
        query.push(n >= 2000 && n <= thisYear ? n : m[1] || m[2]);
      }
      if (category === STYLUS_CATEGORY && !query.includes('stylus')) {
        query.push('stylus');
      }
      ready = ready.then(start);
    };
    $('#search-order').value = order;
    $('#search-order').onchange = function () {
      order = this.value;
      results.sort(comparator);
      render();
    };
    dom.list = $('#search-results-list');
    dom.container = $('#search-results');
    dom.container.dataset.empty = '';
    dom.error = $('#search-results-error');
    dom.nav = {};
    const navOnClick = {prev, next};
    for (const place of ['top', 'bottom']) {
      const nav = $(`.search-results-nav[data-type="${place}"]`);
      nav.appendChild(t.template.searchNav.cloneNode(true));
      dom.nav[place] = nav;
      for (const child of $$('[data-type]', nav)) {
        const type = child.dataset.type;
        child.onclick = navOnClick[type];
        nav['_' + type] = child;
      }
    }

    if (FIREFOX) {
      let lastShift;
      window.on('resize', () => {
        const scrollbarWidth = window.innerWidth - document.scrollingElement.clientWidth;
        const shift = document.body.getBoundingClientRect().left;
        if (!scrollbarWidth || shift === lastShift) return;
        lastShift = shift;
        document.body.style.setProperty('padding',
          `0 ${scrollbarWidth + shift}px 0 ${-shift}px`, 'important');
      }, {passive: true});
    }

    window.on('styleDeleted', ({detail: {style: {id}}}) => {
      restoreScrollPosition();
      const result = results.find(r => r.installedStyleId === id);
      if (result) {
        clearTimeout(result.pingbackTimer);
        renderActionButtons(result.i, -1);
      }
    });

    window.on('styleAdded', async ({detail: {style}}) => {
      restoreScrollPosition();
      const usoId = calcUsoId(style) ||
                    calcUsoId(await API.styles.get(style.id));
      if (usoId && results.find(r => r.i === usoId)) {
        renderActionButtons(usoId, style.id);
      }
    });
  }


  function showSpinner(parent) {
    parent = parent instanceof Node ? parent : $(parent);
    parent.appendChild($create('.lds-spinner',
      new Array(12).fill($create('div')).map(e => e.cloneNode())));
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

  function error(reason) {
    dom.error.textContent = reason;
    show(dom.error);
    hide(dom.list);
    if (dom.error.getBoundingClientRect().bottom < 0) {
      dom.error.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }

  async function start() {
    show(dom.container);
    show(dom.list);
    hide(dom.error);
    results = [];
    try {
      for (let retry = 0; !results.length && retry <= 2; retry++) {
        results = await search({retry});
      }
      if (results.length) {
        const installedStyles = await API.styles.getAll();
        const allUsoIds = new Set(installedStyles.map(calcUsoId));
        results = results.filter(r => !allUsoIds.has(r.i));
      }
      render();
      (results.length ? show : hide)(dom.list);
      if (!results.length && !$('#search-query').value) {
        error(t('searchResultNoneFound'));
      }
    } catch (reason) {
      error(reason);
    }
  }

  function render() {
    totalPages = Math.ceil(results.length / PAGE_LENGTH);
    displayedPage = Math.min(displayedPage, totalPages) || 1;
    let start = (displayedPage - 1) * PAGE_LENGTH;
    const end = displayedPage * PAGE_LENGTH;
    let plantAt = 0;
    let slot = dom.list.children[0];
    // keep rendered elements with ids in the range of interest
    while (
      plantAt < PAGE_LENGTH &&
      slot && slot.id === 'search-result-' + (results[start] || {}).i
    ) {
      slot = slot.nextElementSibling;
      plantAt++;
      start++;
    }
    // add new elements
    while (start < Math.min(end, results.length)) {
      const entry = createSearchResultNode(results[start++]);
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
    if (scrollToFirstResult && (!FIREFOX || FIREFOX >= 55)) {
      debounce(doScrollToFirstResult);
    }
    // navigation
    for (const place in dom.nav) {
      const nav = dom.nav[place];
      nav._prev.disabled = displayedPage <= 1;
      nav._next.disabled = displayedPage >= totalPages;
      nav._page.textContent = displayedPage;
      nav._total.textContent = totalPages;
    }
  }

  function doScrollToFirstResult() {
    if (dom.container.scrollHeight > window.innerHeight * 2) {
      scrollToFirstResult = false;
      dom.container.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }

  /**
   * @param {IndexEntry} result
   * @returns {Node}
   */
  function createSearchResultNode(result) {
    const entry = t.template.searchResult.cloneNode(true);
    const {
      i: id,
      n: name,
      r: rating,
      u: updateTime,
      w: weeklyInstalls,
      t: totalInstalls,
      an: author,
      sa: shotArchived,
      sn: shotName,
    } = entry._result = result;
    entry.id = RESULT_ID_PREFIX + id;
    // title
    Object.assign($('.search-result-title', entry), {
      onclick: Events.openURLandHide,
      href: URLS.usoArchive + `?category=${category}&style=${id}`,
    });
    $('.search-result-title span', entry).textContent =
      t.breakWord(name.length < 300 ? name : name.slice(0, 300) + '...');
    // screenshot
    const auto = URLS.uso + `auto_style_screenshots/${id}${USO_AUTO_PIC_SUFFIX}`;
    Object.assign($('.search-result-screenshot', entry), {
      src: shotName && !shotName.endsWith(USO_AUTO_PIC_SUFFIX)
        ? `${shotArchived ? URLS.usoArchiveRaw : URLS.uso + 'style_'}screenshots/${shotName}`
        : auto,
      _src: auto,
      onerror: fixScreenshot,
    });
    // author
    Object.assign($('[data-type="author"] a', entry), {
      textContent: author,
      title: author,
      href: URLS.usoArchive + '?author=' + encodeURIComponent(author).replace(/%20/g, '+'),
      onclick: Events.openURLandHide,
    });
    // rating
    $('[data-type="rating"]', entry).dataset.class =
      !rating ? 'none' :
        rating >= 2.5 ? 'good' :
          rating >= 1.5 ? 'okay' :
            'bad';
    $('[data-type="rating"] dd', entry).textContent = rating && rating.toFixed(1) || '';
    // time
    Object.assign($('[data-type="updated"] time', entry), {
      dateTime: updateTime * 1000,
      textContent: t.formatDate(updateTime * 1000),
    });
    // totals
    $('[data-type="weekly"] dd', entry).textContent = formatNumber(weeklyInstalls);
    $('[data-type="total"] dd', entry).textContent = formatNumber(totalInstalls);
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
      this.src = BLANK_PIXEL;
      this.onerror = null;
    }
  }

  function renderActionButtons(entry, installedId) {
    if (Number(entry)) {
      entry = $('#' + RESULT_ID_PREFIX + entry);
    }
    if (!entry) return;
    const result = entry._result;
    if (typeof installedId === 'number') {
      result.installed = installedId > 0;
      result.installedStyleId = installedId;
    }
    const isInstalled = result.installed;
    if (isInstalled && !('installed' in entry.dataset)) {
      entry.dataset.installed = '';
      $('.search-result-status', entry).textContent = t('clickToUninstall');
    } else if (!isInstalled && 'installed' in entry.dataset) {
      delete entry.dataset.installed;
      $('.search-result-status', entry).textContent = '';
      hide('.search-result-customize', entry);
    }
    const notMatching = installedId > 0 && !$entry(installedId);
    if (notMatching !== entry.classList.contains('not-matching')) {
      entry.classList.toggle('not-matching');
      if (notMatching) {
        entry.prepend(t.template.searchResultNotMatching.cloneNode(true));
      } else {
        entry.firstElementChild.remove();
      }
    }
    Object.assign($('.search-result-screenshot', entry), {
      onclick: isInstalled ? uninstall : install,
      title: isInstalled ? '' : t('installButton'),
    });
    $('.search-result-uninstall', entry).onclick = uninstall;
    $('.search-result-install', entry).onclick = install;
  }

  function renderFullInfo(entry, style) {
    let {description, vars} = style.usercssData;
    // description
    description = (description || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/([^.][.。?!]|[\s,].{50,70})\s+/g, '$1\n')
      .replace(/([\r\n]\s*){3,}/g, '\n\n');
    Object.assign($('.search-result-description', entry), {
      textContent: description,
      title: description,
    });
    // config button
    if (vars) {
      const btn = $('.search-result-customize', entry);
      btn.onclick = () => $('.configure', $entry(style)).click();
      show(btn);
    }
  }

  async function install() {
    const entry = this.closest('.search-result');
    const result = /** @type IndexEntry */ entry._result;
    const {i: id} = result;
    const installButton = $('.search-result-install', entry);

    showSpinner(entry);
    saveScrollPosition(entry);
    installButton.disabled = true;
    entry.style.setProperty('pointer-events', 'none', 'important');
    // FIXME: move this to background page and create an API like installUSOStyle
    result.pingbackTimer = setTimeout(download, PINGBACK_DELAY,
      `${URLS.uso}styles/install/${id}?source=stylish-ch`);

    const updateUrl = URLS.makeUsoArchiveCodeUrl(id);
    try {
      const sourceCode = await download(updateUrl);
      const style = await API.usercss.install({sourceCode, updateUrl});
      renderFullInfo(entry, style);
    } catch (reason) {
      error(`Error while downloading usoID:${id}\nReason: ${reason}`);
    }
    $remove('.lds-spinner', entry);
    installButton.disabled = false;
    entry.style.pointerEvents = '';
  }

  function uninstall() {
    const entry = this.closest('.search-result');
    saveScrollPosition(entry);
    API.styles.delete(entry._result.installedStyleId);
  }

  function saveScrollPosition(entry) {
    dom.scrollPos = entry.getBoundingClientRect().top;
    dom.scrollPosElement = entry;
  }

  function restoreScrollPosition() {
    window.scrollBy(0, dom.scrollPosElement.getBoundingClientRect().top - dom.scrollPos);
  }

  /**
   * Resolves the Userstyles.org "category" for a given URL.
   * @returns {boolean} true if the category has actually changed
   */
  function calcCategory({retry} = {}) {
    const u = tryCatch(() => new URL(tabURL));
    const old = category;
    if (!u) {
      // Invalid URL
      category = '';
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
    }
    return category !== old;
  }

  async function fetchIndex() {
    const timer = setTimeout(showSpinner, BUSY_DELAY, dom.list);
    index = (await download(INDEX_URL, {responseType: 'json'}))
      .filter(res => res.f === 'uso');
    clearTimeout(timer);
    $remove(':scope > .lds-spinner', dom.list);
    return index;
  }

  async function search({retry} = {}) {
    return retry && !calcCategory({retry})
      ? []
      : (index || await fetchIndex()).filter(isResultMatching).sort(comparator);
  }

  function isResultMatching(res) {
    // We're trying to call calcHaystack only when needed, not on all 100K items
    const {c} = res;
    return (
      c === category ||
      category !== STYLUS_CATEGORY && (
        searchGlobals &&
        c === 'global' &&
        (query.length || calcHaystack(res)._nLC.includes(category))
      )
    ) && (
      !query.length || // to skip calling calcHaystack
      query.every(isInHaystack, calcHaystack(res))
    );
  }

  /** @this {IndexEntry} haystack */
  function isInHaystack(needle) {
    return this._year === needle && this.c !== 'global' ||
           this._nLC.includes(needle);
  }

  /**
   * @param {IndexEntry} a
   * @param {IndexEntry} b
   */
  function comparator(a, b) {
    return (
      order === 'n'
        ? a.n < b.n ? -1 : a.n > b.n
        : b[order] - a[order]
    ) || b.t - a.t;
  }

  function calcUsoId({md5Url: m, updateUrl}) {
    return parseInt(m && m.match(/\d+|$/)[0]) ||
           URLS.extractUsoArchiveId(updateUrl);
  }

  function calcHaystack(res) {
    if (!res._nLC) res._nLC = res.n.toLocaleLowerCase();
    if (!res._year) res._year = new Date(res.u * 1000).getFullYear();
    return res;
  }
})();
