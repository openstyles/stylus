/**
 * This file must be loaded in a <script> tag placed after all the <link> tags
 * that contain dark themes so that the stylesheets are loaded by the time this script runs.
 * The CSS must use `@media screen and (prefers-color-scheme: dark), dark {}` that also works
 * in old browsers and ensures CSS loads before the first paint, then we toggle the media here,
 * which also happens before the first paint unless the browser "yields", but that's abnormal
 * and not even a problem in the most popular case of using system dark/light mode.
 */
import {$, $create} from '/js/dom';
import * as msg from '/js/msg';
import {API} from '/js/msg';

(async () => {
  let isDark, isVivaldi;
  if (window === top) ({isDark, isVivaldi} = await API.info.get());
  else isDark = parent.document.documentElement.dataset.uiTheme === 'dark';
  const ON = 'screen';
  const OFF = 'not all';
  const map = {[ON]: true, [OFF]: false};
  toggleDarkStyles();
  msg.onExtension(e => {
    if (e.method === 'colorScheme') {
      isDark = e.value;
      toggleDarkStyles();
    }
  });
  // Add favicon in FF and Vivaldi
  if (window === top
  && (FIREFOX || isVivaldi)
  && location.pathname !== '/popup.html') {
    document.head.append(...[32, 16].map(size => $create('link', {
      rel: 'icon',
      href: `/images/icon/${isDark ? '' : 'light/'}${size}.png`,
      sizes: size + 'x' + size,
    })));
  }
  function toggleDarkStyles() {
    $.root.dataset.uiTheme = isDark ? 'dark' : 'light';
    for (const sheet of document.styleSheets) {
      for (const {media: m} of sheet.cssRules) {
        if (m && m[1] === 'dark' && map[m[0]] !== isDark) {
          m.mediaText = `${isDark ? ON : OFF},dark`;
        }
      }
    }
  }
})();
