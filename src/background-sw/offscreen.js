import {createPortProxy} from '/js/port';
import {ownRoot} from '/js/urls';

const FILENAME = 'offscreen.html';
const DOC_URL = ownRoot + FILENAME;
export default /** @type {OffscreenAPI} */ createPortProxy(getDoc, '/' + FILENAME);

async function getDoc() {
  for (let retry; ; retry = true) {
    for (const client of await self.clients.matchAll({includeUncontrolled: true})) {
      if (client.url === DOC_URL) {
        return client;
      }
    }
    if (retry) {
      return;
    }
    try {
      await chrome.offscreen.createDocument({
        url: DOC_URL,
        reasons: ['BLOBS', 'DOM_PARSER', 'MATCH_MEDIA', 'WORKERS'],
        justification: 'ManifestV3 requirement',
      });
    } catch (err) {
      if (!err.message.startsWith('Only a single offscreen')) throw err;
    }
  }
}
