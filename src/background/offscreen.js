import {CLIENT, createPortProxy} from '@/js/port';
import {ownRoot} from '@/js/urls';
import {bgBusy} from './common';
import {getWindowClients} from './util';

const FILENAME = 'offscreen.html';
const DOC_URL = ownRoot + FILENAME;

/** @type {OffscreenAPI | CommandsAPI} */
const offscreen = createPortProxy(() => (
  creating ??= create().finally(done)
), {
  lock: '/' + FILENAME,
});
export default offscreen;

export let offscreenCache = __.MV3 && (async () => {
  bgBusy.then(() => (offscreenCache = null));
  offscreenCache = (offscreen[CLIENT] = (await findOffscreenClient())) &&
    await offscreen.getData();
  return offscreenCache;
})();
let creating;

async function findOffscreenClient() {
  for (const c of await getWindowClients())
    if (c.url === DOC_URL)
      return c;
}

async function create() {
  __.DEBUGTRACE('getDoc creating...');
  try {
    await chrome.offscreen.createDocument({
      url: DOC_URL,
      reasons: ['BLOBS', 'DOM_PARSER', 'MATCH_MEDIA', 'WORKERS'],
      justification: 'ManifestV3 requirement',
    });
  } catch (err) {
    if (!err.message.startsWith('Only a single offscreen')) throw err;
  }
  __.DEBUGLOG('getDoc created');
  return findOffscreenClient();
}

function done() {
  creating = null;
  __.DEBUGLOG('getDoc done');
}
