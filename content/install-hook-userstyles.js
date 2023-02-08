/* global API */// msg.js
'use strict';

(() => {
  if (window.INJECTED_USO === 1) return;
  window.INJECTED_USO = 1;

  let dup, md5, md5Url, apiData;
  const pageId = `${performance.now()}${Math.random()}`;
  const USO_API = 'https://userstyles.org/api/v1/styles/';
  const STATE_EVENTS = [
    ['uninstalled', 'styleCanBeInstalledChrome'],
    ['canBeUpdate', 'styleCanBeUpdatedChrome'],
    ['installed', 'styleAlreadyInstalledChrome'],
  ];
  const getUsoId = () => Number(location.pathname.match(/^\/styles\/(\d+)|$/)[1]);

  runInPage(inPageContext, pageId, USO_API);
  addEventListener(pageId + '*', onPageEvent, true);
  addEventListener(chrome.runtime.id, function orphanCheck(e) {
    if (chrome.runtime.id) return true;
    removeEventListener(e.type, orphanCheck, true);
    removeEventListener(pageId + '*', onPageEvent, true);
    sendPageEvent({cmd: 'quit'});
  }, true);
  Promise.all([
    getStyleState(),
    document.body || new Promise(cb => addEventListener('load', cb, {once: true})),
  ]).then(([s]) => {
    if (s != null) document.dispatchEvent(new Event(STATE_EVENTS[s][1]));
    postMessage({direction: 'from-content-script', message: 'StylishInstalled'}, '*');
  });

  async function onPageEvent({detail: {id, cmd, data}}) {
    if (cmd === 'msg') {
      let res;
      switch (data.type) {
        case 'stylishUpdateChrome':
        case 'stylishInstallChrome':
          await installStyle(data);
          res = {success: true};
          break;
        case 'deleteStylishStyle':
          if (dup) res = Boolean(await API.styles.delete(dup.id).catch(() => 0));
          dup = false;
          break;
        case 'getStyleInstallStatus':
          res = STATE_EVENTS[await getStyleState(data.payload.styleId) || 0][0];
          break;
        default:
          res = true;
      }
      sendPageEvent({id, data: res});
    } else if (cmd === 'apiData') {
      apiData = data;
    }
  }

  async function installStyle(usoMsg) {
    const usoId = getUsoId();
    const dupId = (dup || (dup = false)).id;
    const updateUrl = USO_API + usoId;
    if (!apiData || apiData.id !== usoId) apiData = await (await fetch(updateUrl)).json();
    const {style, badKeys} = await API.uso.toUsercss(apiData, {varsUrl: dup.updateUrl});
    const usoVars = Object.entries(usoMsg.customOptions || {});
    const vars = usoVars[0] && style.usercssData.vars;
    if (vars) {
      for (const [key, val] of usoVars) {
        const name = key.slice(3); // dropping "ik-"
        const v = vars[(badKeys || {})[name] || name];
        if (v) v.value = v.type === 'select' ? val.replace(/^ik-/, '') : decodeURIComponent(val);
      }
    }
    Object.assign(style, {
      md5Url,
      updateUrl,
      id: dupId,
      originalMd5: md5,
    });
    dup = await API.usercss.install(style, {dup: {id: dupId}, vars});
  }

  async function getStyleState(usoId = getUsoId()) {
    if (!usoId) return;
    md5Url = `https://update.userstyles.org/${usoId}.md5`;
    [md5, dup] = await Promise.all([
      fetch(md5Url).then(r => r.text()),
      API.styles.find({md5Url}, {installationUrl: `https://uso.kkx.one/style/${usoId}`}),
      document.body || new Promise(resolve => addEventListener('load', resolve, {once: true})),
    ]);
    // USO site doesn't preserve vars on update
    return !dup ? 0 : dup.usercssData || dup.originalMd5 === md5 ? 2 : 1;
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

function inPageContext(eventId, apiUrl) {
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
    [Response.prototype, 'json', async (fn, me, args) => {
      const res = await apply(fn, me, args);
      try {
        if (Number(me.url.replace(apiUrl, ''))) {
          send('apiData', res);
        }
      } catch (e) {}
      return res;
    }],
    [window, 'fetch', (fn, me, args) =>
      args[0] === `chrome-extension://${EXT_ID}/index.html`
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
