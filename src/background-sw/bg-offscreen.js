import createPort from '/js/port';

const offscreen = /** @type {OffscreenAPI} */ new Proxy({
  get exec() {
    const url = new URL('offscreen.html', location).href;
    const res = createPort(async () => {
      let client;
      for (let retry = 0; retry < 2; retry++) {
        client = (await self.clients.matchAll({includeUncontrolled: true}))
          .find(c => c.url === url);
        if (client || retry) {
          return client;
        }
        try {
          await chrome.offscreen.createDocument({
            url,
            reasons: ['BLOBS', 'DOM_PARSER', 'MATCH_MEDIA', 'WORKERS'],
            justification: 'ManifestV3 requirement',
          });
        } catch (err) {
          if (!err.message.startsWith('Only a single offscreen')) throw err;
        }
      }
    });
    Object.defineProperty(this, 'exec', {value: res});
    return res;
  },
}, {
  get: (me, cmd) => function (...args) {
    return me.exec.call(this, cmd, args);
  },
});

export default offscreen;
