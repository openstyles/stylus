import {subscribe} from '/src/js/prefs';

/** @type {?Promise[]} */
let busy;
let lastBusyTime;
let pulse;

subscribe('keepAlive', checkPref, true);

export function keepAliveWhileBusy(...promises) {
  if (!busy) checkBusyWhenSettled(promises);
  else busy.push(...promises);
}

function checkBusyWhenSettled(promises) {
  Promise.allSettled(busy = promises).then(checkBusy);
}

function checkBusy({length}) {
  if (length < busy.length) {
    checkBusyWhenSettled(busy.slice(length));
  } else {
    busy = null;
    lastBusyTime = performance.now();
  }
}

async function checkPref(key, val) {
  if (busy || val < 0 || val && (performance.now() - lastBusyTime < val * 60e3)) {
    chrome.runtime.getPlatformInfo();
    if (!pulse) pulse = setInterval(checkPref, 25e3, key, val);
  } else if (pulse) {
    clearInterval(pulse);
    pulse = 0;
  }
}
