import {createPortProxy} from '@/js/port';
import {ownRoot} from '@/js/urls';
import {getWindowClients} from './common';

let creating;

export const getOffscreenClient = () => (creating ??= create());
const FILENAME = __.PAGE_OFFSCREEN + '.html';
const DOC_URL = ownRoot + FILENAME;
/** @type {OffscreenAPI | CommandsAPI} */
const offscreen = createPortProxy(getOffscreenClient, {
  lock: '/' + FILENAME,
});
export default offscreen;

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
  const clients = await getWindowClients();
  const client = clients.find(c => c.url === DOC_URL);
  creating = null;
  __.DEBUGLOG('getDoc', client);
  return client;
}
