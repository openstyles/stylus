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
  const CLICK = {
    customize: '.customize_button',
    install: '#install_style_button',
    uninstall: '#uninstall_style_button',
    update: '#update_style_button',
  };
  const CLICK_SEL = Object.values(CLICK).join(',');
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

  if (!dup.id) {
    sendStylishEvent('styleCanBeInstalledChrome');
  } else if (dup.originalMd5 && dup.originalMd5 !== md5 || !dup.usercssData || !dup.md5Url) {
    // allow update if 1) changed, 2) is a classic USO style, 3) is from USO-archive
    sendStylishEvent('styleCanBeUpdatedChrome');
  } else {
    sendStylishEvent('styleAlreadyInstalledChrome');
  }

  async function onClick(e) {
    const el = e.target.closest(CLICK_SEL);
    if (!el) return;
    el.disabled = true;
    const {id} = dup;
    try {
      if (el.matches(CLICK.uninstall)) {
        dup = style = false;
        removeEventListener('change', onChange);
        await API.styles.delete(id);
        return;
      }
      if (el.matches(CLICK.customize)) {
        const isOn = dup && !$('#style-settings');
        toggleListener(isOn, 'change', onChange);
        observeColors(isOn);
        return;
      }
      e.stopPropagation();
      if (!style) await buildStyle();
      style = dup = await API.usercss.install(style, {
        dup: {id},
        vars: getPageVars(),
      });
      sendStylishEvent('styleInstalledChrome');
      API.uso.pingback(id);
    } catch (e) {
      alert(chrome.i18n.getMessage('styleInstallFailed', e.message || e));
    } finally {
      el.disabled = false;
    }
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
      const ik = badKeys[name] || name;
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
    if (chrome.i18n) return true;
    removeEventListener(orphanEventId, orphanCheck, true);
    removeEventListener('click', onClick, true);
    removeEventListener('change', onChange);
    sendPageEvent('quit');
    observeColors(false);
    togglePageListener(false);
  }
})();

function inPageContext(eventId, eventIdHost, styleId, apiUrl) {
  window.isInstalled = true;
  const {dispatchEvent, CustomEvent, removeEventListener} = window;
  const apply = Map.call.bind(Map.apply);
  const CR = chrome.runtime;
  const {sendMessage} = CR;
  const RP = Response.prototype;
  const origJson = RP.json;
  let done, vars;
  CR.sendMessage = function (id, msg, opts, cb = opts) {
    if (id === 'fjnbnpbmkenffdnngjfgmeleoegfcffe' &&
        msg && msg.type === 'deleteStyle' &&
        typeof cb === 'function') {
      cb(true);
    } else {
      return sendMessage(...arguments);
    }
  };
  RP.json = async function () {
    const res = await apply(origJson, this, arguments);
    try {
      if (!done && this.url === apiUrl) {
        RP.json = origJson;
        done = true; // will be used if called by another script that saved our RP.json hook
        send(res);
        setVars(res);
      }
    } catch (e) {}
    return res;
  };
  addEventListener(eventId, onCommand, true);
  function onCommand(e) {
    if (e.detail === 'quit') {
      removeEventListener(eventId, onCommand, true);
      CR.sendMessage = sendMessage;
      RP.json = origJson;
      done = true;
    } else if (/^vars:/.test(e.detail)) {
      vars = JSON.parse(e.detail.slice(5));
    } else if (e.relatedTarget) {
      send(e.relatedTarget.uploadedData);
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
          isListed |= opt.default = (opt.value === value);
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
