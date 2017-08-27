'use strict';

document.body.textContent =
  chrome.i18n.getMessage('dysfunctional');
document.body.appendChild(document.createElement('div')).textContent =
  chrome.runtime.getURL('manifest.json');
// set hyphenation language
document.documentElement.setAttribute('lang', chrome.i18n.getUILanguage());
