import {createPortProxy} from '/js/port';
import {ownRoot} from '/js/urls';

const FILENAME = __.PAGE_OFFSCREEN + '.html';
const DOC_URL = ownRoot + FILENAME;
/** @type {OffscreenAPI | CommandsAPI} */
const offscreen = global[__.PAGE_OFFSCREEN] = createPortProxy(getDoc, {
  lock: '/' + FILENAME,
});
export default offscreen;

async function getDoc() {
  __.DEBUGLOG('getDoc creating...');
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
  for (const client of await self.clients.matchAll({includeUncontrolled: true})) {
    if (client.url === DOC_URL) {
      __.DEBUGLOG('getDoc', client);
      return client;
    }
  }
}
