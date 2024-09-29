import browser from '/js/browser';
import {$create} from '/js/dom';
import {t} from '/js/localization';
import {API} from '/js/msg';
import {tryRegExp, URLS} from '/js/toolbox';
import editor from './editor';
import {helpPopup} from './util';

const OWN_ICON = chrome.runtime.getManifest().icons['16'];
const cachedRegexps = new Map();
const inputs = editor.regexps;
const observe = (el, on) => el[on ? 'on' : 'off']('input', update);
let isWatching = false;
let popup;
let note;

['add', 'delete'].forEach((key, i) => {
  const fn = inputs[key];
  inputs[key] = el => {
    const res = fn.call(inputs, el);
    if (isWatching) {
      observe(el, !i);
      update();
    }
    return res;
  };
});

export function toggle(state = !popup) {
  if (state && !popup) {
    if (!isWatching) {
      isWatching = true;
      chrome.tabs.onRemoved.addListener(onTabRemoved);
      chrome.tabs.onUpdated.addListener(onTabUpdated);
      for (const el of inputs) observe(el, true);
    }
    popup = helpPopup.show(t('styleRegexpTestTitle'), ' ', {className: 'regexp-report'});
    popup.onClose.add(() => toggle(false));
    update();
  } else if (!state && popup) {
    unwatch();
    popup._close.click();
    popup = null;
  }
}

export async function update() {
  if (!popup) {
    unwatch();
    return;
  }
  const regexps = new Map();
  const ael = document.activeElement;
  for (const el of inputs) {
    const text = el.value;
    const old = regexps.get(text);
    const rxData = old || Object.assign({text}, cachedRegexps.get(text));
    if (!rxData.urls) {
      cachedRegexps.set(text, Object.assign(rxData, {
        // imitate buggy Stylish-for-chrome
        rx: tryRegExp('^' + text + '$'),
        urls: new Map(),
      }));
    }
    if (!old || el === ael) rxData.el = el;
    if (!old) regexps.set(text, rxData);
  }
  const getMatchInfo = m => m && {text: m[0], pos: m.index};
  const tabs = await browser.tabs.query({});
  const supported = tabs.map(tab => tab.pendingUrl || tab.url).filter(URLS.supported);
  const unique = [...new Set(supported).values()];
  for (const rxData of regexps.values()) {
    const {rx, urls} = rxData;
    if (rx) {
      const urlsNow = new Map();
      for (const url of unique) {
        const match = urls.get(url) || getMatchInfo(url.match(rx));
        if (match) {
          urlsNow.set(url, match);
        }
      }
      rxData.urls = urlsNow;
    }
  }
  const stats = {
    full: {data: [], label: t('styleRegexpTestFull')},
    partial: {
      data: [], label: [
        t('styleRegexpTestPartial'),
        t.template.regexpTestPartial.cloneNode(true),
      ],
    },
    none: {data: [], label: t('styleRegexpTestNone')},
    invalid: {data: [], label: t('styleRegexpTestInvalid')},
  };
  // collect stats
  for (const {el, text, rx, urls} of regexps.values()) {
    if (!rx) {
      stats.invalid.data.push({el, text});
      continue;
    }
    if (!urls.size) {
      stats.none.data.push({el, text});
      continue;
    }
    const full = [];
    const partial = [];
    for (const [url, match] of urls.entries()) {
      const faviconUrl = url.startsWith(URLS.ownOrigin)
        ? OWN_ICON
        : URLS.favicon(new URL(url).hostname);
      const icon = $create('img', {src: faviconUrl});
      if (match.text.length === url.length) {
        full.push($create('a', {tabIndex: 0}, [
          icon,
          url,
        ]));
      } else {
        partial.push($create('a', {tabIndex: 0}, [
          icon,
          url.substr(0, match.pos),
          $create('mark', match.text),
          url.substr(match.pos + match.text.length),
        ]));
      }
    }
    if (full.length) {
      stats.full.data.push({el, text, urls: full});
    }
    if (partial.length) {
      stats.partial.data.push({el, text, urls: partial});
    }
  }
  // render stats
  const report = $create('div');
  for (const type in stats) {
    // top level groups: full, partial, none, invalid
    const {label, data} = stats[type];
    if (!data.length) {
      continue;
    }
    const h3 = $create('h3', {'data-num': data.length}, label);
    const block = report.appendChild(
      $create('details', {
        'data-type': type,
        'open': !report.firstChild,
      }, $create('summary', h3)));
    // 2nd level: regexp text
    for (const {el, text, urls} of data) {
      if (urls) {
        // type is partial or full
        block.appendChild(
          $create('article', [
            $create('h4', {_source: el}, text),
            ...urls,
          ]));
      } else {
        // type is none or invalid
        block.appendChild($create('a', {tabIndex: 0, _source: el}, text));
      }
    }
  }
  if (!note) {
    note = $create('div.regexp-report-note',
      `${t('styleRegexpTestNoteStar')} ${t('styleRegexpTestNote')}`
        .split(/(<[^>]+>|\\+)/)
        .map((s, i) => i % 2 ? $create('code', s[0] === '<' ? s.slice(1, -1) : s) : s));
  }
  popup._contents.firstChild.replaceWith(report);
  report.onclick = onClick;
  if (!report.contains(note)) report.append(note);
}

function onClick(event) {
  let el = event.target;
  if (el._source) {
    el._source.focus();
  } else if ((el = el.closest('a'))) {
    event.preventDefault();
    API.openURL({
      url: el.href || el.textContent,
      currentWindow: null,
    });
  }
}

function onTabRemoved() {
  update();
}

function onTabUpdated(tabId, info) {
  if (info.url) {
    update();
  }
}

function unwatch() {
  if (isWatching) {
    chrome.tabs.onRemoved.removeListener(onTabRemoved);
    chrome.tabs.onUpdated.removeListener(onTabUpdated);
    for (const el of inputs) observe(el, false);
    isWatching = false;
  }
}
