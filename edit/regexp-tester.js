/* global showHelp */
'use strict';

// eslint-disable-next-line no-var
var regExpTester = (() => {
  const GET_FAVICON_URL = 'https://www.google.com/s2/favicons?domain=';
  const OWN_ICON = chrome.runtime.getManifest().icons['16'];
  const cachedRegexps = new Map();
  let currentRegexps = [];
  let isInit = false;

  function init() {
    isInit = true;
    chrome.tabs.onUpdated.addListener(onTabUpdate);
  }

  function uninit() {
    chrome.tabs.onUpdated.removeListener(onTabUpdate);
    isInit = false;
  }

  function onTabUpdate(tabId, info) {
    if (info.url) {
      update();
    }
  }

  function isShowed() {
    return Boolean($('.regexp-report'));
  }

  function toggle(state = !isShowed()) {
    if (state && !isShowed()) {
      if (!isInit) {
        init();
      }
      showHelp('', $element({className: 'regexp-report'}));
    } else if (!state && isShowed()) {
      if (isInit) {
        uninit();
      }
      // TODO: need a closeHelp function
      $('#help-popup .dismiss').onclick();
    }
  }

  function update(newRegexps) {
    if (!isShowed()) {
      if (isInit) {
        uninit();
      }
      return;
    }
    if (newRegexps) {
      currentRegexps = newRegexps;
    }
    const regexps = currentRegexps.map(text => {
      const rxData = Object.assign({text}, cachedRegexps.get(text));
      if (!rxData.urls) {
        cachedRegexps.set(text, Object.assign(rxData, {
          // imitate buggy Stylish-for-chrome, see detectSloppyRegexps()
          rx: tryRegExp('^' + text + '$'),
          urls: new Map(),
        }));
      }
      return rxData;
    });
    const getMatchInfo = m => m && {text: m[0], pos: m.index};
    queryTabs().then(tabs => {
      const supported = tabs.map(tab => tab.url)
        .filter(url => URLS.supported(url));
      const unique = [...new Set(supported).values()];
      for (const rxData of regexps) {
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
        partial: {data: [], label: [
          t('styleRegexpTestPartial'),
          template.regexpTestPartial.cloneNode(true),
        ]},
        none: {data: [], label: t('styleRegexpTestNone')},
        invalid: {data: [], label: t('styleRegexpTestInvalid')},
      };
      // collect stats
      for (const {text, rx, urls} of regexps) {
        if (!rx) {
          stats.invalid.data.push({text});
          continue;
        }
        if (!urls.size) {
          stats.none.data.push({text});
          continue;
        }
        const full = [];
        const partial = [];
        for (const [url, match] of urls.entries()) {
          const faviconUrl = url.startsWith(URLS.ownOrigin)
            ? OWN_ICON
            : GET_FAVICON_URL + new URL(url).hostname;
          const icon = $element({tag: 'img', src: faviconUrl});
          if (match.text.length === url.length) {
            full.push($element({appendChild: [
              icon,
              url,
            ]}));
          } else {
            partial.push($element({appendChild: [
              icon,
              url.substr(0, match.pos),
              $element({tag: 'mark', textContent: match.text}),
              url.substr(match.pos + match.text.length),
            ]}));
          }
        }
        if (full.length) {
          stats.full.data.push({text, urls: full});
        }
        if (partial.length) {
          stats.partial.data.push({text, urls: partial});
        }
      }
      // render stats
      const report = $element({className: 'regexp-report'});
      const br = $element({tag: 'br'});
      for (const type in stats) {
        // top level groups: full, partial, none, invalid
        const {label, data} = stats[type];
        if (!data.length) {
          continue;
        }
        const block = report.appendChild($element({
          tag: 'details',
          open: true,
          dataset: {type},
          appendChild: $element({tag: 'summary', appendChild: label}),
        }));
        // 2nd level: regexp text
        for (const {text, urls} of data) {
          if (urls) {
            // type is partial or full
            block.appendChild($element({
              tag: 'details',
              open: true,
              appendChild: [
                $element({tag: 'summary', textContent: text}),
                // 3rd level: tab urls
                ...urls,
              ],
            }));
          } else {
            // type is none or invalid
            block.appendChild(document.createTextNode(text));
            block.appendChild(br.cloneNode());
          }
        }
      }
      showHelp(t('styleRegexpTestTitle'), report);

      $('.regexp-report').onclick = event => {
        const target = event.target.closest('a, .regexp-report div');
        if (target) {
          openURL({
            url: target.href || target.textContent,
            currentWindow: null,
          });
          event.preventDefault();
        }
      };
    });
  }

  return {toggle, update};
})();
