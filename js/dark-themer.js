/* global API msg */// msg.js
'use strict';

/**
 * This file must be loaded in a <script> tag placed after all the <link> tags
 * that contain dark themes so that the stylesheets are loaded synchronously
 * by the time this script runs. The CSS must use `@media not screen, dark {}`
 * to ensure the rules are loaded before the first paint in inactive state,
 * then we activate it here.
 */

API.colorScheme.shouldIncludeStyle({preferScheme: 'dark!'}).then(val => {
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
        if (m && m[1] === 'dark' && (m[0] === 'screen') !== isDark) {
          m.mediaText = `${isDark ? '' : 'not '}screen, dark`;
        }
      }
    }
  }
});
