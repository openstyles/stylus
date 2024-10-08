import {tryJSONparse, URLS} from '/js/toolbox';

const downloadRequests = {};

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
 * @param {string} [params.port] messaging port's name to receive onprogress reports
 * @returns {Promise}
 */
export default function download(url, {
  method = 'GET',
  body,
  responseType = 'text',
  requiredStatusCode = 200,
  timeout = 60e3, // connection timeout, USO is that bad
  loadTimeout = 2 * 60e3, // data transfer timeout (counted from the first remote response)
  headers,
  responseHeaders,
  port,
} = {}) {
  let xhr;
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
  const reqKey = arguments[1] ? JSON.stringify(arguments) : url;
  const req = downloadRequests[reqKey]
  || (downloadRequests[reqKey] = new Promise((resolve, reject) => {
    xhr = new XMLHttpRequest();
    const u = new URL(collapseUsoVars(usoVars, url, method, queryPos), location);
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
        const response = expandUsoVars(usoVars, url, xhr.response);
        if (responseHeaders) {
          responseHeaders = responseHeaders.reduce((res, h) => {
            res[h] = xhr.getResponseHeader(h);
            return res;
          }, {});
          resolve({response, headers: responseHeaders});
        } else {
          resolve(response);
        }
      } else {
        reject(xhr.status);
      }
    };
    xhr.onerror = () => reject(xhr.status);
    xhr.onloadend = () => {
      clearTimeout(timer);
      delete downloadRequests[reqKey];
    };
    xhr.responseType = responseType;
    xhr.open(method, u.href);
    for (const [name, value] of Object.entries(headers || {})) {
      xhr.setRequestHeader(name, value);
    }
    xhr.send(body);
  }));
  if (xhr) req.xhr = xhr;
  if (port) {
    const ports = req.ports || initPorts(req.xhr, new Set());
    const p = chrome.runtime.connect({name: port});
    p.onDisconnect.addListener(() => ports.delete(p));
    ports.add(p);
  }
  return req;
}

function collapseUsoVars(usoVars, url, method, queryPos) {
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

function expandUsoVars(usoVars, url, response) {
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

function initPorts(xhr, ports) {
  xhr.onprogress = e => ports.forEach(p => p.postMessage([e.loaded, e.total]));
  xhr.addEventListener('loadend', () => ports.forEach(p => p.disconnect()));
  return ports;
}
