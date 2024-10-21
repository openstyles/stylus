import {kAppUrlencoded, kContentType} from '/js/consts';
import {tryJSONparse, URLS} from '/js/toolbox';

/** @type {Record<string, {req: Promise, ports: Set<chrome.runtime.Port>}>} */
const jobs = {};
const kTimeoutFetching = 'Timeout fetching ';
/** @param {AbortController} ctl */
const callAbort = process.env.MV3 && ((ctl, url) => ctl.abort(kTimeoutFetching + url));

/** @typedef DownloadParams
 * @prop {'GET' | 'POST' | 'HEAD' | string} [method]
 * @prop {BodyInit} [body]
 * @prop {XMLHttpRequestResponseType} [responseType]
 * @prop {Number} [requiredStatusCode]
 * @prop {Number} [timeout] - ms, connection timeout
 * @prop {Number} [loadTimeout] - ms, data transfer timeout (counted from the first remote response)
 * @prop {HeadersInit} [headers]
 * @prop {string[]} responseHeaders - names of headers to return
 * @prop {string} port - messaging port's name to receive onprogress reports
 */
/**
 * @param {string} url
 * @param {DownloadParams} [params]
 * @returns {Promise}
 */
export default function download(url, params = {}) {
  const key = arguments[1] ? url + '\x00' + JSON.stringify(params) : url;
  const job = jobs[key] ||
    (jobs[key] = {req: doDownload(url, params, key)});
  if (params.port) {
    const ports = job.ports || (job.ports = new Set());
    const p = chrome.runtime.connect({name: params.port});
    p.onDisconnect.addListener(() => ports.delete(p));
    ports.add(p);
  }
  return job.req;
}


/**
 * @param {string} url
 * @param {DownloadParams} params
 * @param {string} jobKey
 */
async function doDownload(url, {
  method = 'GET',
  body,
  responseType = 'text',
  requiredStatusCode = 200,
  timeout = 60e3,
  loadTimeout = 2 * 60e3,
  headers,
  responseHeaders,
  port,
}, jobKey) {
  let abort, data, timer, usoVars;
  try {
    if (url.startsWith(URLS.uso) && url.includes('?')) {
      const i = url.indexOf('?');
      if (body == null) {
        method = 'POST';
        body = url.slice(i);
        url = url.slice(0, i);
      } else if (method === 'GET' && url.length >= 2000 && url.startsWith(URLS.usoJson)) {
        url = collapseUsoVars(usoVars = [], url, i);
      }
      headers ??= {[kContentType]: kAppUrlencoded};
    }
    /** @type {Response | XMLHttpRequest} */
    const resp = process.env.MV3
      ? await fetch(url, {
        body,
        method,
        signal: !timeout ? null : (
          abort = new AbortController(),
          timer = setTimeout(callAbort, timeout, abort, url),
          abort.signal
        ),
      })
      : await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        abort = reject;
        xhr.onerror = () => abort(xhr.status); // plain number is used in tryDownload()
        xhr.onload = () => resolve(xhr);
        xhr.onprogress = e => reportProgress(jobKey, [e.loaded, e.total]);
        xhr.onreadystatechange = () => {
          if (xhr.readyState < 2) return; // XMLHttpRequest.HEADERS_RECEIVED
          xhr.onreadystatechange = null;
          xhr.timeout = loadTimeout;
          resolve(xhr);
        };
        xhr.responseType = responseType;
        if (headers) for (const k in headers) xhr.setRequestHeader(k, headers[k]);
        if (timeout || loadTimeout) xhr.ontimeout = () => abort(new Error(kTimeoutFetching + url));
        xhr.send(body);
      });
    if (process.env.MV3) {
      if (timer) clearTimeout(timer);
      timer = loadTimeout && setTimeout(callAbort, loadTimeout, abort, url);
    }
    if (requiredStatusCode && resp.status !== requiredStatusCode && !url.startsWith('file:')) {
      throw new Error(`Bad status code ${resp.status} for ${url}`);
    }
    if (!process.env.MV3) {
      data = await new Promise((resolve, reject) => {
        abort = reject; // for xhr.onerror and xhr.ontimeout
        resp.onload = () => resolve(resp.response);
      });
    } else if (port) {
      data = await fetchWithProgress(resp, responseType, headers, jobKey);
    } else {
      data = await resp[responseType === 'arraybuffer' ? 'arrayBuffer' : responseType]();
    }
    if (data && usoVars) {
      data = expandUsoVars(usoVars, url, data);
    }
    if (responseHeaders) {
      data = {response: data, headers: extractHeaders(resp, responseHeaders)};
    }
    return data;
  } finally {
    if (process.env.MV3 && timer) clearTimeout(timer);
    jobs[jobKey].ports?.forEach(p => p.disconnect());
    delete jobs[jobKey];
  }
}

/** USO can't handle POST requests for style json and XHR/fetch can't handle super long URL,
 * so we need to collapse all long variables and expand them in the response */
function collapseUsoVars(usoVars, url, queryPos) {
  const params = new URLSearchParams(url.slice(queryPos + 1));
  for (const [k, v] of params.entries()) {
    if (v.length < 10 || v.startsWith('ik-')) continue;
    usoVars.push(v);
    params.set(k, `\x01${usoVars.length}\x02`);
  }
  return url.slice(0, queryPos + 1) + params;
}

function expandUsoVars(usoVars, url, response) {
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

/**
 * @param {Response | XMLHttpRequest} src
 * @param {string[]} headers
 */
function extractHeaders(src, headers) {
  const res = {};
  for (const h of headers) {
    res[h] = process.env.MV3
      ? src.headers.get(h)
      : src.getResponseHeader(h);
  }
  return res;
}

/**
 * @param {Response} resp
 * @param {string} responseType
 * @param {Headers} headers
 * @param {string} jobKey
 */
async function fetchWithProgress(resp, responseType, headers, jobKey) {
  const chunks = [];
  let loadedLength = 0;
  let data;
  for await (const value of resp.body) {
    chunks.push(value);
    loadedLength += value.length;
    reportProgress(jobKey, [loadedLength]);
    // TODO: report total length when https://github.com/whatwg/fetch/issues/1358 is fixed
  }
  if (chunks.length === 1) {
    data = chunks[0];
  } else {
    data = new Uint8Array(loadedLength);
    loadedLength = 0;
    for (const c of chunks) {
      data.set(c, loadedLength);
      loadedLength += c.length;
    }
  }
  if (responseType === 'blob') {
    data = new Blob([data], {type: headers.get(kContentType)});
  } else if (responseType === 'arraybuffer') {
    data = data.buffer;
  } else {
    data = new TextDecoder().decode(data);
    if (responseType === 'json') data = JSON.parse(data);
  }
  return data;
}

function reportProgress(jobKey, msg) {
  jobs[jobKey].ports?.forEach(p => p.postMessage(msg));
}
