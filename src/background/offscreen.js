import {createPortProxy} from '@/js/port';
import {ownRoot} from '@/js/urls';
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
