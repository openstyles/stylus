'use strict';

addEventListener('message', async function onMessage(e) {
  if (e.origin === location.origin &&
      e.data &&
      e.data.name &&
      e.data.type === 'style-version-query') {
    removeEventListener('message', onMessage);
    const {API} = self.require('/js/msg');
    const style = await API.usercss.find(e.data) || {};
    const {version} = style.usercssData || {};
    postMessage({type: 'style-version', version}, '*');
  }
});
