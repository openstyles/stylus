export default function createPort(getTarget) {
  /** @type {Map<number, PromiseWithResolvers & {err: Error}>} */
  let queue;
  /** @type {MessagePort} */
  let port;
  /** @type {chrome.runtime.Port} */
  let chromePort;
  let lastId;
  return async function exec(...args) {
    if ((port || (port = init())).then) await port;
    const pr = Promise.withResolvers();
    pr.err = new Error();
    queue.set(++lastId, pr);
    port.postMessage({args, id: lastId}, Array.isArray(this) ? this : []);
    return pr.promise;
  };
  async function init() {
    const target = await getTarget();
    const mc = new MessageChannel();
    const pr = Promise.withResolvers();
    const portName = 'port' + Math.random();
    chrome.runtime.onConnect.addListener(function _(p) {
      if (p.name !== portName) return;
      (chromePort = p).onDisconnect.addListener(onClosed);
      chrome.runtime.onConnect.removeListener(_);
    });
    target.postMessage(['port', portName], [mc.port2]);
    mc.port1.onmessage = onMessage;
    pr.err = new Error();
    queue = new Map([[lastId = 0, pr]]);
    await pr.promise;
    port = mc.port1;
  }
  /** @param {MessageEvent} _ */
  function onMessage({data: {id, str, res, err}}) {
    const v = queue.get(id);
    queue.delete(id);
    if (id === lastId) --lastId;
    if (!err) v.resolve(str ? JSON.parse(str) : res);
    else {
      if (v.err) err.stack += '\n' + v.err.stack;
      v.reject(err);
    }
  }
  function onClosed() {
    chromePort.onDisconnect.removeListener(onClosed);
    for (const v of queue.values()) {
      const err = new Error('Target disconnected');
      err.stack = v.err.stack;
      v.reject(err);
    }
    port = chromePort = queue = null;
  }
}
