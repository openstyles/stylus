import {API, bgReadySignal} from './msg-api';

export {API};

const TARGETS = {
  __proto: null,
  all: ['both', 'tab', 'extension'],
  extension: ['both', 'extension'],
  tab: ['both', 'tab'],
};
const handler = {
  both: new Set(),
  tab: new Set(),
  extension: new Set(),
};
// TODO: maybe move into browser.js and hook addListener to wrap/unwrap automatically
chrome.runtime.onMessage.addListener(onRuntimeMessage);

export function onMessage(fn) {
  handler.both.add(fn);
}

export function onTab(fn) {
  handler.tab.add(fn);
}

export function onExtension(fn) {
  handler.extension.add(fn);
}

export function off(fn) {
  for (const type of TARGETS.all) {
    handler[type].delete(fn);
  }
}

export function _execute(target, ...args) {
  let result;
  for (const type of TARGETS[target] || TARGETS.all) {
    for (const fn of handler[type]) {
      let res;
      try {
        res = fn(...args);
      } catch (err) {
        res = Promise.reject(err);
      }
      if (res !== undefined && result === undefined) {
        result = res;
      }
    }
  }
  return process.env.KEEP_ALIVE(result);
}

export function onRuntimeMessage({data, target}, sender, sendResponse) {
  if (data.method === 'backgroundReady' && !process.env.IS_BG) {
    bgReadySignal?.(true);
  }
  const res = _execute(target, data, sender);
  if (res instanceof Promise) {
    res.then(wrapData, wrapError).then(sendResponse);
    return true;
  }
  if (res !== undefined) sendResponse(wrapData(res));
}

function wrapData(data) {
  return {data};
}

export function wrapError(error) {
  return {
    error: Object.assign({
      message: error.message || `${error}`,
      stack: error.stack,
    }, error), // passing custom properties e.g. `error.index`
  };
}
