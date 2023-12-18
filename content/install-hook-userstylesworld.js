/* global API */// msg.js
'use strict';

if (window.USW !== 1) {
  window.USW = 1; // avoiding re-injection
  let filledInfo;
  const ORIGIN = location.origin;
  const send = (type, data) => postMessage({type, data}, ORIGIN);

  const onReady = async function (data) {
    if (data) {
      send('usw-remove-stylus-button');
    }
    if (location.pathname === '/api/oauth/style/new') {
      filledInfo = true;
      const styleId = +new URLSearchParams(location.search).get('vendor_data');
      const data = await API.data.get('usw' + styleId);
      send('usw-fill-new-style', data);
    }
  };

  const HANDLERS = {
    __proto__: null,
    'usw-ready': onReady,
    async 'usw-style-info-request'(data) {
      switch (data.requestType) {
        case 'installed': {
          const updateUrl = `${ORIGIN}/api/style/${data.styleID}.user.css`;
          const style = await API.styles.find({updateUrl});
          data.installed = !!style;
          send('usw-style-info-response', data);
          break;
        }
      }
    },
  };

  if (!filledInfo) onReady();
  addEventListener('message', ({data, origin}) => {
    if (chrome.runtime.id && data && origin === ORIGIN) {
      const fn = HANDLERS[data.type];
      if (fn) fn(data);
    }
  });
}
