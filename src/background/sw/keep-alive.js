import {pKeepAlive} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {bgBusy} from '../common';

/** @type {?Promise[]} */
let busy;
let lastBusyTime = 0;
let pulse;
/** ms */
let TTL;
/** seconds */
let idleDuration;

keepAlive(bgBusy);
__.KEEP_ALIVE = keepAlive;
prefs.subscribe(pKeepAlive, (_, val) => {
  idleDuration = Math.max(30, val * 60 | 0/*to integer*/ || 0/*if val is not a number*/);
  TTL = val * 60e3;
  if (!pulse || !TTL && !busy) reschedule();
}, true);

function keepAlive(job) {
  if (__.DEBUG & 4) console.trace('%ckeepAlive', 'font-weight:bold', job);
  if (!(job instanceof Promise)) lastBusyTime = performance.now();
  else if (!busy) keepAliveUntilSettled([job]);
  else busy.push(job);
  return job;
}

async function keepAliveUntilSettled(promises) {
  busy = promises;
  if (TTL == null && bgBusy) await bgBusy;
  if (!pulse) reschedule();
  do await Promise.allSettled(busy);
  while (busy?.splice(0, promises.length) && busy.length);
  busy = null;
  lastBusyTime = performance.now();
  if (__.DEBUG & 4) console.log('%ckeepAlive settled', 'font-weight:bold');
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
    ? isUserActiveInBrowser(true) // not awaiting as we don't need the result
    : TTL && performance.now() < lastBusyTime + TTL
      && await isUserActiveInBrowser(prefs.__values.keepAliveIdle)) {
    if (__.DEBUG & 4) console.log('keepAlive setInterval', pulse || 'set');
    pulse ??= setInterval(reschedule, 25e3);
  } else if (pulse) {
    if (__.DEBUG & 4) console.log('keepAlive setInterval cleared');
    clearInterval(pulse);
    pulse = null;
  }
}

async function isUserActiveInBrowser(yes) {
  return (await chrome.idle.queryState(idleDuration) !== 'idle' || yes) &&
    (yes || (await chrome.windows.getAll({})).some(wnd => wnd.focused));
}
