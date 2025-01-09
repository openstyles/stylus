import {sleep} from '@/js/util';

export const CLIENT = Symbol('client');
export const COMMANDS = {__proto__: null};
const PATH_OFFSCREEN = '/offscreen.html';
const PATH = location.pathname;
const TTL = 5 * 60e3; // TODO: add a configurable option?
const navLocks = navigator.locks;
const willAutoClose = __.ENTRY === 'worker' || __.ENTRY === 'offscreen';
// SW can't nest workers, https://crbug.com/40772041
const SharedWorker = __.ENTRY !== 'sw' && global.SharedWorker;
const kWorker = '_worker';
const NOP = () => {};
let numJobs = 0;
let lastBusy = 0;
let bgLock;
let timer;

if (navLocks) {
  navLocks.request(PATH, () => new Promise(NOP));
}
if (__.MV3 && __.ENTRY === true || __.ENTRY === 'offscreen') {
  navigator.serviceWorker.onmessage = initRemotePort.bind(COMMANDS);
  Object.assign(COMMANDS, /** @namespace CommandsAPI */ {
    /** @this {RemotePortEvent} */
    getWorkerPort(url) {
      const p = getWorkerPort(url);
      this._transfer = [p];
      return p;
    },
  });
}
if (__.ENTRY === 'offscreen') {
  Object.assign(COMMANDS, /** @namespace CommandsAPI */ {
    keepAlive(val) {
      if (!val) {
        autoClose();
      } else if (!bgLock) {
        if (timer) timer = clearTimeout(timer);
        bgLock = navLocks.request('/sw.js', () => autoClose());
      }
    },
  });
}

export function createPortProxy(getTarget, opts) {
  let exec;
  return new Proxy({}, {
    get: (me, cmd) => cmd === CLIENT
      ? exec?.[CLIENT]
      : function (...args) {
        exec ??= createPortExec(getTarget, opts, me[CLIENT]);
        return exec.call(this, cmd, ...args);
      },
  });
}

export function createPortExec(getTarget, {lock, once} = {}, target) {
  /** @type {Map<number,{stack: string, p: Promise, args: any[], rr: function[]}>} */
  let queue;
  /** @type {MessagePort} */
  let port;
  let initPending;
  let tracking;
  let lastId = 0;
  return exec;

  async function exec(...args) {
    // Saving the stack to attach it to `error` in onMessage
    const ctx = {args, stack: new Error().stack};
    const promise = new Promise((resolve, reject) => (ctx.rr = [resolve, reject]));

    // Re-connect if disconnected
    if (!port && !initPending)
      initPending = initPort();
    // If initPort didn't await inside, CLIENT is set and we immediately clear `initPending`,
    // otherwise we'll await in the original exec() as well as in any overlapped subsequent exec(s).
    if (initPending)
      initPending = !exec[CLIENT] && await initPending;

    (once ? target : port).postMessage(
      {args, id: ++lastId},
      once || (Array.isArray(this) ? this : undefined));

    queue.set(lastId, ctx);
    ctx.p = promise.catch(NOP);
    __.DEBUGPORT('%c%s exec sent', 'color:green', PATH, lastId, args);
    return promise;
  }

  async function initPort() {
    exec[CLIENT] = null;
    __.DEBUGPORT('%c%s exec init', 'color:blue; font-weight:bold', PATH, {once, lock, getTarget});
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
    exec[CLIENT] = target;
    if (!tracking && !once && navLocks)
      trackTarget(queue);
  }

  /** @param {MessageEvent} _ */
  function onMessage({data}) {
    __.DEBUGPORT('%c%s exec onmessage', 'color:darkcyan', PATH, data.id, data);
    const {id, res, err} = data.id ? data : JSON.parse(data);
    const {stack, rr: [resolve, reject]} = queue.get(id);
    queue.delete(id);
    if (lastId > 1e9)
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
    if (wait) __.DEBUGPORT(`${PATH} discarding`, myQ, queue, myQ === queue);
    while (wait && myQ.size) {
      await Promise.all(Array.from(myQ.values(), ctx => ctx.p));
    }
    if (myQ !== queue) return;
    if (wait) port?.close();
    exec[CLIENT] = queue = port = target = null;
  }

  async function trackTarget(myQ) {
    tracking = true;
    while (!(await navLocks.query()).held.some(v => v.name === lock)) {
      __.DEBUGPORT(PATH, 'waiting for lock', lock);
      await sleep(10);
    }
    await navLocks.request(lock, NOP);
    tracking = false;
    __.DEBUGPORT(`${PATH} target disconnected`, target, lock, once);
    for (const {stack, rr: [, reject]} of myQ.values()) {
      const msg = 'Target disconnected';
      const err = new Error(msg);
      err.stack = msg + '\n' + stack;
      reject(err);
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
  const {id: once} = evt.data || {};
  const exec = this;
  const port = evt.ports[0];
  __.DEBUGPORT('%c%s initRemotePort', 'color:orange', PATH, evt);
  port.onerror = console.error;
  port.onmessage = onMessage;
  port.onmessageerror = onMessageError;
  if (once) onMessage(evt);

  /** @param {RemotePortEvent} portEvent */
  async function onMessage(portEvent) {
    const data = portEvent.data;
    const {args, id} = data.id ? data : JSON.parse(data);
    __.DEBUGPORT('%c%s port onmessage', 'color:green', PATH, id, args, portEvent);
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
    __.DEBUGPORT('%c%s port response', 'color:blue', PATH, id, {res, err});
    port.postMessage({id, res, err}, portEvent._transfer);
    if (!--numJobs && willAutoClose && !bgLock) {
      autoClose(TTL);
    }
    lastBusy = performance.now();
  }
}

function autoClose(delay) {
  if (!delay && bgLock && __.ENTRY === 'offscreen') {
    bgLock = null;
  }
  if (!bgLock && !numJobs && !timer) {
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
      if (view.location.pathname === (__.MV3 ? PATH_OFFSCREEN : `/${__.PAGE_BG}.html`)) {
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
