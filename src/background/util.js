import {CLIENT, createPortProxy} from '@/js/port';
import {workerPath} from '@/js/urls';
import {clientDataJobs} from './common';
import offscreen from './offscreen';

/** @return {WindowClient[]} */
export const getWindowClients = () => self.clients.matchAll({
  includeUncontrolled: true,
  type: 'window',
});

const getWorkerPortFromClient = async () => {
  let proxy;
  __.DEBUGPORT('sw -> worker -> offscreen client', offscreen[CLIENT]);
  if (!offscreen[CLIENT]) {
    for (const client of await getWindowClients()) {
      if (!clientDataJobs.has(client.url)) {
        __.DEBUGPORT('sw -> worker -> client', client);
        proxy = createPortProxy(client, {once: true});
        break;
      }
    }
  }
  return (proxy || offscreen).getWorkerPort(workerPath);
};

/** @type {WorkerAPI} */
export const worker = __.MV3
  ? createPortProxy(getWorkerPortFromClient, {lock: workerPath})
  : createPortProxy(workerPath);

const rxHOST = /^('non(e|ce-.+?)'|(https?:\/\/)?[^']+?[^:'])$/; // strips CSP sources covered by *
const rxHtmlEntity = /&(#x?)?([^;]+);/g;
const rxQuoteSpace = / '\s+([-+/=\w]+')/g;
const rxMetaCSP = /<meta\s+[^<>]*http-equiv\s*=\s*(["']?)Content-Security-Policy\1[^<>]*>/i;
const rxMetaCSPVal = /(\scontent\s*=)(?:'([^']+)'|"([^"]+)"|([^<>\s]+))/i;
const patchCspMetaTagValReplacer = (_, key, q1, q2, q0) => key + '"' +
  patchCsp((q1 || q2 || q0).replace(rxHtmlEntity, patchHtmlEntities).replace(rxQuoteSpace, " '$1"))
    .replace(/"/g, '&#34;') + '"';
const patchCspMetaTagReplacer = str => str.replace(rxMetaCSPVal, patchCspMetaTagValReplacer);
const patchHtmlEntities = (_, hash, s) => hash
  ? String.fromCharCode(parseInt(s, hash === '#x' ? 16 : 10))
  : htmlEntities[s] || s;
const htmlEntities = {
  'amp': '&',
  'quot': '"',
  'apos': '\'',
  'lt': '<',
  'gt': '>',
};

export const patchCsp = str => {
  const src = {};
  for (let p of str.split(/[;,]/)) {
    p = p.trim().split(/\s+/);
    src[p[0]] = p.slice(1);
  }
  // Allow style assets
  patchCspSrc(src, 'img-src', 'data:', '*');
  patchCspSrc(src, 'font-src', 'data:', '*');
  // Allow our DOM styles, allow @import from any URL
  patchCspSrc(src, 'style-src', '\'unsafe-inline\'', '*');
  // Allow our XHR cookies in CSP sandbox (known case: raw github urls)
  if (src.sandbox && !src.sandbox.includes('allow-same-origin')) {
    src.sandbox.push('allow-same-origin');
  }
  return Object.entries(src).map(([k, v]) =>
    `${k}${v.length ? ' ' : ''}${v.join(' ')}`).join('; ');
};

const patchCspSrc = (src, name, ...values) => {
  let def = src['default-src'];
  let list = src[name];
  if (def || list) {
    if (!def) def = [];
    if (!list) list = [...def];
    if (values.includes('*')) list = src[name] = list.filter(v => !rxHOST.test(v));
    list.push(...values.filter(v => !list.includes(v)));
    if (!list.length) delete src[name];
  }
};

export const patchCspMetaTag = reqId => {
  const filter = browser.webRequest.filterResponseData(reqId);
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  let chunks = [];
  let text = '';
  filter.ondata = ({data}) => {
    if (chunks) {
      chunks.push(data);
      text += decoder.decode(data, {stream: true});
      if (/<body\W/i.test(text)) {
        if (text !== (text = text.replace(rxMetaCSP, patchCspMetaTagReplacer)))
          chunks = [encoder.encode(text + decoder.decode())];
        chunks.forEach(filter.write, filter);
        chunks = text = null;
      }
    } else {
      filter.write(data);
    }
  };
  filter.onstop = () => {
    chunks?.forEach(filter.write, filter);
    filter.close();
  };
};
