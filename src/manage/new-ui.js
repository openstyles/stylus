import {$, getCssMediaRuleByName} from '/js/dom';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import {MEDIA_OFF, MEDIA_ON} from '/js/themer';

export const cfg = {
  enabled: null, // the global option should come first
  favicons: null,
  faviconsGray: null,
  targets: null,
};
export const ids = Object.keys(cfg);
export const badFavsKey = 'badFavs';
export const hasFavs = () => cfg.enabled && cfg.favicons;
export const prefKeyForId = id => `manage.newUI.${id}`.replace(/\.enabled$/, '');
const MEDIA_NAME = 'newui'; // must be lowercase
let media;

export function readPrefs(dest = cfg, cb) {
  for (const id of ids) {
    const val = dest[id] = prefs.get(prefKeyForId(id));
    if (cb) cb(id, val);
  }
}

export function renderClass() {
  const on = !!cfg.enabled;
  if (!media) getCssMediaRuleByName(MEDIA_NAME, m => !(media = m));
  $.rootCL.toggle('newUI', on);
  $.rootCL.toggle('oldUI', !on);
  if (on !== (media[0] === MEDIA_ON)) {
    media.mediaText = `${on ? MEDIA_ON : MEDIA_OFF},${MEDIA_NAME}`;
  }
}

export async function readBadFavs() {
  const key = badFavsKey;
  const val = await API.prefsDb.get(key);
  return (cfg[key] = Array.isArray(val) ? val : []);
}
