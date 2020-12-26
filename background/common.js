/* global API */// msg.js
'use strict';

/**
 * Common stuff that's loaded first so it's immediately available to all background scripts
 */

/* exported
  addAPI
  bgReady
  compareRevision
*/

const bgReady = {};
bgReady.styles = new Promise(r => (bgReady._resolveStyles = r));
bgReady.all = new Promise(r => (bgReady._resolveAll = r));

function addAPI(methods) {
  for (const [key, val] of Object.entries(methods)) {
    const old = API[key];
    if (old && Object.prototype.toString.call(old) === '[object Object]') {
      Object.assign(old, val);
    } else {
      API[key] = val;
    }
  }
}

function compareRevision(rev1, rev2) {
  return rev1 - rev2;
}
