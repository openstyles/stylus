/* global API */// msg.js
'use strict';

(() => {
  const allowedOrigin = 'https://userstyles.world';

  const sendPostMessage = message => {
    if (allowedOrigin === location.origin) {
      window.postMessage(message, location.origin);
    }
  };

  const onPageLoaded = event => {
    if (event.data
    && event.data.type === 'usw-ready'
    && allowedOrigin === event.origin
    ) {
      sendPostMessage({type: 'usw-remove-stylus-button'});

      if (location.pathname === '/api/oauth/style/new') {
        // Gets the search query string, and get the vendor_data from it.
        // Which is the id of the style that shall be linked with.
        const vendorData = window.location.search.split('&')
          .find(query => query.startsWith('vendor_data'))
          .split('=')[1];
        API.styles.get(Number(vendorData)).then(style => {
          style.sourceCode = style.tmpSourceCode;
          sendPostMessage({type: 'usw-fill-new-style', data: style});
        });
      }
    }
  };

  window.addEventListener('message', onPageLoaded);
})();
