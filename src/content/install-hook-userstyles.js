/* global API */// msg.js
'use strict'; // eslint-disable-line strict

(() => {
  if (window.INJECTED_USO === 1) return;
  window.INJECTED_USO = 1;

  const pageId = `${performance.now()}${Math.random()}`;
  const STATE_EVENTS = [
    ['uninstalled', 'styleCanBeInstalledChrome'],
    ['canBeUpdate', 'styleCanBeUpdatedChrome'],
    ['installed', 'styleAlreadyInstalledChrome'],
  ];
  const getUsoId = () => Number(location.pathname.match(/^\/styles\/(\d+)|$/)[1]);
  let gesture = NaN;
  let pageLoading;

  runInPage(inPageContext, pageId);
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
})();

function inPageContext(eventId) {
  let orphaned;
  // `chrome` may be empty if no extensions use externally_connectable but USO needs it
  if (!window.chrome) window.chrome = {};
  if (!chrome.runtime) chrome.runtime = {sendMessage: () => {}};
  const EXT_ID = 'fjnbnpbmkenffdnngjfgmeleoegfcffe';
  const {call, defineProperty} = Object;
  const {dispatchEvent, CustomEvent, Promise, Response, removeEventListener} = window;
  const getDetail = call.bind(Object.getOwnPropertyDescriptor(CustomEvent.prototype, 'detail').get);
  const apply = call.bind(Object.apply);
  const mathRandom = Math.random;
  const promiseResolve = async val => val;
  const startsWith = call.bind(''.startsWith);
  const callbacks = {__proto__: null};
  const OVR = [
    [chrome.runtime, 'sendMessage', (fn, me, args) => {
      // id, msg, opts/cb, cb
      if (args[0] !== EXT_ID) return apply(fn, me, args);
      const msg = args[1];
      let cb = args[args.length - 1];
      let res;
      if (typeof cb !== 'function') res = new Promise(resolve => (cb = resolve));
      send('msg', msg, cb);
      return res;
    }],
    [window, 'fetch', (fn, me, args) =>
      startsWith(`${args[0]}`, `chrome-extension://${EXT_ID}/`)
        ? promiseResolve(new Response('<!doctype html><html lang="en"></html>'))
        : apply(fn, me, args),
    ],
  ];
  for (let i = 0; i < OVR.length; i++) {
    const [obj, name, caller] = OVR[i];
    const orig = obj[name];
    const ovr = new Proxy(orig, {
      __proto__: null,
      apply(fn, me, args) {
        if (orphaned) restore(obj, name, ovr, fn);
        return (orphaned ? apply : caller)(fn, me, args);
      },
    });
    defineProperty(obj, name, {value: ovr});
    OVR[i] = [obj, name, ovr, orig]; // same args as restore()
  }
  addEventListener(eventId, onCommand, true);
  window.isInstalled = true; // for the old USO site (split_test_version=app50)
  function onCommand(e) {
    let v = getDetail(e);
    if (v.cmd === 'quit') {
      orphaned = true;
      removeEventListener(eventId, onCommand, true);
      for (v = 0; v < OVR.length; v++) restore(OVR[v]);
    } else {
      callbacks[v.id](v.data);
      delete callbacks[v.id];
    }
  }
  function restore(obj, name, ovr, orig) { // same order as OVR after patching
    if (obj[name] === ovr) {
      defineProperty(obj, name, {__proto__: null, value: orig});
    }
  }
  function send(cmd, data, cb) {
    let id;
    if (cb) callbacks[id = mathRandom()] = cb;
    dispatchEvent(new CustomEvent(eventId + '*', {__proto: null, detail: {id, cmd, data}}));
  }
}
