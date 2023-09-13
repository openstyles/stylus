/* global $$ $ $create animateElement scrollElementIntoView */// dom.js
/* global API */// msg.js
/* global URLS debounce getOwnTab isEmptyObj sessionStore stringAsRegExpStr */// toolbox.js
/* global removeStyleCode */// events.js
/* global filterAndAppend */// filters.js
/* global installed newUI */// manage.js
/* global sorter */
/* global t */// localization.js
'use strict';

const ENTRY_ID_PREFIX_RAW = 'style-';
const TARGET_TYPES = ['domains', 'urls', 'urlPrefixes', 'regexps'];
const OWN_ICON = chrome.runtime.getURL(chrome.runtime.getManifest().icons['16']);
const AGES = [
  [24, 'h', t('dateAbbrHour', '\x01')],
  [30, 'd', t('dateAbbrDay', '\x01')],
  [12, 'm', t('dateAbbrMonth', '\x01')],
  [Infinity, 'y', t('dateAbbrYear', '\x01')],
];
const groupThousands = num => `${num}`.replace(/\d(?=(\d{3})+$)/g, '$&\xA0');
const renderSize = size => groupThousands(Math.round(size / 1024)) + 'k';
const nameLengths = new Map();

(() => {
  const proto = HTMLImageElement.prototype;
  if ('loading' in proto) return;
  const pSrc = Object.getOwnPropertyDescriptor(proto, 'src');
  const xo = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const el = e.target;
        pSrc.set.call(el, el.dataset.src);
        xo.unobserve(el);
        delete el.dataset.src;
      }
    }
  }, {rootMargin: '200px'});
  Object.defineProperty(proto, 'src', Object.assign({}, pSrc, {
    set(val) {
      if (this.loading === 'lazy') {
        this.dataset.src = val;
        xo.observe(this);
      } else {
        pSrc.set.call(this, val);
      }
    },
  }));
})();

let elementParts;
let badFavs;

function $entry(styleOrId, root = installed) {
  return $(`#${ENTRY_ID_PREFIX_RAW}${styleOrId.id || styleOrId}`, root);
}

function createAgeText(el, style) {
  let val = style.updateDate || style.installDate;
  if (val) {
    val = (Date.now() - val) / 3600e3; // age in hours
    for (const [max, unit, text] of AGES) {
      const rounded = Math.round(val);
      if (rounded < max) {
        el.textContent = text.replace('\x01', rounded);
        el.dataset.value = padLeft(Math.round(rounded), 2) + unit;
        break;
      }
      val /= max;
    }
  } else if (el.firstChild) {
    el.textContent = '';
    delete el.dataset.value;
  }
}

function calcObjSize(obj) {
  if (obj === true || obj == null) return 4;
  if (obj === false) return 5;
  let v = typeof obj;
  if (v === 'string') return obj.length + 2; // inaccurate but fast
  if (v === 'number') return (v = obj) >= 0 && v < 10 ? 1 : Math.ceil(Math.log10(v < 0 ? -v : v));
  if (v !== 'object') return `${obj}`.length;
  let sum = 1;
  if (Array.isArray(obj)) for (v of obj) sum += calcObjSize(v) + 1;
  else for (const k in obj) sum += k.length + 3 + calcObjSize(obj[k]) + 1;
  return sum;
}

function createStyleElement({styleMeta: style, styleNameLC: nameLC, styleSize: size}) {
  // query the sub-elements just once, then reuse the references
  if ((elementParts || {}).newUI !== newUI.enabled) {
    const entry = t.template[newUI.enabled ? 'styleNewUI' : 'style'].cloneNode(true);
    elementParts = {
      newUI: newUI.enabled,
      entry,
      entryClassBase: entry.className,
      checker: $('input', entry) || {},
      nameLink: $('.style-name-link', entry),
      editLink: $('.style-edit-link', entry) || {},
      editHrefBase: 'edit.html?id=',
      homepage: $('.homepage', entry),
      infoAge: $('[data-type=age]', entry),
      infoSize: $('[data-type=size]', entry),
      infoVer: $('[data-type=version]', entry),
      appliesTo: $('.applies-to', entry),
      targets: $('.targets', entry),
      decorations: {
        urlPrefixesAfter: '*',
        regexpsBefore: '/',
        regexpsAfter: '/',
      },
      oldConfigure: !newUI.enabled && $('.configure-usercss', entry),
      oldCheckUpdate: !newUI.enabled && $('.check-update', entry),
    };
  }
  const parts = elementParts;
  const ud = style.usercssData;
  const configurable = ud && ud.vars && !isEmptyObj(ud.vars);
  const name = style.customName || style.name;
  parts.checker.checked = style.enabled;
  parts.nameLink.firstChild.textContent = t.breakWord(name);
  parts.nameLink.href = parts.editLink.href = parts.editHrefBase + style.id;
  parts.homepage.href = parts.homepage.title = style.url || '';
  parts.infoVer.textContent = ud ? ud.version : '';
  parts.infoVer.dataset.value = ud ? ud.version : '';
  // USO-raw and USO-archive version is a date for which we show the Age column
  if (ud && (style.md5Url || URLS.extractUsoaId(style.updateUrl))) {
    parts.infoVer.dataset.isDate = '';
  } else {
    delete parts.infoVer.dataset.isDate;
  }
  createAgeText(parts.infoAge, style);
  parts.infoSize.dataset.value = Math.log10(size || 1) >> 0; // for CSS to target big/small styles
  parts.infoSize.textContent = renderSize(size);
  parts.infoSize.title = `${t('genericSize')}: ${groupThousands(size)} B`;
  if (!newUI.enabled) {
    parts.oldConfigure.classList.toggle('hidden', !configurable);
    parts.oldCheckUpdate.classList.toggle('hidden', !style.updateUrl);
  }
  removeStyleCode(style);

  const entry = parts.entry.cloneNode(true);
  entry.id = ENTRY_ID_PREFIX_RAW + style.id;
  entry.styleId = style.id;
  entry.styleNameLC = nameLC;
  entry.styleMeta = style;
  entry.styleSize = size;
  entry.className = parts.entryClassBase + ' ' +
    (style.enabled ? 'enabled' : 'disabled') +
    (style.updateUrl ? ' updatable' : '') +
    (ud ? ' usercss' : '');

  if (style.updateUrl && newUI.enabled) {
    $('.actions', entry).appendChild(t.template.updaterIcons.cloneNode(true));
  }
  if (configurable && newUI.enabled) {
    $('.actions', entry).appendChild(t.template.configureIcon.cloneNode(true));
  }

  createTargetsElement({entry, style});

  return entry;
}

function createTargetsElement({entry, expanded, style = entry.styleMeta}) {
  const maxTargets = expanded ? 1000 : newUI.enabled ? newUI.targets : 10;
  if (!maxTargets) {
    entry._numTargets = 0;
    return;
  }
  const displayed = new Set();
  const entryTargets = $('.targets', entry);
  const expanderCls = $('.applies-to', entry).classList;
  const targets = elementParts.targets.cloneNode(true);
  let container = targets;
  let el = entryTargets.firstElementChild;
  let numTargets = 0;
  let allTargetsRendered = true;
  for (const type of TARGET_TYPES) {
    for (const section of style.sections) {
      for (const targetValue of section[type] || []) {
        if (displayed.has(targetValue)) {
          continue;
        }
        if (++numTargets > maxTargets) {
          allTargetsRendered = expanded;
          break;
        }
        displayed.add(targetValue);
        const text =
          (elementParts.decorations[type + 'Before'] || '') +
          targetValue +
          (elementParts.decorations[type + 'After'] || '');
        if (el && el.dataset.type === type && el.lastChild.textContent === text) {
          const next = el.nextElementSibling;
          container.appendChild(el);
          el = next;
          continue;
        }
        const element = t.template.appliesToTarget.cloneNode(true);
        if (!newUI.enabled) {
          if (numTargets === maxTargets) {
            container = container.appendChild(t.template.extraAppliesTo.cloneNode(true));
          } else if (numTargets > 1) {
            container.appendChild(t.template.appliesToSeparator.cloneNode(true));
          }
        }
        element.dataset.type = type;
        element.appendChild(document.createTextNode(text));
        container.appendChild(element);
      }
    }
  }
  if (newUI.enabled && numTargets > newUI.targets) {
    expanderCls.add('has-more');
  }
  if (numTargets) {
    entryTargets.parentElement.replaceChild(targets, entryTargets);
  } else if (
    !entry.classList.contains('global') ||
    !entryTargets.firstElementChild
  ) {
    if (entryTargets.firstElementChild) {
      entryTargets.textContent = '';
    }
    entryTargets.appendChild(t.template.appliesToEverything.cloneNode(true));
  }
  entry.classList.toggle('global', !numTargets);
  entry._allTargetsRendered = allTargetsRendered;
  entry._numTargets = numTargets;
  entry.style.setProperty('--num-targets', Math.min(numTargets, newUI.targets));
}

async function getFaviconSrc(container = installed) {
  if (!newUI.hasFavs()) return;
  if (!badFavs) await initBadFavs();
  const regexpRemoveNegativeLookAhead = /(\?!([^)]+\))|\(\?![\w(]+[^)]+[\w|)]+)/g;
  // replace extra characters & all but the first group entry "(abc|def|ghi)xyz" => abcxyz
  const regexpReplaceExtraCharacters = /[\\(]|((\|\w+)+\))/g;
  const regexpMatchRegExp = /[\w-]+[.(]+(com|org|co|net|im|io|edu|gov|biz|info|de|cn|uk|nl|eu|ru)\b/g;
  const regexpMatchDomain = /^.*?:\/\/\W*([-.\w]+)/;
  for (const target of $$('.target', container)) {
    const type = target.dataset.type;
    const targetValue = target.textContent;
    if (!targetValue) continue;
    let favicon = '';
    if (type === 'domains') {
      favicon = targetValue;
    } else if (/-extension:\\?\//.test(targetValue)) {
      favicon = OWN_ICON;
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
    if (!favicon || badFavs && badFavs.includes(favicon)) {
      if (!target.firstElementChild) target.prepend($create('b'));
      continue;
    }
    if (favicon !== OWN_ICON) {
      favicon = URLS.favicon(favicon);
    }
    const img = $(':scope > img:first-child', target) ||
      target.insertAdjacentElement('afterbegin', $create('img', {loading: 'lazy'}));
    if ((img.dataset.src || img.src) !== favicon) {
      img.src = favicon;
    }
  }
}

async function initBadFavs() {
  // API creates a new function each time so we save it for `debounce` which is keyed on function object
  const {put} = API.prefsDb;
  const key = newUI.badFavsKey;
  const rxHost = new RegExp(
    `^${stringAsRegExpStr(URLS.favicon('\n')).replace('\n', '(.*)')}$`);
  badFavs = newUI[key] || await newUI.readBadFavs();
  const fn = e => {
    const code = e.statusCode; // absent for network error
    const host = code && code !== 200 && e.url.match(rxHost)[1];
    if (host && !badFavs.includes(host)) {
      badFavs.push(host);
      debounce(put, 250, badFavs, key);
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

{
  const hideOpts = function (evt) {
    for (const o of [...this.options]) {
      if (o.value !== this.value) o.remove();
    }
    this.style.removeProperty('width');
    if (evt && evt.isTrusted) return this.offsetWidth; // force layout
  };

  const showOpts = function (evt) {
    if (evt.button || this[1]) return;
    const opts = this._opts;
    const elems = Object.values(opts);
    const i = elems.indexOf(opts[this.value]);
    this.style.width = this.offsetWidth + 'px';
    if (i > 0) this.prepend(...elems.slice(0, i));
    this.append(...elems.slice(i + 1));
  };

  window.fitSelectBox = (el, value, init) => {
    const opts = el._opts || (el._opts = {});
    if (init) {
      for (const o of el.options) opts[o.value] = o;
      el.on('keydown', showOpts);
      el.on('mousedown', showOpts);
      el.on('blur', hideOpts);
      el.on('input', hideOpts);
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      Object.defineProperty(el, 'value', {
        get: d.get,
        set: val => {
          const opt = opts[typeof val === 'string' ? val : val = `${val}`];
          if (!opt.isConnected) {
            if (el[0]) el[0].replaceWith(opt);
            else el.append(opt);
          }
          d.set.call(el, val);
          hideOpts.call(el, {});
        },
      });
    }
    el.value = value;
  };
}

function highlightEditedStyle() {
  if (!sessionStore.justEditedStyleId) return;
  const entry = $entry(sessionStore.justEditedStyleId);
  delete sessionStore.justEditedStyleId;
  if (entry) {
    animateElement(entry);
    requestAnimationFrame(() => scrollElementIntoView(entry));
  }
}

/** Adding spaces so CSS can detect "bigness" of a value via amount of spaces at the beginning */
function padLeft(val, width) {
  val = `${val}`;
  return ' '.repeat(Math.max(0, width - val.length)) + val;
}

function fitNameColumn(styles, style) {
  if (style) calcNameLenKey(style);
  styles = styles ? styles.map(calcNameLenKey) : [...nameLengths.values()];
  const pick = sorter.columns > 1 ? .8 : .95; // quotient of entries in single line
  const extras = 5; // average for optional extras like " UC ", "v1.0.0"
  const res = nameLengths.res = styles.sort()[nameLengths.size * pick | 0] + extras - 1e9;
  $.root.style.setProperty('--name-width', res + 'ch');
}

function calcNameLenKey(style) {
  const name = style.displayName || style.name || '';
  const len = 1e9 + // aligning the key for sort() which uses string comparison
    (style.enabled ? 1.05/*bold factor*/ : 1) *
    (name.length + name.replace(/[^\u3000-\uFE00]+/g, '').length/*CJK glyph is 2x wide*/) | 0;
  nameLengths.set(style.id, len);
  return len;
}

function fitSizeColumn(entries = installed.children, entry) {
  let res = entry && renderSize(entry.styleSize).length || 0;
  if (!res) {
    for (const e of entries) res = Math.max(res, e.styleSize);
    res = renderSize(res).length;
  } else if (res <= parseInt($.root.style.getPropertyValue('--size-width'))) {
    return;
  }
  $.root.style.setProperty('--size-width', res + 'ch');
}

function showStyles(styles = [], matchUrlIds) {
  const dummies = styles.map(styleToDummyEntry);
  const sorted = sorter.sort(dummies);
  let index = 0;
  let firstRun = true;
  installed.dataset.total = styles.length;
  const scrollY = (history.state || {}).scrollY;
  const shouldRenderAll = scrollY > window.innerHeight
    || sessionStore.justEditedStyleId
    || CSS.supports('content-visibility', 'auto');
  const renderBin = document.createDocumentFragment();
  fitNameColumn(styles);
  fitSizeColumn(dummies);
  renderStyles();

  function renderStyles() {
    const t0 = performance.now();
    while (index < sorted.length && (
      shouldRenderAll ||
      (index & 7) < 7 ||
      performance.now() - t0 < 50
    )) {
      const entry = createStyleElement(sorted[index++]);
      if (matchUrlIds && !matchUrlIds.includes(entry.styleMeta.id)) {
        entry.classList.add('not-matching');
      }
      renderBin.appendChild(entry);
    }
    filterAndAppend({container: renderBin}).then(sorter.updateStripes);
    if (index < sorted.length) {
      requestAnimationFrame(renderStyles);
      if (firstRun) getFaviconSrc();
      firstRun = false;
      return;
    }
    getFaviconSrc();
    if (sessionStore.justEditedStyleId) {
      setTimeout(highlightEditedStyle); // delaying to avoid forced layout
    }
  }
}

function styleToDummyEntry(style) {
  const name = style.customName || style.name || '';
  return {
    styleMeta: style,
    styleSize: calcObjSize(style) + (style._codeSize || 0),
    // sort case-insensitively the whole list then sort dupes like `Foo` and `foo` case-sensitively
    styleNameLC: name.toLocaleLowerCase() + '\n' + name,
  };
}

/* exported switchUI */
function switchUI({styleOnly} = {}) {
  const current = {};
  const changed = {};
  newUI.readPrefs(current, (id, value) => {
    changed[id] = value !== newUI[id] && (id === 'enabled' || current.enabled);
  });

  if (!styleOnly && isEmptyObj(changed)) {
    return;
  }

  Object.assign(newUI, current);
  newUI.renderClass();

  installed.classList.toggle('has-favicons', newUI.hasFavs());
  installed.classList.toggle('favicons-grayed', newUI.enabled && newUI.faviconsGray);
  installed.style.setProperty('--num-targets', newUI.targets);

  if (styleOnly) {
    return;
  }

  const iconsEnabled = newUI.hasFavs();
  let iconsMissing = iconsEnabled && !$('.applies-to img');
  if (changed.enabled || (iconsMissing && !elementParts)) {
    installed.textContent = '';
    requestAnimationFrame(() => API.styles.getAll().then(showStyles));
    return;
  }
  if (changed.targets) {
    for (const entry of installed.children) {
      $('.applies-to', entry).classList.toggle('has-more', entry._numTargets > newUI.targets);
      if (!entry._allTargetsRendered && newUI.targets > $('.targets', entry).childElementCount) {
        createTargetsElement({entry, expanded: true});
        iconsMissing |= iconsEnabled;
      }
    }
  }
  if (iconsMissing) {
    debounce(getFaviconSrc);
  }
}
