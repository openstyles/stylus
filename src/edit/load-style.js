import {loadCmTheme} from '@/cm';
import * as prefs from '@/js/prefs';
import {FROM_CSS} from '@/js/sections-util';
import {clipString, sessionStore, tryURL} from '@/js/util';
import editor from './editor';

if (location.hash) { // redirected from devtools -> "open in a new tab"
  history.replaceState(history.state, '', location.href.split('#')[0]);
}

const params = new URLSearchParams(location.search);
let id = +params.get('id');

export default __.MV3
  ? loadStyle(prefs.clientData)
  : prefs.clientData.then(loadStyle);

function loadStyle({style = makeNewStyleObj(), isUC, si, template}) {
  Object.assign(editor, /** @namespace Editor */ {
    style,
    template,
    isUsercss: isUC,
    scrollInfo: si || {},
  });
  editor.updateClass();
  editor.updateTitle(false);
  $rootCL.add(isUC ? 'usercss' : 'sectioned');
  sessionStore.justEditedStyleId = id || '';
  // no such style so let's clear the invalid URL parameters
  if (id === null) {
    params.delete('id');
    const str = `${params}`;
    history.replaceState({}, '', location.pathname + (str ? '?' : '') + str);
  }
  return loadCmTheme();
}

function makeNewStyleObj() {
  id = null; // resetting the non-existent id
  const prefix = tryURL(params.get('url-prefix'));
  const name = params.get('name') || prefix.hostname;
  const p = prefix.pathname || '/';
  const section = {code: ''};
  for (let [k, v] of params) if ((k = FROM_CSS[k])) section[k] = [v];
  return {
    id,
    enabled: true,
    name: name
      ? name + (p === '/' ? '' : clipString(p.replace(/\.(html?|aspx?|cgi|php)$/, '')))
      : params.get('domain') || '?',
    sections: [section],
  };
}
