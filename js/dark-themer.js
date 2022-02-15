/* global API msg */// msg.js
'use strict';

/**
 * This file must be loaded in a <script> tag placed after all the <link> tags
 * that contain dark themes so that the stylesheets are loaded synchronously
 * by the time this script runs. The CSS must use `@media (prefers-color-scheme: dark) {}`
 * to ensure the rules are loaded before the first paint, then we toggle the rule here,
 * which also happens before the first paint unless the browser "yields", but that's abnormal
 * and not even a problem in the most popular case of using system dark/light mode.
 */

API.colorScheme.shouldIncludeStyle('darkUI').then(val => {
  let isDark = val;
  toggleDarkStyles();
  msg.onExtension(e => {
    if (e.method === 'colorScheme') {
      isDark = e.value;
      toggleDarkStyles();
    }
  });
  function toggleDarkStyles() {
    for (const sheet of document.styleSheets) {
      for (const {media: m} of sheet.cssRules) {
        if (m && /dark/.test(m) && (m[0] === 'screen') !== isDark) {
          m.mediaText = isDark ? 'screen,dark' : 'dark';
        }
      }
    }
  }
});
