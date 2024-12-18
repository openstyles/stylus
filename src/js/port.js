import {isCssDarkScheme} from '@/js/util';

export const COMMANDS = __.ENTRY !== 'sw' && (
  __.ENTRY === 'worker' || !__.MV3 ? {
    __proto__: null,
  } : /** @namespace CommandsAPI */ {
    __proto__: null,
    isDark: isCssDarkScheme,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
    /** @this {RemotePortEvent} */
    getWorkerPort(url) {
      const p = getWorkerPort(url);
      this._transfer = [p];
      return p;
    },
    keepAlive(val) {
      if (val && timer) {
        timer = clearTimeout(timer);
      } else if (!val && !timer && !numJobs) {
        timer = setTimeout(close, Math.max(0, lastBusy + PORT_TIMEOUT - performance.now()));
      }
      keepAlive = val;
    },
  }
);
export const CONNECTED = Symbol('connected');
const PORT_TIMEOUT = 5 * 60e3; // TODO: expose as a configurable option?
const navLocks = navigator.locks;
const autoClose = __.ENTRY === 'worker' ||
  __.ENTRY === true && location.pathname === `/${__.PAGE_OFFSCREEN}.html`;
// SW can't nest workers, https://crbug.com/40772041
const SharedWorker = __.ENTRY !== 'sw' && global.SharedWorker;
const kWorker = '_worker';
const NOP = () => {};
if (__.MV3 && __.ENTRY === true) {
  navigator.serviceWorker.onmessage = initRemotePort.bind(COMMANDS);
}
let lockingSelf;
let numJobs = 0;
let lastBusy = 0;
let keepAlive;
let timer;

export function createPortProxy(getTarget, opts) {
  let exec;
  return new Proxy({}, {
    get: (_, cmd) => cmd === CONNECTED
      ? exec?.[CONNECTED]
      : function (...args) {
        return (exec ??= createPortExec(getTarget, opts)).call(this, cmd, ...args);
      },
  });
}

export function createPortExec(getTarget, {lock, once} = {}) {
  let queue;
  /** @type {MessagePort} */
  let port;
  /** @type {MessagePort | Client | SharedWorker} */
  let target;
  let tracking;
  let lastId = 0;
  return exec;
  async function exec(...args) {
    const ctx = [new Error().stack]; // saving it prior to a possible async jump for easier debugging
    const promise = new Promise((resolve, reject) => ctx.push(resolve, reject));
    __.DEBUGTRACE(location.pathname, 'exec send', args);
    if ((port ??= initPort(args)).then) port = await port;
    (once ? target : port).postMessage({args, id: ++lastId},
      once || (Array.isArray(this) ? this : undefined));
    queue.set(lastId, ctx);
    return promise;
  }
  async function initPort() {
    __.DEBUGLOG(location.pathname, 'exec init', {getTarget});
    // SW can't nest workers, https://crbug.com/40772041
    if (__.ENTRY !== 'sw' && typeof getTarget === 'string') {
      lock = getTarget;
      target = getWorkerPort(getTarget, console.error);
    } else {
      target = typeof getTarget === 'function' ? getTarget() : getTarget;
      if (target.then) target = await target;
    }
    if (target instanceof MessagePort) {
      port = target;
    } else if (once) {
      port = initChannelPort(target, null, once = []);
    } else {
      port = initChannelPort(target, {lock});
    }
    port.onmessage = onMessage;
    port.onmessageerror = onMessageError;
    queue = new Map();
    lastId = 0;
    exec[CONNECTED] = true;
    return port;
  }
  /** @param {MessageEvent} _ */
  function onMessage({data}) {
    __.DEBUGLOG(location.pathname, 'exec onmessage', data);
    if (!tracking && !once && navLocks) trackTarget(queue);
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
      exec[CONNECTED] =
      queue = port = target = null;
    }
  }
  async function trackTarget(queueCopy) {
    tracking = true;
    await navLocks.request(lock, NOP);
    tracking = false;
    for (const [stack, /*resolve*/, reject] of queueCopy.values()) {
      const err = new Error('Target disconnected');
      err.stack = stack;
      reject(err);
    }
    if (queue === queueCopy) {
      exec[CONNECTED] =
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
  __.DEBUGTRACE(location.pathname, 'initRemotePort', evt);
  if (!lockingSelf && lock && !once && navLocks) {
    lockingSelf = true;
    navLocks.request(lock, () => new Promise(NOP));
    __.DEBUGLOG(location.pathname, 'initRemotePort lock', lock);
  }
  port.onerror = console.error;
  port.onmessage = onMessage;
  port.onmessageerror = onMessageError;
  if (once) onMessage(evt);
  async function onMessage(portEvent) {
    __.DEBUGLOG(location.pathname, 'port onmessage', portEvent);
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
    __.DEBUGLOG(location.pathname, 'port response', {id, res, err}, portEvent._transfer);
    port.postMessage({id, res, err},
      (/**@type{RemotePortEvent}*/portEvent)._transfer);
    if (!--numJobs && autoClose && !timer && !keepAlive) {
      timer = setTimeout(close, PORT_TIMEOUT);
    }
    lastBusy = performance.now();
  }
}

/** @return {MessagePort} */
function getWorkerPort(url, onerror) {
  /** @type {SharedWorker|Worker} */
  let worker;
  if (SharedWorker) {
    worker = new SharedWorker(url, 'Stylus');
    if (onerror) worker.onerror = onerror;
    return worker.port;
  }
  // Chrome Android
  let target = global;
  if (!__.MV3 && __.IS_BG) { // in MV2 the bg page can create Worker
    worker = target[kWorker];
  } else {
    for (const view of chrome.extension.getViews()) {
      if ((worker = view[kWorker])) {
        break;
      }
      if (view.location.pathname === `/${__.MV3 ? __.PAGE_OFFSCREEN : __.PAGE_BG}.html`) {
        target = view;
      }
    }
  }
  if (!worker) {
    worker = target[kWorker] = new (target.Worker)(url);
    if (onerror) worker.onerror = onerror;
  }
  return initChannelPort(worker, null);
}

function initChannelPort(target, msg, transfer) {
  const mc = new MessageChannel();
  const port2 = mc.port2;
  if (transfer) transfer[0] = port2;
  else target.postMessage(msg, [port2]);
  return mc.port1;
}

/** @param {MessageEvent} _ */
function onMessageError({data, source}) {
  console.warn('Non-cloneable data', data);
  source.postMessage(JSON.stringify(data));
}
