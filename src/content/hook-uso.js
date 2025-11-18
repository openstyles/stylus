/* global API */// msg.js

import hookUsoPage from './hook-uso-page';

const pageId = `${performance.now()}${Math.random()}`;
const STATE_EVENTS = [
  ['uninstalled', 'styleCanBeInstalledChrome'],
  ['canBeUpdate', 'styleCanBeUpdatedChrome'],
  ['installed', 'styleAlreadyInstalledChrome'],
];
const getUsoId = () => Number(location.pathname.match(/^\/styles\/(\d+)|$/)[1]);
let gesture = NaN;
let pageLoading;

if (__.MV3) {
  addEventListener('stylus-uso',
    () => dispatchEvent(new CustomEvent('stylus-uso*', {detail: pageId})),
    {once: true});
} else {
  runInPage(hookUsoPage, pageId);
}
addEventListener('click', onGesture, true);
addEventListener('keydown', onGesture, true);
addEventListener(pageId + '*', onPageEvent, true);
addEventListener(chrome.runtime.id, function orphanCheck(e) {
  if (chrome.runtime.id) return true;
  removeEventListener(e.type, orphanCheck, true);
  removeEventListener(pageId + '*', onPageEvent, true);
  removeEventListener('click', onGesture, true);
  removeEventListener('keydown', onGesture, true);
  sendPageEvent({cmd: 'quit'});
}, true);
if ((pageLoading = !document.head && location.href)) {
  addEventListener('DOMContentLoaded', () => {
    postMessage({direction: 'from-content-script', message: 'StylishInstalled'}, '*');
  }, {once: true});
  addEventListener('load', () => {
    pageLoading = '';
  }, {once: true});
}

function onGesture(e) {
  if (e.isTrusted) gesture = performance.now();
}

function isTrusted(data) {
  return (pageLoading === location.href || performance.now() - gesture < 1000)
    || console.warn('Stylus is ignoring request not initiated by the user:', data);
}

async function onPageEvent({detail: {id, cmd, data}}) {
  if (cmd === 'msg') {
    let res = true;
    switch (data.type) {
      case 'stylishUpdateChrome':
      case 'stylishInstallChrome':
        if (isTrusted(data)) await API.uso.toUsercss(getUsoId(), data.customOptions || {});
        res = {success: true};
        gesture = NaN;
        break;
      case 'deleteStylishStyle': {
        if (isTrusted(data)) res = await API.uso.deleteStyle(getUsoId());
        gesture = NaN;
        break;
      }
      case 'getStyleInstallStatus':
        if (isTrusted(data)) res = (await getStyleState() || [])[0];
        break;
      case 'GET_OPEN_TABS':
      case 'GET_TOP_SITES':
        res = [];
        break;
    }
    sendPageEvent({id, data: res});
  }
}

async function getStyleState(usoId = getUsoId()) {
  return STATE_EVENTS[usoId ? await API.uso.getUpdatability(usoId) : -1];
}

function runInPage(fn, ...args) {
  const div = document.createElement('div');
  div.attachShadow({mode: 'closed'})
    .appendChild(document.createElement('script'))
    .textContent = `(${fn})(${JSON.stringify(args).slice(1, -1)})`;
  document.documentElement.appendChild(div).remove();
}

function sendPageEvent(data) {
  /* global cloneInto */// WARNING! Firefox requires cloning of CustomEvent `detail` if it's an object
  if (typeof cloneInto === 'function') data = cloneInto(data, document);
  dispatchEvent(new CustomEvent(pageId, {detail: data}));
}
