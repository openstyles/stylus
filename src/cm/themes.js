import * as prefs from '@/js/prefs';
import {FIREFOX} from '@/js/ua';

/** @type {{ [name: string]: string }} */
export const THEMES = __.THEMES;
export const THEME_KEY = 'editor.theme';
const DEFAULT = 'default';
let EL;

export async function loadCmTheme(name = prefs.__values[THEME_KEY]) {
  let css;
  if (name === DEFAULT) {
    css = '';
  } else if ((css = THEMES[name]) == null) {
    css = '';
    name = DEFAULT;
    prefs.set(THEME_KEY, name);
  } else if (!css) {
    css = `${__.CM_PATH}${name}.css`;
    if (!EL) {
      if (__.BUILD !== 'chrome' && FIREFOX) {
        EL = $tag('link');
        EL.rel = 'stylesheet';
      } else {
        EL = $tag('style');
      }
      EL.id = 'cm-theme';
      document.head.appendChild(EL);
    }
    // Firefox delays visual updates so we can fetch the theme asynchronously
    if (__.BUILD !== 'chrome' && FIREFOX) {
      EL.href = css;
      await new Promise(resolve => (EL.onload = resolve));
      css = '';
    } else {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', css, /*async=*/false);
      xhr.send();
      css = THEMES[name] = xhr.response;
    }
  }
  if (EL) EL.textContent = css;
}
