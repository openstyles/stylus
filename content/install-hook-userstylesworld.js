/* global API */// msg.js
'use strict';

(() => {
  const ORIGIN = 'https://userstyles.world';
  const HANDLERS = Object.assign(Object.create(null), {

    async 'usw-ready'() {
      send({type: 'usw-remove-stylus-button'});
      if (location.pathname === '/api/oauth/style/new') {
        const styleId = Number(new URLSearchParams(location.search).get('vendor_data'));
        const data = await API.data.pop('usw' + styleId);
        send({type: 'usw-fill-new-style', data});
      }
    },

    async 'usw-style-info-request'(data) {
      switch (data.requestType) {
        case 'installed': {
          const updateUrl = `${ORIGIN}/api/style/${data.styleID}.user.css`;
          const style = await API.styles.find({updateUrl});
          send({
            type: 'usw-style-info-response',
            data: {installed: Boolean(style), requestType: 'installed'},
          });
          break;
        }
      }
    },
  });

  window.addEventListener('message', ({data, source}) => {
    // Accepting events only from this page.
    if (data && source === window) {
      const fn = HANDLERS[data.type];
      if (fn) fn(data);
    }
  });

  function send(msg) {
    window.postMessage(msg, ORIGIN);
  }
})();
