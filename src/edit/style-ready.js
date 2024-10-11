import {loadCmTheme} from '/cm';
import {$} from '/js/dom';
import {tBody} from '/js/localization';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import * as MozDocMapper from '/js/sections-util';
import {chromeSync, LZ_KEY} from '/js/storage-util';
import {clipString, sessionStore, tryURL, UCD} from '/js/toolbox';
import editor from './editor';

let params = new URLSearchParams(location.search);
let id = +params.get('id');

export default Promise.all([
  Promise.all([
    id ? API.styles.get(id) : undefined,
    prefs.ready.then(() => loadCmTheme()),
  ]).then(loadStyle),
  id && API.data.get('editorScrollInfo' + id).then(si => {
    editor.scrollInfo = si || {};
  }),
  new Promise(tBody),
]);

async function loadStyle([
  style = {
    id: id = null, // resetting the non-existent id
    name: makeName(),
    enabled: true,
    sections: [
      MozDocMapper.toSection([...params], {code: ''}),
    ],
  },
]) {
  // switching the mode here to show the correct page ASAP, usually before DOMContentLoaded
  const isUC = Boolean(style[UCD] || !id && prefs.get('newStyleAsUsercss'));
  Object.assign(editor, /** @namespace Editor */ {
    style,
    isUsercss: isUC,
    template: isUC && !id && chromeSync.getLZValue(LZ_KEY.usercssTemplate), // promise
  });
  editor.updateClass();
  editor.updateTitle(false);
  $.rootCL.add(isUC ? 'usercss' : 'sectioned');
  sessionStore.justEditedStyleId = id || '';
  // no such style so let's clear the invalid URL parameters
  if (id === null) {
    params.delete('id');
    params = `${params}`;
    history.replaceState({}, '', location.pathname + (params ? '?' : '') + params);
  }
}

function makeName() {
  const prefix = tryURL(params.get('url-prefix'));
  const name = params.get('name') || prefix.hostname;
  const p = prefix.pathname || '/';
  return name
    ? name + (p === '/' ? '' : clipString(p.replace(/\.(html?|aspx?|cgi|php)$/, '')))
    : params.get('domain') || '?';
}
