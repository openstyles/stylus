import {subscribe} from '/js/prefs';

/** @type {?Promise[]} */
let busy;
let lastBusyTime = 0;
let pulse;

process.env.KEEP_ALIVE = keepAlive;
subscribe('keepAlive', checkPref, true);

export function keepAlive(v) {
  if (!(v instanceof Promise)) lastBusyTime = performance.now();
  else if (!busy) checkBusyWhenSettled([v]);
  else busy.push(v);
  return v;
}

function checkBusyWhenSettled(promises) {
  Promise.allSettled(busy = promises).then(checkBusy);
  if (!pulse) checkPref();
}

function checkBusy({length}) {
  if (length < busy.length) {
    checkBusyWhenSettled(busy.slice(length));
  } else {
    busy = null;
    lastBusyTime = performance.now();
  }
}

async function checkPref(key, TTL) {
  if (busy || TTL < 0 || TTL && (performance.now() - lastBusyTime < TTL * 60e3)) {
    chrome.runtime.getPlatformInfo();
    if (!pulse) pulse = setInterval(checkPref, 25e3, key, TTL);
  } else if (pulse) {
    clearInterval(pulse);
    pulse = 0;
  }
}
