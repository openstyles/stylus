/* global loadScript tryJSONparse promisifyChrome */
/* exported chromeLocal chromeSync */
'use strict';

promisifyChrome({
  'storage.local': ['get', 'remove', 'set'],
  'storage.sync': ['get', 'remove', 'set'],
});

const [chromeLocal, chromeSync] = (() => {
  return [
    createWrapper('local'),
    createWrapper('sync'),
  ];

  function createWrapper(name) {
    const storage = browser.storage[name];
    const wrapper = {
      get: storage.get.bind(storage),
      set: data => storage.set(data).then(() => data),
      remove: storage.remove.bind(storage),

      /**
       * @param {String} key
       * @param {Any}    [defaultValue]
       * @returns {Promise<any>}
       */
      getValue: (key, defaultValue) =>
        wrapper.get(
          defaultValue !== undefined ?
            {[key]: defaultValue} :
            key
        ).then(data => data[key]),

      setValue: (key, value) => wrapper.set({[key]: value}),

      getLZValue: key => wrapper.getLZValues([key]).then(data => data[key]),
      getLZValues: keys =>
        Promise.all([
          wrapper.get(keys),
          loadLZStringScript(),
        ]).then(([data = {}, LZString]) => {
          for (const key of keys) {
            const value = data[key];
            data[key] = value && tryJSONparse(LZString.decompressFromUTF16(value));
          }
          return data;
        }),
      setLZValue: (key, value) =>
        loadLZStringScript().then(LZString =>
          wrapper.set({
            [key]: LZString.compressToUTF16(JSON.stringify(value)),
          })),

      loadLZStringScript,
    };
    return wrapper;
  }

  function loadLZStringScript() {
    return window.LZString ?
      Promise.resolve(window.LZString) :
      loadScript('/vendor/lz-string-unsafe/lz-string-unsafe.min.js').then(() =>
        (window.LZString = window.LZString || window.LZStringUnsafe));
  }
})();
