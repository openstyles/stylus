/* global API */// msg.js
/* global closeCurrentTab download */// toolbox.js
'use strict';

/* exported preinit */
const preinit = (() => {
  const params = new URLSearchParams(location.search);
  const tabId = params.has('tabId') ? Number(params.get('tabId')) : -1;
  const initialUrl = params.get('updateUrl');

  /** @type function(?options):Promise<?string> */
  let getData;
  /** @type {Promise<?string>} */
  let firstGet;
  if (tabId < 0) {
    getData = DirectDownloader();
    firstGet = API.usercss.getInstallCode(initialUrl)
      .then(code => code || getData())
      .catch(getData);
  } else {
    getData = PortDownloader();
    firstGet = getData({force: true});
  }

  function DirectDownloader() {
    let oldCode = null;
    return async () => {
      const code = await download(initialUrl);
      if (oldCode !== code) {
        oldCode = code;
        return code;
      }
    };
  }

  function PortDownloader() {
    const resolvers = new Map();
    const port = chrome.tabs.connect(tabId, {name: 'downloadSelf'});
    port.onMessage.addListener(({id, code, error}) => {
      const r = resolvers.get(id);
      resolvers.delete(id);
      if (error) {
        r.reject(error);
      } else {
        r.resolve(code);
      }
    });
    port.onDisconnect.addListener(async () => {
      const tab = await browser.tabs.get(tabId).catch(() => ({}));
      if (tab.url === initialUrl) {
        location.reload();
      } else {
        closeCurrentTab();
      }
    });
    return (opts = {}) => new Promise((resolve, reject) => {
      const id = performance.now();
      resolvers.set(id, {resolve, reject});
      opts.id = id;
      port.postMessage(opts);
    });
  }

  return {

    getData,
    initialUrl,
    tabId,

    /** @type {Promise<{style, dup} | {error}>} */
    ready: (async () => {
      let sourceCode;
      try {
        sourceCode = await firstGet;
      } catch (error) {
        return {error};
      }
      try {
        const data = await API.usercss.build({sourceCode, checkDup: true, metaOnly: true});
        Object.defineProperty(data.style, 'sectionsPromise', {
          value: API.usercss.buildCode(data.style).then(style => style.sections),
          configurable: true,
        });
        return data;
      } catch (error) {
        return {error, sourceCode};
      }
    })(),
  };
})();
