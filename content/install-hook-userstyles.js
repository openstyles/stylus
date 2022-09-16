/* global API */// msg.js
'use strict';

// eslint-disable-next-line no-unused-expressions
/^\/styles\/(\d+)(\/([^/]*))?([?#].*)?$/.test(location.pathname) && (async () => {
  if (window.INJECTED_USO === 1) return;
  window.INJECTED_USO = 1;

  const usoId = RegExp.$1;
  const USO = 'https://userstyles.org';
  const apiUrl = `${USO}/api/v1/styles/${usoId}`;
  const md5Url = `https://update.userstyles.org/${usoId}.md5`;
  const CLICK = [
    ['#install_stylish_style_button', onInstall],
    ['#update_stylish_style_button', onInstall],
    ['.customize_style_button', onCustomize],
    ['.uninstall_stylish_style_button', onUninstall],
  ];
  const pageEventId = `${performance.now()}${Math.random()}`;
  const contentEventId = pageEventId + ':';
  const orphanEventId = chrome.runtime.id; // id won't be available in the orphaned script
  const $ = (sel, base = document) => base.querySelector(sel);
  const toggleListener = (isOn, ...args) => (isOn ? addEventListener : removeEventListener)(...args);
  const togglePageListener = isOn => toggleListener(isOn, contentEventId, onPageEvent, true);

  const mo = new MutationObserver(onMutation);
  const observeColors = isOn =>
    isOn ? mo.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['value']})
      : mo.disconnect();

  let style, dup, md5, pageData, badKeys;

  runInPage(inPageContext, pageEventId, contentEventId, usoId, apiUrl);
  addEventListener(orphanEventId, orphanCheck, true);
  addEventListener('click', onClick, true);
  togglePageListener(true);

  [md5, dup] = await Promise.all([
    fetch(md5Url).then(r => r.text()),
    API.styles.find({md5Url}, {installationUrl: `https://uso.kkx.one/style/${usoId}`})
      .then(sendVarsToPage),
    document.body || new Promise(resolve => addEventListener('load', resolve, {once: true})),
  ]);

  if (!dup) {
    sendStylishEvent('styleCanBeInstalledChrome');
  } else if (dup.originalMd5 && dup.originalMd5 !== md5 || !dup.usercssData || !dup.md5Url) {
    // allow update if 1) changed, 2) is a classic USO style, 3) is from USO-archive
    sendStylishEvent('styleCanBeUpdatedChrome');
  } else {
    sendStylishEvent('styleAlreadyInstalledChrome');
  }

  async function onClick(e) {
    for (const [sel, fn] of CLICK) {
      const el = e.target.closest(sel);
      if (!el) continue;
      try {
        el.disabled = true;
        await fn(e);
      } catch (e) {
        alert(chrome.i18n.getMessage('styleInstallFailed', e.message || e));
      } finally {
        el.disabled = false;
      }
    }
  }

  function onCustomize() {
    const ss = $('#style-settings');
    const willShow = !ss || !ss.offsetHeight;
    observeColors(willShow);
    toggleListener(willShow, 'change', onChange);
  }

  async function onInstall(e) {
    const {id} = dup;
    e.stopPropagation();
    if (!style) await buildStyle();
    style = dup = await API.usercss.install(style, {
      dup: {id},
      vars: getPageVars(),
    });
    sendStylishEvent('styleInstalledChrome');
    API.uso.pingback(id);
  }

  function onUninstall() {
    const {id} = dup;
    dup = style = false;
    observeColors(false);
    removeEventListener('change', onChange);
    return API.styles.delete(id);
  }

  function onChange({target: el}) {
    if (dup && el.matches('[name^="ik-"], [type=file]')) {
      API.usercss.configVars(dup.id, getPageVars());
    }
  }

  function onMutation(mutations) {
    for (const {target: el} of mutations) {
      if (el.style.display === 'none' &&
          /^ik-/.test(el.name) &&
          /^#[\da-f]{6}$/.test(el.value)) {
        onChange({target: el});
      }
    }
  }

  function onPageEvent(e) {
    pageData = e.detail;
    togglePageListener(false);
  }

  async function buildStyle() {
    if (!pageData) pageData = await (await fetch(apiUrl)).json();
    ({style, badKeys} = await API.uso.toUsercss(pageData, {varsUrl: dup.updateUrl}));
    Object.assign(style, {
      md5Url,
      id: dup.id,
      originalMd5: md5,
      updateUrl: apiUrl,
    });
  }

  function getPageVars() {
    const {vars} = (style || dup).usercssData;
    for (const el of document.querySelectorAll('[name^="ik-"]')) {
      const name = el.name.slice(3); // dropping "ik-"
      const ik = (badKeys || {})[name] || name;
      const v = vars[ik] || false;
      const isImage = el.type === 'radio';
      if (v && (!isImage || el.checked)) {
        const val = el.value;
        const isFile = val === 'user-upload';
        if (isImage && (isFile || val === 'user-url')) {
          const el2 = $(`[type=${isFile ? 'file' : 'url'}]`, el.parentElement);
          const ikCust = `${ik}-custom`;
          v.value = `${ikCust}-dropdown`;
          vars[ikCust].value = isFile ? getFileUriFromPage(el2) : el2.value;
        } else {
          v.value = v.type === 'select' ? val.replace(/^ik-/, '') : val;
        }
      }
    }
    return vars;
  }

  function getFileUriFromPage(el) {
    togglePageListener(true);
    sendPageEvent(el);
    return pageData;
  }

  function runInPage(fn, ...args) {
    const div = document.createElement('div');
    div.attachShadow({mode: 'closed'})
      .appendChild(document.createElement('script'))
      .textContent = `(${fn})(${JSON.stringify(args).slice(1, -1)})`;
    document.documentElement.appendChild(div).remove();
  }

  function sendPageEvent(data) {
    dispatchEvent(data instanceof Node
      ? new MouseEvent(pageEventId, {relatedTarget: data})
      : new CustomEvent(pageEventId, {detail: data}));
    //* global cloneInto */// WARNING! Firefox requires cloning of an object `detail`
  }

  function sendStylishEvent(type) {
    document.dispatchEvent(new Event(type));
  }

  function sendVarsToPage(style) {
    if (style) {
      const vars = (style.usercssData || {}).vars || `${style.updateUrl}`.split('?')[1];
      if (vars) sendPageEvent('vars:' + JSON.stringify(vars));
    }
    return style || false;
  }

  function orphanCheck() {
    if (chrome.runtime.id) return true;
    removeEventListener(orphanEventId, orphanCheck, true);
    removeEventListener('click', onClick, true);
    removeEventListener('change', onChange);
    sendPageEvent('quit');
    observeColors(false);
    togglePageListener(false);
  }
})();

function inPageContext(eventId, eventIdHost, styleId, apiUrl) {
  let done, orphaned, vars;
  if (!window.chrome) window.chrome = {runtime: {sendMessage: () => {}}}; // USO bug in FF
  const EXT_ID = 'fjnbnpbmkenffdnngjfgmeleoegfcffe';
  const {defineProperty} = Object;
  const {dispatchEvent, CustomEvent, removeEventListener} = window;
  const apply = Map.call.bind(Map.apply);
  const OVR = [
    [chrome.runtime, 'sendMessage', (fn, me, args) => {
      const [id, /*msg*/, opts, cb = opts] = args;
      if (id !== EXT_ID) return apply(fn, me, args);
      if (typeof cb !== 'function') return Promise.resolve(true);
      cb(true);
    }],
    [Response.prototype, 'json', async (fn, me, args) => {
      const res = await apply(fn, me, args);
      try {
        if (!done && me.url === apiUrl) {
          done = true;
          send(res);
          setVars(res);
        }
      } catch (e) {}
      return res;
    }],
    [window, 'fetch', (fn, me, args) =>
      args[0] === `chrome-extension://${EXT_ID}/index.html`
        ? Promise.resolve(new Response('<!doctype html><html lang="en"></html>'))
        : apply(fn, me, args),
    ],
  ];
  OVR.forEach(([obj, name, caller], i) => {
    /* Using Proxy to make the override undetectable so Stylish cannot track our users,
     * which was the primary reason privacy-concerned users abandoned Stylish.
     * TODO: add a user option to allow USO see the user has Stylus? */
    const orig = obj[name];
    const ovr = new Proxy(orig, {
      apply(fn, me, args) {
        if (orphaned) restore(obj, name, ovr, fn);
        return (orphaned ? apply : caller)(fn, me, args);
      },
    });
    defineProperty(obj, name, {value: ovr});
    OVR[i] = [obj, name, ovr, orig]; // same args as restore()
  });
  window.isInstalled = true;
  addEventListener(eventId, onCommand, true);
  function onCommand(e) {
    if (e.detail === 'quit') {
      removeEventListener(eventId, onCommand, true);
      OVR.forEach(restore);
      done = orphaned = true;
    } else if (/^vars:/.test(e.detail)) {
      vars = JSON.parse(e.detail.slice(5));
    } else if (e.relatedTarget) {
      send(e.relatedTarget.uploadedData);
    }
  }
  function restore(obj, name, ovr, orig) { // same order as OVR after patching
    if (obj[name] === ovr) {
      defineProperty(obj, name, {value: orig});
    }
  }
  function send(data) {
    dispatchEvent(new CustomEvent(eventIdHost, {__proto: null, detail: data}));
  }
  function setVars(json) {
    const images = new Map();
    const isNew = typeof vars === 'object';
    const badKeys = {};
    const newKeys = [];
    const makeKey = ({install_key: key}) => {
      let res = isNew ? badKeys[key] : key;
      if (!res) {
        res = key.replace(/[^-\w]/g, '-');
        res += newKeys.includes(res) ? '-' : '';
        if (key !== res) {
          badKeys[key] = res;
          newKeys.push(res);
        }
      }
      return res;
    };
    if (!isNew) vars = new URLSearchParams(vars);
    for (const ss of json.style_settings || []) {
      const ik = makeKey(ss);
      let value = isNew ? (vars[ik] || {}).value : vars.get('ik-' + ik);
      if (value == null || !(ss.style_setting_options || [])[0]) {
        continue;
      }
      if (ss.setting_type === 'image') {
        let isListed;
        for (const opt of ss.style_setting_options) {
          isListed |= opt.default = (opt.install_key === value);
        }
        images.set(ik, {url: isNew && !isListed ? vars[`${ik}-custom`].value : value, isListed});
      } else if (value.startsWith('ik-') || isNew && vars[ik].type === 'select') {
        value = value.replace(/^ik-/, '');
        const def = ss.style_setting_options.find(item => item.default);
        if (!def || makeKey(def) !== value) {
          if (def) def.default = false;
          for (const item of ss.style_setting_options) {
            if (makeKey(item) === value) {
              item.default = true;
              break;
            }
          }
        }
      } else {
        const item = ss.style_setting_options[0];
        if (item.value !== value && item.install_key === 'placeholder') {
          item.value = value;
        }
      }
    }
    if (!images.size) return;
    new MutationObserver((_, observer) => {
      if (!document.getElementById('style-settings')) return;
      observer.disconnect();
      for (const [name, {url, isListed}] of images) {
        const elRadio = document.querySelector(`input[name="ik-${name}"][value="user-url"]`);
        const elUrl = elRadio && document.getElementById(elRadio.id.replace('url-choice', 'user-url'));
        if (elUrl) {
          elRadio.checked = !isListed;
          elUrl.value = url;
        }
      }
    }).observe(document, {childList: true, subtree: true});
  }
}
