export const COMMANDS = process.env.ENTRY !== 'sw' && (
  process.env.ENTRY === 'worker' || !process.env.MV3 ? {
    __proto__: null,
  } : /** @namespace CommandsAPI */ {
    __proto__: null,
    /** @this {RemotePortEvent} */
    getWorkerPort(url) {
      const p = new SharedWorker(url).port;
      this._transfer = [p];
      return p;
    },
    setPortTimeout(val) {
      portTimeout = val ?? PORT_TIMEOUT;
      if (timer) {
        clearTimeout(timer);
        timer = portTimeout > 0 && setTimeout(close, portTimeout);
      }
    },
  }
);
const PORT_TIMEOUT = 5 * 60e3; // TODO: expose as a configurable option?
const autoClose = process.env.ENTRY === 'worker' ||
  process.env.ENTRY === true && location.pathname === `/${process.env.PAGE_OFFSCREEN}.html`;
const NOP = () => {};
const navSW = navigator.serviceWorker;
if (process.env.MV3 && process.env.ENTRY === true) {
  navSW.onmessage = initRemotePort.bind(COMMANDS);
}
let lockingSelf;
let portTimeout = PORT_TIMEOUT;
let timer;

export function createPortProxy(getTarget, opts) {
  let exec;
  const init = (...args) => (exec ??= createPortExec(getTarget, opts))(...args);
  return new Proxy({}, {
    get: (_, cmd) => function (...args) {
      return (exec || init).call(this, cmd, ...args);
    },
  });
}

export function createPortExec(getTarget, {lock, once} = {}) {
  let queue;
  /** @type {MessagePort} */
  let port;
  /** @type {MessagePort | Client | SharedWorker} */
  let target;
  let lockRequested;
  let lastId = 0;
  return async function exec(...args) {
    const ctx = [new Error().stack]; // saving it prior to a possible async jump for easier debugging
    const promise = new Promise((resolve, reject) => ctx.push(resolve, reject));
    if ((port ??= initPort(args)).then) port = await port;
    process.env.DEBUG(location.pathname, 'exec send', ...args);
    (once ? target : port).postMessage({args, id: ++lastId},
      once || (Array.isArray(this) ? this : undefined));
    queue.set(lastId, ctx);
    return promise;
  };
  async function initPort() {
    process.env.DEBUG(location.pathname, 'exec init', getTarget);
    if (typeof getTarget === 'string') {
      lock = getTarget;
      target = new SharedWorker(getTarget);
      target.onerror = console.error;
      target = target.port;
    } else {
      target = typeof getTarget === 'function' ? getTarget() : getTarget;
      if (target.then) target = await target;
    }
    if (target instanceof MessagePort) {
      port = target;
    } else {
      const mc = new MessageChannel();
      port = mc.port1;
      if (once) once = [mc.port2];
      else target.postMessage({lock}, [mc.port2]);
    }
    port.onmessage = onMessage;
    port.onmessageerror = onMessageError;
    queue = new Map();
    lastId = 0;
    return port;
  }
  /** @param {MessageEvent} _ */
  function onMessage({data}) {
    process.env.DEBUG(location.pathname, 'exec onmessage', data);
    if (!lockRequested && !once) trackTarget(queue);
    const {id, res, err} = data.id ? data : JSON.parse(data);
    const [stack, resolve, reject] = queue.get(id);
    queue.delete(id);
    if (id === lastId) --lastId;
    if (!err) {
      resolve(res);
    } else {
      err.stack += '\n' + stack;
      reject(err);
    }
    if (once) {
      port.close();
      queue = port = target = null;
    }
  }
  async function trackTarget(queueCopy) {
    lockRequested = true;
    await navigator.locks.request(lock, NOP);
    for (const [stack, /*resolve*/, reject] of queueCopy.values()) {
      const err = new Error('Target disconnected');
      err.stack = stack;
      reject(err);
    }
    if (queue === queueCopy) {
      port = queue = target = null;
    }
  }
}

/**
 * @this {Function | {}} executor
 * @param {MessageEvent} evt
 */
export function initRemotePort(evt) {
  const {lock = location.pathname, id: once} = evt.data || {};
  const exec = this;
  const port = evt.ports[0];
  process.env.DEBUG(location.pathname, 'initRemotePort', evt);
  let numJobs = 0;
  if (!lockingSelf && lock && !once) {
    lockingSelf = true;
    navigator.locks.request(lock, () => new Promise(NOP));
  }
  port.onerror = console.error;
  port.onmessage = onMessage;
  port.onmessageerror = onMessageError;
  if (once) onMessage(evt);
  async function onMessage(portEvent) {
    process.env.DEBUG(location.pathname, 'port onmessage', portEvent);
    const data = portEvent.data;
    const {args, id} = data.id ? data : JSON.parse(data);
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
      err = e;
      delete e.source;
      // TODO: find which props are actually used (err may contain noncloneable Response)
    }
    process.env.DEBUG(location.pathname, 'port response', {id, res, err}, portEvent._transfer);
    port.postMessage({id, res, err},
      (/**@type{RemotePortEvent}*/portEvent)._transfer);
    if (!--numJobs && autoClose && !timer && portTimeout > 0) {
      timer = setTimeout(close, portTimeout);
    }
  }
}

/** @param {MessageEvent} _ */
function onMessageError({data, source}) {
  console.warn('Non-cloneable data', data);
  source.postMessage(JSON.stringify(data));
}
