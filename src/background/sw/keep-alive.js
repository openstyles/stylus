import {bgReady} from '/background/common';
import {subscribe} from '/js/prefs';

/** @type {?Promise[]} */
let busy;
let lastBusyTime = 0;
let pulse;
let TTL;
let idleDuration;

process.env.KEEP_ALIVE = keepAlive;
subscribe('keepAlive', (_, val) => {
  idleDuration = Math.max(30, val * 60 | 0/*to integer*/ || 0/*if val is not a number*/);
  TTL = val * 60e3;
  reschedule();
}, true);

export function keepAlive(job) {
  if (!(job instanceof Promise)) lastBusyTime = performance.now();
  else if (!busy) keepAliveUntilSettled([job]);
  else busy.push(job);
  return job;
}

async function keepAliveUntilSettled(promises) {
  busy = promises;
  if (TTL == null) await bgReady;
  if (!pulse) reschedule();
  do await Promise.allSettled(busy);
  while (busy?.splice(0, promises.length) && busy.length);
  busy = null;
  lastBusyTime = performance.now();
}

/**
 * Calling an async `chrome` API keeps the SW alive for the next 30 seconds:
 * 1. when `busy` contains unsettled Promises,
 * 2. when the user explicitly wants to keep the SW alive forever (TTL < 0),
 * 3. when the browser is actively used and the user's TTL > 0.
 * Otherwise (TTL = 0), we don't call it and rely on the vanilla MV3 behavior.
 */
async function reschedule() {
  if (busy || TTL < 0
      ? await isUserActiveInBrowser(true)
      : TTL && (performance.now() < lastBusyTime + TTL) && await isUserActiveInBrowser()) {
    pulse ??= setInterval(reschedule, 25e3);
  } else if (pulse) {
    clearInterval(pulse);
    pulse = null;
  }
}

async function isUserActiveInBrowser(overrideResult) {
  return await chrome.idle.queryState(idleDuration) === 'active' || (
    overrideResult ?? (await chrome.windows.getAll({})).some(w => w.focused)
  );
}
