import {pLivePreview} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {debounce} from '@/js/util';
import editor from './editor';

let data;
let port;
let enabled;

prefs.subscribe(pLivePreview, (key, value, init) => {
  enabled = value;
  if (init) return;
  if (value) livePreview();
  else port &&= port.disconnect();
}, true);

/**
 * @prop {(logs: []) => any} [_then]
 * @prop {(err: Error) => any} [_catch]
 * @param {boolean | string} now - string is the code to use
 */
export default function livePreview(now) {
  if (!enabled
  || !editor.style.id // not saved
  || !editor.style.enabled && (!data || !data.enabled) // disabled both before and now
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
  data = editor.getValue(now);
  return API.styles.preview(data).then(livePreview._then, livePreview._catch);
}
