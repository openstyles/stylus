export const COMMANDS = __.ENTRY !== 'sw' && (
  __.ENTRY === 'worker' || !__.MV3 ? {
    __proto__: null,
  } : /** @namespace CommandsAPI */ {
    __proto__: null,
    /** @this {RemotePortEvent} */
    getWorkerPort(url) {
      const p = getWorkerPort(url);
      this._transfer = [p];
      return p;
    },
  }
);
export const CONNECTED = Symbol('connected');
const PATH = location.pathname;
const TTL = __.ENTRY === 'worker' ? 5 * 60e3 : 30e3; // TODO: add a configurable option?
const navLocks = navigator.locks;
const willAutoClose = __.ENTRY === 'worker' || __.ENTRY === __.PAGE_OFFSCREEN;
// SW can't nest workers, https://crbug.com/40772041
const SharedWorker = __.ENTRY !== 'sw' && global.SharedWorker;
const kWorker = '_worker';
const NOP = () => {};
if (__.MV3 && __.ENTRY === true || __.ENTRY === __.PAGE_OFFSCREEN) {
  navigator.serviceWorker.onmessage = initRemotePort.bind(COMMANDS);
}
if (__.ENTRY === __.PAGE_OFFSCREEN) {
  Object.assign(COMMANDS, /** @namespace CommandsAPI */ {
    keepAlive(val) {
      if (!val) {
        autoClose();
      } else if (!bgPort) {
        if (timer) timer = clearTimeout(timer);
        bgPort = chrome.runtime.connect({name: __.PAGE_OFFSCREEN});
        bgPort.onDisconnect.addListener(() => autoClose());
      }
    },
  });
}
let lockingSelf;
let numJobs = 0;
let lastBusy = 0;
/** @type {chrome.runtime.Port} */
let bgPort;
let timer;

export function createPortProxy(getTarget, opts) {
  let exec;
  return new Proxy({}, {
    get: (_, cmd) => cmd === CONNECTED
      ? exec?.[CONNECTED]
      : function (...args) {
        const res = (exec ??= createPortExec(getTarget, opts)).call(this, cmd, ...args);
        return __.DEBUG ? res.catch(onExecError) : res;
      },
  });
}

export function createPortExec(getTarget, {lock, once} = {}) {
  let queue;
  /** @type {MessagePort} */
  let port;
  /** @type {MessagePort | Client | SharedWorker} */
  let target;
  let timeout;
  let tracking;
  let lastId = 0;
  return exec;
  async function exec(...args) {
    const ctx = [new Error().stack]; // saving it prior to a possible async jump for easier debugging
    const promise = new Promise((resolve, reject) => ctx.push(resolve, reject));
    if ((port ??= initPort(args)).then) port = await port;
    (once ? target : port).postMessage({args, id: ++lastId},
      once || (Array.isArray(this) ? this : undefined));
    queue.set(lastId, ctx);
    if (__.ENTRY === 'sw' && once) timeout = setTimeout(onTimeout, 1000);
    if (__.DEBUG & 2) console.trace('%c%s exec sent', 'color:green', PATH, lastId, args);
    return promise;
  }
  async function initPort() {
    if (__.DEBUG & 2) console.log('%c%s exec init', 'color:blue', PATH, {getTarget});
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
    if (__.DEBUG & 2) console.log('%c%s exec onmessage', 'color:darkcyan', PATH, data.id, data);
    if (__.ENTRY === 'sw' && once) clearTimeout(timeout);
    if (!queue) { // FIXME: why does this happen???
      console.warn(`No queue in ${PATH}, data: ${JSON.stringify(data ?? `${data}`)}`);
      return;
    }
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
      queue = port = port.onmessage = target = null;
    }
  }
  function onTimeout() {
    console.warn(`Timeout in ${PATH}`);
    onMessage({});
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
  const {lock = PATH, id: once} = evt.data || {};
  const exec = this;
  const port = evt.ports[0];
  if (__.DEBUG & 2) console.trace('%c%s initRemotePort', 'color:orange', PATH, evt);
  if (!lockingSelf && lock && !once && navLocks) {
    lockingSelf = true;
    navLocks.request(lock, () => new Promise(NOP));
    if (__.DEBUG & 2) console.log('%c%s initRemotePort lock', 'color:orange', PATH, lock);
  }
  port.onerror = console.error;
  port.onmessage = onMessage;
  port.onmessageerror = onMessageError;
  if (once) onMessage(evt);
  /** @param {RemotePortEvent} portEvent */
  async function onMessage(portEvent) {
    const data = portEvent.data;
    const {args, id} = data.id ? data : JSON.parse(data);
    if (__.DEBUG & 2) console.log('%c%s port onmessage', 'color:green', PATH, id, data, portEvent);
    let res, err;
    numJobs++;
    if (timer) timer = clearTimeout(timer);
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
    if (__.DEBUG & 2) console.log('%c%s port response', 'color:green', PATH, id, {res, err});
    port.postMessage({id, res, err}, portEvent._transfer);
    if (!--numJobs && willAutoClose && !bgPort) {
      autoClose(TTL);
    }
    lastBusy = performance.now();
  }
}

function autoClose(delay) {
  if (!delay && bgPort && __.ENTRY === __.PAGE_OFFSCREEN) {
    bgPort = bgPort.disconnect();
  }
  if (!bgPort && !numJobs && !timer) {
    timer = setTimeout(close, delay || Math.max(0, lastBusy + TTL - performance.now()));
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
  } else if (__.ENTRY === true) {
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

function onExecError(err) {
  console.error(err);
  if (global.alert) {
    alert(err.stack);
  } else {
    global.chrome?.tabs.create({url: 'data:,' + err.stack});
  }
}

/** @param {MessageEvent} _ */
function onMessageError({data, source}) {
  console.warn('Non-cloneable data', data);
  source.postMessage(JSON.stringify(data));
}
