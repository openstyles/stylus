import {k_onDisconnect} from '@/js/consts';

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
const TTL = 5 * 60e3; // TODO: add a configurable option?
const navLocks = navigator.locks;
const willAutoClose = __.ENTRY === 'worker' || __.ENTRY === __.PAGE_OFFSCREEN;
// SW can't nest workers, https://crbug.com/40772041
const SharedWorker = __.ENTRY !== 'sw' && global.SharedWorker;
const WeakRef = global.WeakRef;
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
        trackSW();
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
    get: (me, cmd) => cmd === CONNECTED
      ? exec?.[CONNECTED]
      : function (...args) {
        exec ??= createPortExec(getTarget, opts, me[CONNECTED]);
        return exec.call(this, cmd, ...args);
      },
  });
}

export function createPortExec(getTarget, {lock, once} = {}, target) {
  /** @type {Map<number,{stack: string, p: Promise, t: number, rr: function[]}>} */
  let queue;
  /** @type {MessagePort} */
  let port;
  /** @type {WeakRef} */
  let ref;
  let initializing;
  let tracking;
  let lastId = 0;
  return exec;

  async function exec(...args) {
    // Saving the stack to attach it to `error` in onMessage
    const ctx = {stack: new Error().stack};
    const promise = new Promise((resolve, reject) => (ctx.rr = [resolve, reject]));

    // Re-connect if disconnected unless already initializing
    if (!(exec[CONNECTED] = ref ? !!ref.deref() : !!port) && !initializing)
      initializing = initPort();
    // If initPort didn't await inside, CONNECTED is true and we immediately clear `initializing`,
    // otherwise we'll await first in this exec() and in the overlapped subsequent exec(s).
    if (initializing)
      initializing = !exec[CONNECTED] && await initializing;

    (once ? target : port || ref.deref()).postMessage(
      {args, id: ++lastId},
      once || (Array.isArray(this) ? this : undefined));

    queue.set(lastId, ctx);
    if (once) ctx.p = promise.catch(NOP);
    ctx.t = setTimeout(onTimeout, 5000, lastId, args, ctx.rr);
    if (__.DEBUG & 2) console.trace('%c%s exec sent', 'color:green', PATH, lastId, args);
    return promise;
  }

  async function initPort() {
    if (__.DEBUG & 2) console.log('%c%s exec init', 'color:blue', PATH, {getTarget});
    // SW can't nest workers, https://crbug.com/40772041
    if (__.ENTRY !== 'sw' && typeof getTarget === 'string') {
      lock = getTarget;
      target = getWorkerPort(getTarget, console.error);
    } else if (!target) {
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
    if (WeakRef) {
      ref = new WeakRef(port);
      port = null;
    }
    if (__.ENTRY === 'sw' && lock === '/' + __.PAGE_OFFSCREEN + '.html') {
      tracking = true;
      global[k_onDisconnect][__.PAGE_OFFSCREEN] = () => {
        delete global[k_onDisconnect][__.PAGE_OFFSCREEN];
        onDisconnect(queue);
      };
    }
  }

  /** @param {MessageEvent} _ */
  function onMessage({data}) {
    if (__.DEBUG & 2) console.log('%c%s exec onmessage', 'color:darkcyan', PATH, data.id, data);
    if (!queue) {
      try { data = JSON.stringify(data); } catch {}
      console.error(PATH + ' empty queue in onMessage ' + data);
      return;
    }
    if (!tracking && !once && navLocks) trackTarget(queue);
    const {id, res, err} = data.id ? data : JSON.parse(data);
    const {stack, t, rr: [resolve, reject]} = queue.get(id);
    clearTimeout(t);
    queue.delete(id);
    if (lastId > 1000 && !queue.has(1))
      lastId = 0;
    if (!err) {
      resolve(res);
    } else {
      reject(err[1] ? Object.assign(...err, {stack: err[0].stack + '\n' + stack}) : err[0]);
    }
    if (once && queue.size)
      discard(queue, true);
  }

  async function discard(myQ, wait) {
    if (__.DEBUG & 2 && wait) console.log(`${PATH} discarding`, myQ, queue, myQ === queue);
    while (wait && myQ.size) {
      await Promise.all(Array.from(myQ.values(), ctx => ctx.p.catch(NOP)));
    }
    if (myQ !== queue) return;
    if (wait) ref.deref()?.close();
    exec[CONNECTED] = queue = ref = port = target = null;
  }

  async function onTimeout(id, args, rr) {
    console.warn(`${PATH} timeout for`, args);
    queue?.delete(id);
    exec(...args).then(...rr);
  }

  async function trackTarget(myQ) {
    tracking = true;
    await navLocks.request(lock, NOP);
    onDisconnect(myQ);
  }

  function onDisconnect(myQ) {
    if (__.DEBUG & 2) console.log(`${PATH} target disconnected`, myQ, queue, myQ === queue);
    tracking = false;
    for (const {stack, t, rr: [, reject]} of myQ.values()) {
      const msg = 'Target disconnected';
      const err = new Error(msg);
      err.stack = msg + '\n' + stack;
      reject(err);
      clearTimeout(t);
    }
    myQ.clear();
    if (queue === myQ)
      discard(myQ);
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
  if (__.ENTRY === 'offscreen') {
    if (!bgPort) trackSW();
  } else if (!lockingSelf && lock && !once && navLocks) {
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
      if (e instanceof Error) {
        delete e.origin; // non-clonable
        err = [e, {...e}]; // keeping own props added on top of an Error
      } else {
        err = [e];
      }
    }
    if (__.DEBUG & 2) console.log('%c%s port response', 'color:blue', PATH, id, {res, err});
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

/** @param {MessageEvent} _ */
function onMessageError({data, source}) {
  console.warn('Non-cloneable data', data);
  source.postMessage(JSON.stringify(data));
}

function trackSW() {
  bgPort = chrome.runtime.connect({name: __.PAGE_OFFSCREEN});
  bgPort.onDisconnect.addListener(() => autoClose());
}
