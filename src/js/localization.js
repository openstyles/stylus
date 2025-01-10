/**
 * <tag i18n="id"> - like el.prepend() inserts the text as the first node
 * <tag i18n="+id"> - like el.append() inserts the text as the last node
 * <tag i18n="html:id">, <tag i18n="+html:id"> - ditto for innerHTML (sanitized)
 * <tag i18n="title: id"> - creates an attribute `title`, spaces are ignored
 * <tag i18n="id, +id2, title:id3, placeholder:id4, data-foo:id5">
 */
import {$createFragment} from './dom';
import {t} from './util';

/** @typedef {Record<string, Element|DocumentFragment>} TemplateCache */
/** @type {TemplateCache} */
export const templateCache = {};
/** @type {TemplateCache} */
export const template = /*@__PURE__*/new Proxy(templateCache, {
  get: (obj, k) => obj[k] || createTemplate($(`template[data-id="${k}"]`)),
});
const ALLOWED_TAGS = ['a', 'b', 'br', 'code', 'i', 'hr', 'nobr', 'small', 'sub', 'sup', 'wbr'];
const RX_WORD_BREAK = /([\w{-\uFFFF]{10}|[\w{-\uFFFF]{5,10}[!'")*,./]|((?!\s)\W){10})(?!\s|$)/gu;
const SELECTOR = '[i18n]';
const RELATIVE_UNITS = [
  // size, name, precision
  [60, 'second', 0],
  [60, 'minute', 0],
  [24, 'hour', 1],
  [7, 'day', 1],
  [4, 'week', 1],
  [12, 'month', 1],
  [1e99, 'year', 1],
];
const intlCache = {};
/** Adds soft hyphens every 10 characters to ensure the long words break before breaking the layout */
export const breakWord = text => text.length <= 10 ? text
  : text.replace(RX_WORD_BREAK, '$&\u00AD');
export const parseHtml = str => new DOMParser().parseFromString(str, 'text/html');
export const tHTML = html => typeof html !== 'string'
  ? html
  : /<\w+/.test(html) // check for html tags
    ? $createFragment(sanitizeHtml(html))
    : document.createTextNode(html);

let onBodyListeners = [];

function tElements(elems) {
  for (const el of elems) {
    const attr = el.getAttribute('i18n');
    if (!attr) continue;
    for (let item of attr.split(',')) {
      item = item.trim();
      const add = item.charCodeAt(0) === 43/* + */;
      const fn = add ? 'append' : 'prepend';
      const i = item.indexOf(':');
      const key = i > 0 && item.slice(add, i);
      const val = t(i > 0 ? item.slice(i + 1).trim() : add ? item.slice(1) : item);
      if (!key) el[fn](breakWord(val));
      else if (key === 'html') el[fn](...sanitizeHtml(val));
      else el.setAttribute(key, breakWord(val));
    }
    el.removeAttribute('i18n');
  }
}

function createTemplate(el) {
  if (!el) return;
  const {content = el, dataset: {id} = {}} = el;
  const first = content.firstChild;
  const res = first.nextSibling ? content : first;
  if (id) templateCache[id] = res;
  tElements(res.$$(SELECTOR));
  return res;
}

export function htmlToTemplate(html) {
  const el = parseHtml(html).body;
  const first = el.firstChild;
  const res = first.nextSibling ? $createFragment(el.childNodes) : first;
  tElements(res.$$(SELECTOR));
  return res;
}

export function htmlToTemplateCache(html) {
  for (const el of parseHtml(html).$$('template[data-id]')) createTemplate(el);
  return templateCache;
}

export function sanitizeHtml(str) {
  const root = parseHtml(str).body;
  const toRemove = [];
  const walker = document.createTreeWalker(root);
  for (let n; (n = walker.nextNode());) {
    if (n.nodeType === Node.TEXT_NODE) {
      n.nodeValue = breakWord(n.nodeValue);
    } else if (ALLOWED_TAGS.includes(n.localName)) {
      const isA = n.localName === 'a';
      for (const attr of n.attributes) {
        if (!(isA && attr.localName === 'href' && /^https?:/.test(n.href))) {
          n.removeAttribute(attr.name);
        }
      }
      if (isA) {
        n.target = '_blank';
        n.rel = 'noreferrer';
      }
    } else {
      toRemove.push(n);
    }
  }
  for (const n of toRemove) {
    n.parentNode?.removeChild(n); // not using .remove() as there may be a non-element
  }
  return root.childNodes;
}

export function formatDate(date, needsTime) {
  if (!date) {
    return '';
  }
  try {
    const now = new Date();
    const newDate = new Date(Number(date) || date);
    const needsYear = newDate.getYear() !== now.getYear();
    const needsWeekDay = needsTime && (now - newDate <= 7 * 24 * 3600e3);
    const intlKey =
      (needsWeekDay ? 'W' : '') +
      (needsYear ? 'Y' : '') +
      (needsTime ? 'HM' : '');
    const intl = intlCache[intlKey] ||
      (intlCache[intlKey] = new Intl.DateTimeFormat([chrome.i18n.getUILanguage(), 'en'], {
        day: 'numeric',
        month: 'short',
        // needsTime = no width constraint, so we'll show the full year in all dates for consistency
        year: needsTime ? 'numeric' : needsYear ? '2-digit' : undefined,
        hour: needsTime ? 'numeric' : undefined,
        minute: needsTime ? '2-digit' : undefined,
        weekday: needsWeekDay ? 'long' : undefined,
      }));
    const string = intl.format(newDate);
    return string === 'Invalid Date' ? '' : string;
  } catch {
    return '';
  }
}

/**
 * @param {Date|number} date
 * @param {RelativeTimeFormatStyle} [style]
 * @return {string}
 */
export function formatRelativeDate(date, style) {
  let delta = (Date.now() - date) / 1000;
  if (delta >= 0 && Intl.RelativeTimeFormat) {
    for (const [span, unit, frac] of RELATIVE_UNITS) {
      if (delta < span) {
        return (/** @type {RelativeTimeFormat} */ intlCache.R ||
          (intlCache.R = new Intl.RelativeTimeFormat([chrome.i18n.getUILanguage(), 'en'], {style}))
        ).format(-delta.toFixed(frac), unit);
      }
      delta /= span;
    }
  }
  return '';
}

export function tBody(fn) {
  if (!fn) {
    tElements(document.$$(SELECTOR));
    const tpl = template.body;
    if (tpl && tpl !== document.body) {
      (template.body = document.body).append(tpl);
    }
    for (fn of onBodyListeners) fn();
    onBodyListeners = undefined;
  } else if (onBodyListeners) {
    onBodyListeners.push(fn);
  } else {
    fn();
  }
}
