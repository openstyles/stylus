/* global $ */// dom.js
/* global API msg */// msg.js
'use strict';

/**
 * This file must be loaded in a <script> tag placed after all the <link> tags
 * that contain dark themes so that the stylesheets are loaded by the time this script runs.
 * The CSS must use `@media screen and (prefers-color-scheme: dark), dark {}` that also works
 * in old browsers and ensures CSS loads before the first paint, then we toggle the media here,
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
    $.root.dataset.uiTheme = isDark ? 'dark' : 'light';
    for (const sheet of document.styleSheets) {
      for (const {media: m} of sheet.cssRules) {
        if (m && m[1] === 'dark' && (m[0] === 'screen') !== isDark) {
          m.mediaText = isDark ? 'screen,dark' : 'not all,dark';
        }
      }
    }
  }
});
