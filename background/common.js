/* global URLS getActiveTab tryJSONparse */// toolbox.js
/* global tabMan */// tab-manager.js
/* global getUrlOrigin */// tab-util.js
'use strict';

/**
 * Common stuff that's loaded first so it's immediately available to all background scripts
 */

window.bgReady = {}; /* global bgReady */
bgReady.styles = new Promise(r => (bgReady._resolveStyles = r));
bgReady.all = new Promise(r => (bgReady._resolveAll = r));

const API = window.API = {};

const msg = window.msg = /** @namespace msg */ {
  bg: window,
  /**
   * @param {?} data
   * @param {{}} [opts]
   * @param {boolean} [opts.onlyIfStyled] - only tabs that are known to contain styles
   * @param {(tab?:Tab)=>?} [opts.getData] - provides data for this tab, nullish result = skips tab
   * @return {Promise<?[]>}
   */
  async broadcast(data, {onlyIfStyled, getData} = {}) {
    const jobs = [];
    if (!getData || (data = getData())) {
      jobs.push(this.broadcastExtension(data, 'both'));
    }
    const tabs = (await browser.tabs.query({})).sort((a, b) => b.active - a.active);
    for (const tab of tabs) {
      if (!tab.discarded &&
          // including tabs with unsupported `url` as they may contain supported iframes
          (!onlyIfStyled || tabMan.getStyleIds(tab.id)) &&
          // own tabs are informed via broadcastExtension
          !(tab.pendingUrl || tab.url || '').startsWith(URLS.ownOrigin) &&
          (!getData || (data = getData(tab)))
      ) {
        jobs.push(msg.sendTab(tab.id, data));
      }
    }
    return Promise.all(jobs);
  },
  broadcastExtension(data, target = 'extension') {
    return msg._unwrap(browser.runtime.sendMessage({data, target}));
  },
};
const uuidIndex = Object.assign(new Map(), {
  custom: {},
  /** `obj` must have a unique `id`, a UUIDv4 `_id`, and Date.now() for `_rev`. */
  addCustom(obj, {get = () => obj, set}) {
    Object.defineProperty(uuidIndex.custom, obj._id, {get, set});
  },
});

/* exported addAPI */
function addAPI(methods) {
  for (const [key, val] of Object.entries(methods)) {
    const old = API[key];
    if (old && Object.prototype.toString.call(old) === '[object Object]') {
      Object.assign(old, val);
    } else {
      API[key] = val;
    }
  }
}

/* exported broadcastInjectorConfig */
const broadcastInjectorConfig = ((
  cfg,
  map = {
    exposeIframes: 'top',
    disableAll: 'off',
  },
  data = {
    method: 'injectorConfig',
    cfg,
  },
  setTop = tab => {
    data.cfg.top = tab && getUrlOrigin(tab.url);
    return data;
  },
  throttle = () => {
    data.cfg = cfg;
    msg.broadcast(data, {
      getData: cfg.top && setTop,
      onlyIfStyled: true,
    });
    cfg = null;
  }
) => (key, val) => {
  if (!cfg) { cfg = {}; setTimeout(throttle); }
  cfg[map[key] || key] = val;
})();

/* exported createCache */
/** Creates a FIFO limit-size map. */
function createCache({size = 1000, onDeleted} = {}) {
  const map = new Map();
  const buffer = Array(size);
  let index = 0;
  let lastIndex = 0;
  return {
    get(id) {
      const item = map.get(id);
      return item && item.data;
    },
    set(id, data) {
      if (map.size === size) {
        // full
        map.delete(buffer[lastIndex].id);
        if (onDeleted) {
          onDeleted(buffer[lastIndex].id, buffer[lastIndex].data);
        }
        lastIndex = (lastIndex + 1) % size;
      }
      const item = {id, data, index};
      map.set(id, item);
      buffer[index] = item;
      index = (index + 1) % size;
    },
    delete(id) {
      const item = map.get(id);
      if (!item) {
        return false;
      }
      map.delete(item.id);
      const lastItem = buffer[lastIndex];
      lastItem.index = item.index;
      buffer[item.index] = lastItem;
      lastIndex = (lastIndex + 1) % size;
      if (onDeleted) {
        onDeleted(item.id, item.data);
      }
      return true;
    },
    clear() {
      map.clear();
      index = lastIndex = 0;
    },
    has: id => map.has(id),
    *entries() {
      for (const [id, item] of map) {
        yield [id, item.data];
      }
    },
    *values() {
      for (const item of map.values()) {
        yield item.data;
      }
    },
    get size() {
      return map.size;
    },
  };
}

/* exported isVivaldi */
let isVivaldi;
/* exported detectVivaldi */
async function detectVivaldi() {
  // Note that modern Vivaldi isn't exposed in `navigator.userAgent` but it adds `extData` to tabs
  const tab = await getActiveTab() || (await browser.tabs.query({}))[0];
  return (isVivaldi = tab && !!(tab.extData || tab.vivExtData));
}

/* exported download */
/**
 * @param {String} url
 * @param {Object} params
 * @param {String} [params.method]
 * @param {String|Object} [params.body]
 * @param {'arraybuffer'|'blob'|'document'|'json'|'text'} [params.responseType]
 * @param {Number} [params.requiredStatusCode] resolved when matches, otherwise rejected
 * @param {Number} [params.timeout] ms
 * @param {Object} [params.headers] {name: value}
 * @param {string[]} [params.responseHeaders]
 * @returns {Promise}
 */
function download(url, {
  method = 'GET',
  body,
  responseType = 'text',
  requiredStatusCode = 200,
  timeout = 60e3, // connection timeout, USO is that bad
  loadTimeout = 2 * 60e3, // data transfer timeout (counted from the first remote response)
  headers,
  responseHeaders,
} = {}) {
  /* USO can't handle POST requests for style json and XHR/fetch can't handle super long URL
   * so we need to collapse all long variables and expand them in the response */
  const queryPos = url.startsWith(URLS.uso) ? url.indexOf('?') : -1;
  if (queryPos >= 0) {
    if (body === undefined) {
      method = 'POST';
      body = url.slice(queryPos);
      url = url.slice(0, queryPos);
    }
    if (headers === undefined) {
      headers = {
        'Content-type': 'application/x-www-form-urlencoded',
      };
    }
  }
  const usoVars = [];
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const u = new URL(collapseUsoVars(url), location);
    const onTimeout = () => {
      xhr.abort();
      reject(new Error('Timeout fetching ' + u.href));
    };
    let timer = setTimeout(onTimeout, timeout);
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= XMLHttpRequest.HEADERS_RECEIVED) {
        xhr.onreadystatechange = null;
        clearTimeout(timer);
        timer = loadTimeout && setTimeout(onTimeout, loadTimeout);
      }
    };
    xhr.onload = () => {
      if (xhr.status === requiredStatusCode || !requiredStatusCode || u.protocol === 'file:') {
        const response = expandUsoVars(xhr.response);
        if (responseHeaders) {
          const headers = {};
          for (const h of responseHeaders) headers[h] = xhr.getResponseHeader(h);
          resolve({headers, response});
        } else {
          resolve(response);
        }
      } else {
        reject(xhr.status);
      }
    };
    xhr.onerror = () => reject(xhr.status);
    xhr.onloadend = () => clearTimeout(timer);
    xhr.responseType = responseType;
    xhr.open(method, u.href);
    for (const [name, value] of Object.entries(headers || {})) {
      xhr.setRequestHeader(name, value);
    }
    xhr.send(body);
  });

  function collapseUsoVars(url) {
    if (queryPos < 0 ||
        url.length < 2000 ||
        !url.startsWith(URLS.usoJson) ||
        !/^get$/i.test(method)) {
      return url;
    }
    const params = new URLSearchParams(url.slice(queryPos + 1));
    for (const [k, v] of params.entries()) {
      if (v.length < 10 || v.startsWith('ik-')) continue;
      usoVars.push(v);
      params.set(k, `\x01${usoVars.length}\x02`);
    }
    return url.slice(0, queryPos + 1) + params.toString();
  }

  function expandUsoVars(response) {
    if (!usoVars.length || !response) return response;
    const isText = typeof response === 'string';
    const json = isText && tryJSONparse(response) || response;
    json.updateUrl = url;
    for (const section of json.sections || []) {
      const {code} = section;
      if (code.includes('\x01')) {
        section.code = code.replace(/\x01(\d+)\x02/g, (_, num) => usoVars[num - 1] || '');
      }
    }
    return isText ? JSON.stringify(json) : json;
  }
}
