import {loadCmTheme} from '@/cm';
import {urlParams} from '@/js/dom';
import {swController} from '@/js/msg-init';
import * as prefs from '@/js/prefs';
import {FROM_CSS} from '@/js/sections-util';
import {clipString, sessionStore, tryURL} from '@/js/util';
import editor from './editor';

if (location.hash) { // redirected from devtools -> "open in a new tab"
  history.replaceState(history.state, '', location.href.split('#')[0]);
}

let id = +urlParams.get('id');

export const loading = __.MV3 && swController
  ? loadStyle(prefs.clientData)
  : prefs.clientData.then(loadStyle);

export const loadingLazy = import(/* webpackChunkName: "edit-lazy" */'./load-lazy-ui');

/** @param {StylusClientData} clientData */
function loadStyle({style, theme, themeText, ...props}) {
  Object.assign(editor, props);
  Object.assign(editor.style, style || makeNewStyleObj());
  editor.updateClass();
  editor.updateTitle(false);
  sessionStore.justEditedStyleId = id || '';
  // no such style so let's clear the invalid URL parameters
  if (id === null) {
    urlParams.delete('id');
    const str = `${urlParams}`;
    history.replaceState({}, '', location.pathname + (str ? '?' : '') + str);
  }
  loadCmTheme(theme, themeText);
}

function makeNewStyleObj() {
  id = null; // resetting the non-existent id
  const prefix = tryURL(urlParams.get('url-prefix'));
  const name = urlParams.get('name') || prefix.hostname;
  const p = prefix.pathname || '/';
  let section;
  for (let [k, v] of urlParams)
    if ((k = FROM_CSS[k]))
      (section ??= {})[k] = [v];
  section ??= {domains: ['example.com']}; // help the new users discover the targeting mechanism
  section.code = '';
  return {
    id,
    enabled: true,
    name: name
      ? name + (p === '/' ? '' : clipString(p.replace(/\.(html?|aspx?|cgi|php)$/, '')))
      : urlParams.get('domain') || '?',
    sections: [section],
  };
}
