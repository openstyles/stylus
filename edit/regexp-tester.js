/* global $create */// dom.js
/* global URLS openURL tryRegExp */// toolbox.js
/* global helpPopup */// util.js
/* global t */// localization.js
'use strict';

const regexpTester = (() => {
  const GET_FAVICON_URL = 'https://www.google.com/s2/favicons?domain=';
  const OWN_ICON = chrome.runtime.getManifest().icons['16'];
  const cachedRegexps = new Map();
  let currentRegexps = [];
  let isWatching = false;
  let isShown = false;

  return {

    toggle(state = !isShown) {
      if (state && !isShown) {
        if (!isWatching) {
          isWatching = true;
          chrome.tabs.onUpdated.addListener(onTabUpdate);
        }
        helpPopup.show('', $create('.regexp-report'));
        window.on('closeHelp', () => regexpTester.toggle(false), {once: true});
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
            : GET_FAVICON_URL + new URL(url).hostname;
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
                // 3rd level: tab urls
                ...urls,
              ]));
          } else {
            // type is none or invalid
            block.appendChild(document.createTextNode(text));
            block.appendChild(br.cloneNode());
          }
        }
      }
      helpPopup.show(t('styleRegexpTestTitle'), report);
      report.onclick = onClick;

      const note = $create('p.regexp-report-note',
        t('styleRegexpTestNote')
          .split(/(\\+)/)
          .map(s => (s.startsWith('\\') ? $create('code', s) : s)));
      report.appendChild(note);
      report.style.paddingBottom = note.offsetHeight + 'px';
    },
  };

  function onClick(event) {
    const a = event.target.closest('a, button');
    if (a) {
      event.preventDefault();
      openURL({
        url: a.href || a.textContent,
        currentWindow: null,
      });
    }
  }

  function onTabUpdate(tabId, info) {
    if (info.url) {
      regexpTester.update();
    }
  }

  function unwatch() {
    if (isWatching) {
      chrome.tabs.onUpdated.removeListener(onTabUpdate);
      isWatching = false;
    }
  }
})();
