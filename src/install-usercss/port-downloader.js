import {closeCurrentTab} from '@/js/util-webext';

export default function PortDownloader(url, tabId) {
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
    if (tab.url === url) {
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
