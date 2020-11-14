/* global chromeLocal */
/* exported createChromeStorageDB */
'use strict';

function createChromeStorageDB() {
  let INC;

  const PREFIX = 'style-';
  const METHODS = {
    // FIXME: we don't use this method at all. Should we remove this?
    get: id => chromeLocal.getValue(PREFIX + id),
    put: obj =>
      // FIXME: should we clone the object?
      Promise.resolve(!obj.id && prepareInc().then(() => Object.assign(obj, {id: INC++})))
        .then(() => chromeLocal.setValue(PREFIX + obj.id, obj))
        .then(() => obj.id),
    putMany: items => prepareInc()
      .then(() =>
        chromeLocal.set(items.reduce((data, item) => {
          if (!item.id) item.id = INC++;
          data[PREFIX + item.id] = item;
          return data;
        }, {})))
      .then(() => items.map(i => i.id)),
    delete: id => chromeLocal.remove(PREFIX + id),
    getAll: () => chromeLocal.get()
      .then(result => {
        const output = [];
        for (const key in result) {
          if (key.startsWith(PREFIX) && Number(key.slice(PREFIX.length))) {
            output.push(result[key]);
          }
        }
        return output;
      }),
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
    return chromeLocal.get().then(result => {
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
