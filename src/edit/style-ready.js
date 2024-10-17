import {loadCmTheme} from '/cm';
import {$} from '/js/dom';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import * as MozDocMapper from '/js/sections-util';
import {clipString, sessionStore, tryURL, UCD} from '/js/toolbox';
import editor from './editor';

if (process.env.MV3 && /#\d+$/.test(location.hash)) {
  history.replaceState(history.state, '',
    `${location.href.split('#')[0]}?id=${location.hash.slice(1)}`);
}

const params = new URLSearchParams(location.search);
let id = +params.get('id');

export default process.env.MV3 ? [
  loadStyle(global.clientData),
  loadCmTheme(),
] : Promise.all([
  API.styles.getEditClientData(id).then(loadStyle),
  prefs.ready.then(() => loadCmTheme()),
]);

function loadStyle({si, style = makeNewStyleObj(), template}) {
  // switching the mode here to show the correct page ASAP, usually before DOMContentLoaded
  const isUC = !!(style[UCD] || !id && template);
  Object.assign(editor, /** @namespace Editor */ {
    style,
    template,
    isUsercss: isUC,
    scrollInfo: si || {},
  });
  editor.updateClass();
  editor.updateTitle(false);
  $.rootCL.add(isUC ? 'usercss' : 'sectioned');
  sessionStore.justEditedStyleId = id || '';
  // no such style so let's clear the invalid URL parameters
  if (id === null) {
    params.delete('id');
    const str = `${params}`;
    history.replaceState({}, '', location.pathname + (str ? '?' : '') + str);
  }
}

function makeNewStyleObj() {
  id = null; // resetting the non-existent id
  const prefix = tryURL(params.get('url-prefix'));
  const name = params.get('name') || prefix.hostname;
  const p = prefix.pathname || '/';
  return {
    id,
    enabled: true,
    name: name
      ? name + (p === '/' ? '' : clipString(p.replace(/\.(html?|aspx?|cgi|php)$/, '')))
      : params.get('domain') || '?',
    sections: [
      MozDocMapper.toSection([...params], {code: ''}),
    ],
  };
}
