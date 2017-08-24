'use strict';

document.body.textContent =
  chrome.i18n.getMessage('dysfunctional');
document.body.appendChild(document.createElement('div')).textContent =
  chrome.runtime.getURL('manifest.json');
