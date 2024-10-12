/**
 * <tag i18n="id"> - like el.prepend() inserts the text as the first node
 * <tag i18n="+id"> - like el.append() inserts the text as the last node
 * <tag i18n="html:id">, <tag i18n="+html:id"> - ditto for innerHTML (sanitized)
 * <tag i18n="title: id"> - creates an attribute `title`, spaces are ignored
 * <tag i18n="id, +id2, title:id3, placeholder:id4, data-foo:id5">
 */
import {fetchText} from '/js/toolbox';
import {$, $$, $toFragment} from './dom-base';

export const template = new Proxy({}, {
  get: (obj, k, _) => obj.hasOwnProperty(k) ? obj[k] :
    (_ = $(`template[data-id="${k}"]`)) && (obj[k] = createTemplate(_)),
});
const ALLOWED_TAGS = ['a', 'b', 'code', 'i', 'sub', 'sup', 'wbr'];
const RX_WORD_BREAK = /([\w\u007B-\uFFFF]{10}|[\w\u007B-\uFFFF]{5,10}[!-/]|((?!\s)\W){10})(?!\s|$)/gu;
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
const cache = {};
const intlCache = {};
let onBodyListeners = [];

export function t(key, params, strict = true) {
  const cached = !params && cache[key];
  const s = cached || chrome.i18n.getMessage(key, params);
  if (!s && strict) throw `Missing string "${key}"`;
  if (!params) cache[key] = s;
  return s;
}

export function tHTML(html) {
  return typeof html !== 'string'
    ? html
    : /<\w+/.test(html) // check for html tags
      ? createHtml(html.replace(/>\n\s*</g, '><').trim())
      : document.createTextNode(html);
}

function tNodeList(nodes) {
  for (const node of nodes) {
    if (!node.localName) continue;
    const attr = node.getAttribute('i18n');
    if (!attr) continue;
    for (const part of attr.split(',')) {
      let toInsert, first;
      let [type, value] = part.trim().split(/\s*:\s*/);
      if (!value) [type, value] = type.split(/(\w+)/);
      value = t(value);
      switch (type) {
        case '':
          first = true;
          // fallthrough
        case '+':
          toInsert = createText(value);
          break;
        case 'html':
          first = true;
          // fallthrough
        case '+html':
          toInsert = createHtml(value);
          break;
        default:
          node.setAttribute(type, value);
      }
      if (toInsert) {
        node.insertBefore(toInsert, first && node.firstChild);
      }
    }
    node.removeAttribute('i18n');
  }
}

/** Adds soft hyphens every 10 characters to ensure the long words break before breaking the layout */
export function breakWord(text) {
  return text.length <= 10 ? text :
    text.replace(RX_WORD_BREAK, '$&\u00AD');
}

export function createTemplate(el) {
  const {content} = el;
  const toRemove = [];
  // Compress inter-tag whitespace to reduce DOM tree and avoid space between elements without flex
  const walker = document.createTreeWalker(content,
    4 /*NodeFilter.SHOW_TEXT*/ | 0x80 /*NodeFilter.SHOW_COMMENT*/);
  for (let n; (n = walker.nextNode());) {
    if (!/[\xA0\S]/.test(n.textContent) ||  // allowing \xA0 so as to preserve &nbsp;
        n.nodeType === 8 /*Node.COMMENT_NODE*/) {
      toRemove.push(n);
    }
  }
  toRemove.forEach(n => n.remove());
  tNodeList($$(SELECTOR, content));
  return (template[el.dataset.id] =
    content.childNodes.length > 1
      ? content
      : content.childNodes[0]);
}

export function createText(str) {
  return document.createTextNode(breakWord(str));
}

export function createHtml(str, trusted) {
  const root = parseHtml(str);
  if (!trusted) {
    sanitizeHtml(root);
  } else if (str.includes('i18n=')) {
    tNodeList($$(SELECTOR, root));
  }
  return $toFragment(root);
}

export async function fetchTemplate(url, name, all) {
  let res = template[name];
  if (!res) {
    res = parseHtml(await fetchText(url), '*');
    if (![...$$(`template[data-id${all ? '' : `="${name}"`}]`, res)].map(createTemplate).length) {
      createTemplate({
        content: $toFragment($('body', res)),
        dataset: {id: name},
      });
    }
    res = template[name];
  }
  return res;
}

function parseHtml(str, pick = 'body') {
  return $(pick, new DOMParser().parseFromString(str, 'text/html'));
}

export function sanitizeHtml(root) {
  const toRemove = [];
  const walker = document.createTreeWalker(root);
  for (let n; (n = walker.nextNode());) {
    if (n.nodeType === Node.TEXT_NODE) {
      n.nodeValue = breakWord(n.nodeValue);
    } else if (ALLOWED_TAGS.includes(n.localName)) {
      for (const attr of n.attributes) {
        if (n.localName !== 'a' || attr.localName !== 'href' || !/^https?:/.test(n.href)) {
          n.removeAttribute(attr.name);
        }
      }
    } else {
      toRemove.push(n);
    }
  }
  for (const n of toRemove) {
    const parent = n.parentNode;
    if (parent) parent.removeChild(n); // not using .remove() as there may be a non-element
  }
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
    tNodeList($$(SELECTOR));
    if (template.body) document.body.append(template.body);
    for (fn of onBodyListeners) fn();
    template.body = onBodyListeners = undefined;
  } else if (onBodyListeners) {
    onBodyListeners.push(fn);
  } else {
    fn();
  }
}
