/* global API */// msg.js
'use strict';

// eslint-disable-next-line no-unused-expressions
/^\/styles\/(\d+)(\/([^/]*))?([?#].*)?$/.test(location.pathname) && (() => {
  if (window.INJECTED_USO === 1) return;
  window.INJECTED_USO = 1;

  const usoId = RegExp.$1;
  const USO = 'https://userstyles.org';
  const apiUrl = `${USO}/api/v1/styles/${usoId}`;
  const md5Url = `https://update.userstyles.org/${usoId}.md5`;
  const pageEventId = `${performance.now()}${Math.random()}`;
  const contentEventId = pageEventId + ':';
  const orphanEventId = chrome.runtime.id; // id won't be available in the orphaned script
  const $ = (sel, base = document) => base.querySelector(sel);
  const wiretap = isOn => window[`${isOn ? 'add' : 'remove'}EventListener`](contentEventId, onPageEvent, true);

  const mo = new MutationObserver(onMutation);
  const observeColors = isOn =>
    isOn ? mo.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['value']})
      : mo.disconnect();

  addEventListener(orphanEventId, orphanCheck, true);
  addEventListener('click', onClick, true);
  addEventListener('change', onChange);
  wiretap(true);

  let oldStyle, pageData, style, md5, badKeys;
  Promise.all([
    fetch(md5Url).then(r => r.text()),
    API.styles.find({md5Url}),
    document.body || new Promise(resolve => addEventListener('load', resolve, {once: true})),
  ]).then(async res => {
    md5 = res[0];
    oldStyle = res[1] ||
      await API.styles.find({installationUrl: `https://uso.kkx.one/style/${usoId}`}) ||
      false;
    const {updateUrl, originalMd5, id} = oldStyle;
    sendEvent({
      type: !id
        ? 'styleCanBeInstalledChrome'
        : /\?/.test(updateUrl) || originalMd5 && originalMd5 !== md5
          ? 'styleCanBeUpdatedChrome'
          : 'styleAlreadyInstalledChrome',
      detail: updateUrl ? {updateUrl} : null,
    });
    observeColors(true);
  });

  {
    const div = document.createElement('div');
    const args = [pageEventId, contentEventId, usoId, apiUrl];
    div.attachShadow({mode: 'closed'})
      .appendChild(document.createElement('script'))
      .textContent = `(${inPageContext})(${JSON.stringify(args).slice(1, -1)})`;
    document.documentElement.appendChild(div).remove();
  }

  async function onClick(e) {
    const el = e.target.closest('#install_style_button, #update_style_button, #uninstall_style_button');
    if (!el) return;
    el.disabled = true;
    try {
      const {id} = oldStyle;
      if (el.id === 'uninstall_style_button') {
        oldStyle = style = false;
        removeEventListener('change', onChange);
        await API.styles.delete(id);
        return;
      }
      e.stopPropagation();
      if (!style) await buildStyle();
      style = oldStyle = await API.usercss.install(style, {
        dup: {id},
        vars: getPageVars(),
      });
      sendEvent({type: 'styleInstalledChrome'});
      fetch(getMeta('stylish-install-ping-url'));
    } catch (e) {
      alert(chrome.i18n.getMessage('styleInstallFailed', e.message || e));
    } finally {
      el.disabled = false;
    }
  }

  function onChange({target: el}) {
    if (oldStyle && el.matches('[name^="ik-"], [type=file]')) {
      API.usercss.configVars(oldStyle.id, getPageVars());
    }
  }

  function onMutation(mutations) {
    for (const {target: el} of mutations) {
      if (el.tagName === 'INPUT' && el.type === 'text' && /^ik-/.test(el.name) && /^#[\da-f]{6}$/.test(el.value)) {
        onChange({target: el});
      }
    }
  }

  function onPageEvent(e) {
    pageData = e.detail;
    wiretap(false);
  }

  async function buildStyle() {
    if (!pageData) pageData = await (await fetch(apiUrl)).json();
    ({style, badKeys} = await API.uso.toUsercss(pageData));
    Object.assign(style, {
      md5Url,
      id: oldStyle.id,
      originalMd5: md5,
      updateUrl: apiUrl,
    });
  }

  function getPageVars() {
    const {vars} = (style || oldStyle).usercssData;
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
          vars[ikCust].value = isFile ? getDataUriFromPage(el2) : el2.value;
        } else {
          v.value = v.type === 'select' ? val.replace(/^ik-/, '') : val;
        }
      }
    }
    return vars;
  }

  function getDataUriFromPage(el) {
    wiretap(true);
    dispatchEvent(new MouseEvent(pageEventId, {relatedTarget: el}));
    return pageData;
  }

  function sendEvent(e) {
    /* global cloneInto */// Firefox requires cloning
    document.dispatchEvent(new CustomEvent(e.type,
      typeof cloneInto === 'function' ? cloneInto(e, document) : e));
  }

  function getMeta(name) {
    const e = $(`link[rel="${name}"]`);
    const url = e && e.getAttribute('href');
    if (url) return url[0] === '#' ? $(url).textContent : url;
  }

  function orphanCheck() {
    if (chrome.i18n) return true;
    removeEventListener(orphanEventId, orphanCheck, true);
    removeEventListener('click', onClick, true);
    removeEventListener('change', onChange);
    dispatchEvent(new CustomEvent(pageEventId, {detail: 'quit'}));
    observeColors(false);
    wiretap(false);
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
  let done;
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
      }
    } catch (e) {}
    return res;
  };
  addEventListener(eventId, function onCommand(e) {
    if (e.detail === 'quit') {
      removeEventListener(eventId, onCommand, true);
      RP.json = origJson;
      done = true;
    } else if (e.relatedTarget) {
      send(e.relatedTarget.uploadedData);
    }
  }, true);
  function send(data) {
    dispatchEvent(new CustomEvent(eventIdHost, {__proto: null, detail: data}));
  }
}
