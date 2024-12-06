/**
 * This file must be loaded in a <script> tag placed after all the <link> tags
 * that contain dark themes so that the stylesheets are loaded by the time this script runs.
 * The CSS must use `@media screen and (prefers-color-scheme: dark), dark {}` that also works
 * in old browsers and ensures CSS loads before the first paint, then we toggle the media here,
 * which also happens before the first paint unless the browser "yields", but that's abnormal
 * and not even a problem in the most popular case of using system dark/light mode.
 */
import {$, $create} from './dom';
import {getCssMediaRuleByName} from './dom-util';
import {onExtension} from './msg';
import {clientData} from './prefs';
import {MF_ICON_EXT, MF_ICON_PATH} from './util-webext';
import '/css/global.css';
import '/css/global-dark.css';

export const MEDIA_ON = 'screen';
export const MEDIA_OFF = 'not all';
const MEDIA_NAME = 'dark';
const map = {[MEDIA_ON]: true, [MEDIA_OFF]: false};

(async () => {
  let isDark, favicon;
  if (window === top) ({dark: isDark, favicon} = __.MV3 ? clientData : await clientData);
  else isDark = parent.document.documentElement.dataset.uiTheme === 'dark';
  toggle(isDark, true);
  onExtension(e => {
    if (e.method === 'colorScheme') {
      isDark = e.value;
      toggle(isDark);
    }
  });
  if (favicon
  && window === top
  && location.pathname !== '/popup.html') {
    document.head.append(...[32, 16].map(size => $create('link', {
      rel: 'icon',
      href: `${MF_ICON_PATH}${isDark ? '' : 'light/'}${size}${MF_ICON_EXT}`,
      sizes: size + 'x' + size,
    })));
  }
})();

function toggle(isDark, firstRun) {
  $.root.dataset.uiTheme = isDark ? 'dark' : 'light';
  if (firstRun && !isDark) return;
  getCssMediaRuleByName(MEDIA_NAME, m => {
    if (map[m[0]] !== isDark) {
      m.mediaText = `${isDark ? MEDIA_ON : MEDIA_OFF},${MEDIA_NAME}`;
    }
  });
}
