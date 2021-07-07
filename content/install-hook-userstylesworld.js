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
        API.styles.find({_isUswLinked: true}).then(style => {
          style.sourceCode = style.tmpSourceCode;
          sendPostMessage({type: 'usw-fill-new-style', data: style});
        });
      }
    }
  };

  window.addEventListener('message', onPageLoaded);
})();
