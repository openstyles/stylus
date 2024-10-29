import {subscribe} from '/js/prefs';

/** @type {?Promise[]} */
let busy;
let lastBusyTime = 0;
let pulse;
let TTL;

process.env.KEEP_ALIVE = keepAlive;
subscribe('keepAlive', (_, val) => {
  TTL = val * 60e3;
  reschedule();
}, true);

export function keepAlive(job) {
  if (!(job instanceof Promise)) lastBusyTime = performance.now();
  else if (!busy) settle([job]);
  else busy.push(job);
  return job;
}

async function settle(promises) {
  busy = promises;
  if (!pulse) reschedule();
  do await Promise.allSettled(busy);
  while (busy?.splice(0, promises.length) && busy.length);
  busy = null;
  lastBusyTime = performance.now();
}

async function reschedule() {
  if (busy || TTL < 0 || TTL && (performance.now() - lastBusyTime < TTL)) {
    chrome.extension.isAllowedIncognitoAccess();
    pulse ??= setInterval(reschedule, 25e3);
  } else if (pulse) {
    clearInterval(pulse);
    pulse = null;
  }
}
