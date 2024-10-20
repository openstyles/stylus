export const PORT_TIMEOUT = 5 * 60e3; // TODO: expose as a configurable option
const ERROR_PROPS_TO_CLONE = [
  'name',
  'stack',
  'message',
  'lineNumber',
  'columnNumber',
  'fileName',
];
const ret0 = () => 0;
let timer;
let lockingSelf;

export function createPortProxy(getTarget, lockName) {
  let exec;
  const init = (...args) => (exec ??= createPortExec(getTarget, lockName))(...args);
  return new Proxy({}, {
    get: (_, cmd) => (exec || init)?.bind(null, cmd),
  });
}

export function createPortExec(getTarget, lockName) {
  /** @type {Map<number, PromiseWithResolvers & {stack: string}>} */
  let queue;
  /** @type {MessagePort} */
  let port;
  let lockRequested;
  let lastId = 0;
  return async function exec(...args) {
    // Saving the call stack prior to a possible async jump for easier debugging
    const p = Promise.withResolvers();
    p.stack = new Error();
    if ((port ??= initPort()).then) port = await port;
    queue.set(++lastId, p);
    port.postMessage({args, id: lastId},
      Array.isArray(this) ? this : undefined); // transferables
    return p.promise;
  };
  async function initPort() {
    let target;
    if (typeof getTarget === 'string') {
      lockName = getTarget;
      target = new SharedWorker(getTarget);
      target.onerror = console.error;
      target = target.port;
    } else {
      target = getTarget();
    }
    if (target.then) target = await target;
    if (target instanceof MessagePort) {
      port = target;
    } else {
      const mc = new MessageChannel();
      port = mc.port1;
      target.postMessage(['port', lockName], [mc.port2]);
    }
    port.onmessage = onMessage;
    queue = new Map();
    lastId = 0;
    return port;
  }
  /** @param {MessageEvent} _ */
  function onMessage({data: {id, str, res, err}}) {
    if (!lockRequested) trackTarget(queue);
    const v = queue.get(id);
    queue.delete(id);
    if (id === lastId) --lastId;
    if (!err) {
      v.resolve(str ? JSON.parse(str) : res);
    } else {
      if (v.stack) err.stack += '\n' + v.stack;
      v.reject(err);
    }
  }
  async function trackTarget(queueCopy) {
    lockRequested = true;
    await navigator.locks.request(lockName, ret0);
    for (const v of queueCopy.values()) {
      const err = new Error('Target disconnected');
      err.stack = v.stack;
      v.reject(err);
    }
    if (queue === queueCopy) {
      port = queue = null;
    }
  }
}

/**
 * @param {MessageEvent} evt
 * @param {Function | {}} exec
 * @param {boolean} [autoClose]
 */
export function initRemotePort(evt, exec, autoClose) {
  let numJobs = 0;
  const port = evt.ports[0];
  if (!lockingSelf) {
    lockingSelf = true;
    navigator.locks.request(location.pathname, () => new Promise(ret0));
  }
  port.onerror = console.error;
  port.onmessage = async portEvent => {
    const {args, id} = portEvent.data;
    let res, err;
    numJobs++;
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    try {
      const fn = typeof exec === 'function' ? exec : exec[args.shift()];
      res = fn.apply(portEvent, args);
      if (res instanceof Promise) res = await res;
    } catch (e) {
      res = undefined; // clearing a rejected Promise
      err = {};
      for (const p of ERROR_PROPS_TO_CLONE) err[p] = e[p];
      Object.assign(err, e);
    }
    port.postMessage({id, res, err}, (/**@type{RemotePortEvent}*/portEvent)._transfer);
    if (!--numJobs && autoClose) closeAfterDelay();
  };
}

export function closeAfterDelay() {
  if (!timer) timer = setTimeout(close, PORT_TIMEOUT);
}
