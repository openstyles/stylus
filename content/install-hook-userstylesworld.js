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
    && allowedOrigin === event.origin
    ) {
      switch (event.data.type) {
        case 'usw-ready': {
          sendPostMessage({type: 'usw-remove-stylus-button'});

          if (location.pathname === '/api/oauth/style/new') {
            const styleId = Number(new URLSearchParams(location.search).get('vendor_data'));
            API.data.pop('usw' + styleId).then(data => {
              sendPostMessage({type: 'usw-fill-new-style', data});
            });
          }
          break;
        }
        case 'usw-style-info-request': {
          switch (event.data.requestType) {
            case 'installed': {
              API.styles.find({updateUrl: `https://userstyles.world/api/style/${event.data.styleID}.user.css`})
                .then(style => {
                  sendPostMessage({
                    type: 'usw-style-info-response',
                    data: {installed: Boolean(style), requestType: 'installed'},
                  });
                });
              break;
            }
          }
          break;
        }
      }
    }
  };

  window.addEventListener('message', onPageLoaded);
})();
