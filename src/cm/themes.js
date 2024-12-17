import {$create} from '@/js/dom';
import * as prefs from '@/js/prefs';

/** @type {{ [name: string]: string }} */
export const THEMES = __.THEMES;
export const THEME_KEY = 'editor.theme';
const DEFAULT = 'default';
const EL = document.head.appendChild($create('style#cm-theme'));

export function loadCmTheme(name = prefs.get(THEME_KEY)) {
  let css;
  if (name === DEFAULT) {
    css = '';
  } else if ((css = THEMES[name]) == null) {
    css = '';
    name = DEFAULT;
    prefs.set(THEME_KEY, name);
  } else if (!css) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${__.CM_PATH}${name}.css`, /*async=*/false);
    xhr.send();
    css = THEMES[name] = xhr.response;
  }
  EL.dataset.theme = name;
  EL.textContent = css;
}
