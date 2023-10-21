/* global API */// msg.js
/* global $create */// dom.js
/* global URLS tryRegExp */// toolbox.js
/* global helpPopup */// util.js
/* global t */// localization.js
'use strict';

const regexpTester = (() => {
  const OWN_ICON = chrome.runtime.getManifest().icons['16'];
  const cachedRegexps = new Map();
  let currentRegexps = [];
  let isWatching = false;
  let isShown = false;
  let note;

  return {

    toggle(state = !isShown) {
      if (state && !isShown) {
        if (!isWatching) {
          isWatching = true;
          chrome.tabs.onRemoved.addListener(onTabRemoved);
          chrome.tabs.onUpdated.addListener(onTabUpdated);
        }
        helpPopup.show('', $create('.regexp-report'))
          .onClose.add(() => regexpTester.toggle(false));
        isShown = true;
      } else if (!state && isShown) {
        unwatch();
        helpPopup.close();
        isShown = false;
      }
    },

    async update(newRegexps) {
      if (!isShown) {
        unwatch();
        return;
      }
      if (newRegexps) {
        currentRegexps = newRegexps;
      }
      const regexps = currentRegexps.map(text => {
        const rxData = Object.assign({text}, cachedRegexps.get(text));
        if (!rxData.urls) {
          cachedRegexps.set(text, Object.assign(rxData, {
            // imitate buggy Stylish-for-chrome
            rx: tryRegExp('^' + text + '$'),
            urls: new Map(),
          }));
        }
        return rxData;
      });
      const getMatchInfo = m => m && {text: m[0], pos: m.index};
      const tabs = await browser.tabs.query({});
      const supported = tabs.map(tab => tab.pendingUrl || tab.url).filter(URLS.supported);
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
          stats.full.data.push({text, urls: full});
        }
        if (partial.length) {
          stats.partial.data.push({text, urls: partial});
        }
      }
      // render stats
      const report = $create('.regexp-report');
      const br = $create('br');
      for (const type in stats) {
        // top level groups: full, partial, none, invalid
        const {label, data} = stats[type];
        if (!data.length) {
          continue;
        }
        const block = report.appendChild(
          $create('details', {open: true, dataset: {type}}, [
            $create('summary', label),
          ]));
        // 2nd level: regexp text
        for (const {text, urls} of data) {
          if (urls) {
            // type is partial or full
            block.appendChild(
              $create('details', {open: true}, [
                $create('summary', text),
                $create('div', urls),
              ]));
          } else {
            // type is none or invalid
            block.appendChild(document.createTextNode(text));
            block.appendChild(br.cloneNode());
          }
        }
      }
      if (!note) {
        note = $create('div.regexp-report-note',
          `${t('styleRegexpTestNoteStar')} ${t('styleRegexpTestNote')}`
            .split(/(<[^>]+>|\\+)/)
            .map((s, i) => i % 2 ? $create('code', s[0] === '<' ? s.slice(1, -1) : s) : s));
      }
      helpPopup.show(t('styleRegexpTestTitle'), report);
      report.onclick = onClick;
      report.appendChild(note);
    },
  };

  function onClick(event) {
    const a = event.target.closest('a, button');
    if (a) {
      event.preventDefault();
      API.openURL({
        url: a.href || a.textContent,
        currentWindow: null,
      });
    }
  }

  function onTabRemoved() {
    regexpTester.update();
  }

  function onTabUpdated(tabId, info) {
    if (info.url) {
      regexpTester.update();
    }
  }

  function unwatch() {
    if (isWatching) {
      chrome.tabs.onRemoved.removeListener(onTabRemoved);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      isWatching = false;
    }
  }
})();
