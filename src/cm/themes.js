import {pEditorTheme} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {fetchText} from '@/js/util';

/** @type {{ [name: string]: string }} */
export const THEMES = __.THEMES;
export const THEME_KEY = pEditorTheme;
const DEFAULT = prefs.__defaults[THEME_KEY];
let EL;

export async function loadCmTheme(name = prefs.__values[THEME_KEY], text) {
  let css;
  if (name === DEFAULT) {
    css = '';
  } else if ((css = THEMES[name]) == null) {
    css = '';
    name = DEFAULT;
    prefs.set(THEME_KEY, name);
  } else if (!css) {
    css = THEMES[name] = text || await fetchText(`${__.CM_PATH}${name}.css`);
    if (!EL) {
      EL = $tag('style');
      EL.id = 'cm-theme';
      document.head.appendChild(EL);
    }
  }
  if (EL) EL.textContent = css;
}
