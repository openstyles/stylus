/* global promisify */
/* exported createChromeStorageDB */
'use strict';

function createChromeStorageDB() {
  const get = promisify(chrome.storage.local.get.bind(chrome.storage.local));
  const set = promisify(chrome.storage.local.set.bind(chrome.storage.local));
  const remove = promisify(chrome.storage.local.remove.bind(chrome.storage.local));

  let INC;

  const PREFIX = 'style-';
  const METHODS = {
    // FIXME: we don't use this method at all. Should we remove this?
    get: id => get(PREFIX + id)
      .then(result => result[PREFIX + id]),
    put: obj => Promise.resolve()
      .then(() => {
        if (!obj.id) {
          return prepareInc()
            .then(() => {
              // FIXME: should we clone the object?
              obj.id = INC++;
            });
        }
      })
      .then(() => set({[PREFIX + obj.id]: obj}))
      .then(() => obj.id),
    putMany: items => prepareInc()
      .then(() => {
        for (const item of items) {
          if (!item.id) {
            item.id = INC++;
          }
        }
        return set(items.reduce((obj, curr) => {
          obj[PREFIX + curr.id] = curr;
          return obj;
        }, {}));
      })
      .then(() => items.map(i => i.id)),
    delete: id => remove(PREFIX + id),
    getAll: () => get(null)
      .then(result => {
        const output = [];
        for (const key in result) {
          if (key.startsWith(PREFIX) && Number(key.slice(PREFIX.length))) {
            output.push(result[key]);
          }
        }
        return output;
      })
  };

  return {exec};

  function exec(method, ...args) {
    if (METHODS[method]) {
      return METHODS[method](...args)
        .then(result => {
          if (method === 'putMany' && result.map) {
            return result.map(r => ({target: {result: r}}));
          }
          return {target: {result}};
        });
    }
    return Promise.reject(new Error(`unknown DB method ${method}`));
  }

  function prepareInc() {
    if (INC) return Promise.resolve();
    return get(null).then(result => {
      INC = 1;
      for (const key in result) {
        if (key.startsWith(PREFIX)) {
          const id = Number(key.slice(PREFIX.length));
          if (id >= INC) {
            INC = id + 1;
          }
        }
      }
    });
  }
}
