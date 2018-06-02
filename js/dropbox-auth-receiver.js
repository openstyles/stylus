'use strict';

/**
 got from the old api
 @see: https://github.com/dropbox/dropbox-sdk-js/blob/a88a138c0c3260c3537f30f94b003c1cf64f2fbd/examples/javascript/utils.js
 */
function parseQueryString(str) {
  let ret = Object.create(null);

  if (typeof str !== 'string') {
    return ret;
  }

  str = str.trim().replace(/^(\?|#|&)/, '');

  if (!str) {
    return ret;
  }

  str.split('&').forEach(function (param) {
    let parts = param.replace(/\+/g, ' ').split('=');
    // Firefox (pre 40) decodes `%3D` to `=`
    // https://github.com/sindresorhus/query-string/pull/37
    let key = parts.shift();
    let val = parts.length > 0 ? parts.join('=') : undefined;

    key = decodeURIComponent(key);

    // missing `=` should be `null`:
    // http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
    val = val === undefined ? null : decodeURIComponent(val);

    if (ret[key] === undefined) {
      ret[key] = val;
    } else if (Array.isArray(ret[key])) {
      ret[key].push(val);
    } else {
      ret[key] = [ret[key], val];
    }
  });

  return ret;
}

window.onload = () => {

  let data = {'dropbox_access_token': parseQueryString(location.hash).access_token};

  /* this was the only way that worked in keeping a value from page to page with location.href */
  /* tried localStorage, but didn't work :/ */
  if (typeof browser !== 'undefined') {
    browser.storage.local.set(data)
    .then(() => {
      window.location.href = '/manage.html';
    });
  } else if (chrome.storage) {
    chrome.storage.local.set(data, () => {
      window.location.href = '/manage.html';
    });
  }
}
