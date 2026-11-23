import {kTabOvr, pLivePreview} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {debounce} from '@/js/util';
import editor from './editor';

/** @type {StyleObj} */
export let data;
export let enabled;
/** @type {chrome.runtime.Port} */
let port;

prefs.subscribe(pLivePreview, (key, value, init) => {
  enabled = value;
  if (init) return;
  if (value) livePreview();
  else if (port) {
    port.disconnect();
    data = port = null; // clear so a stale data is not misused by external consumers like updateDraft
  }
}, true);

/**
 * @prop {(logs: []) => any} [_then]
 * @prop {(err: Error) => any} [_catch]
 * @param {boolean | string} now - string is the code to use
 */
export default function livePreview(now) {
  if (!enabled
  || !editor.style.id // not saved
  || !editor.style.enabled && (!data || !data.enabled) && !editor.dirty.has('enabled')
    && !editor[kTabOvr]
  || !port && !editor.dirty.isDirty() // not modified since the style was saved and thus applied
  ) return;
  if (!now) {
    debounce(livePreview, prefs.__values[pLivePreview + '.delay'] * 1000, /*now=*/true);
    return;
  }
  if (!port) {
    port = chrome.runtime.connect({name: 'livePreview:' + editor.style.id});
    port.onDisconnect.addListener(() => (port = null));
  }
  data = editor.getValue(true);
  return API.styles.preview(data).then(livePreview._then, livePreview._catch);
}
