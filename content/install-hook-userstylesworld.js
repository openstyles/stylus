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
    }
  };

  window.addEventListener('message', onPageLoaded);
})();
