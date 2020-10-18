'use strict';

// eslint-disable-next-line no-unused-expressions
self.INJECTED !== 1 &&
!(document instanceof XMLDocument && !chrome.app) && // this is STYLE_VIA_API
new RegExp(`(^|\\s|;)${chrome.runtime.id}=\\s*([-\\w]+)\\s*(;|$)`).test(document.cookie) &&
(() => {
  const url = 'blob:' + chrome.runtime.getURL(RegExp.$2);
  const xhr = new XMLHttpRequest();
  document.cookie = `${chrome.runtime.id}=1; max-age=0`;
  try {
    xhr.open('GET', url, false); // synchronous
    xhr.send();
    // guarding against an implicit global variable for a DOM element with id="STYLES"
    window.STYLES = [JSON.parse(xhr.response)];
    URL.revokeObjectURL(url);
  } catch (e) {}
})();
