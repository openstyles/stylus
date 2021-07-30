/* global $ $create $remove messageBoxProxy showSpinner toggleDataset */// dom.js
/* global API msg */// msg.js
/* global URLS */// toolbox.js
/* global baseInit */
/* global editor */
/* global t */// localization.js
'use strict';

(() => {
  //#region Main

  const ERROR_TITLE = 'UserStyles.world ' + t('genericError');
  const PROGRESS = '#usw-progress';
  let spinnerTimer = 0;
  let prevCode = '';

  msg.onExtension(request => {
    if (request.method === 'uswData' &&
        request.style.id === editor.style.id) {
      Object.assign(editor.style, request.style);
      updateUI();
    }
  });

  baseInit.ready.then(() => {
    updateUI();
    $('#usw-publish-style').onclick = disableWhileActive(publishStyle);
    $('#usw-disconnect').onclick = disableWhileActive(disconnect);
  });

  async function publishStyle() {
    const {id} = editor.style;
    if (await API.data.has('usw' + id) &&
        !await messageBoxProxy.confirm(t('publishRetry'), 'danger', ERROR_TITLE)) {
      return;
    }
    const code = editor.getValue();
    const isDiff = code !== prevCode;
    const res = isDiff ? await API.usw.publish(id, code) : t('importReportUnchanged');
    const title = `${new Date().toLocaleString()}\n${res}`;
    const failed = /^Error:/.test(res);
    $(PROGRESS).append(...failed && [
      $create('div.error', {title}, res),
      $create('div', t('publishReconnect')),
    ] || [
      $create(`span.${isDiff ? 'success' : 'unchanged'}`, {title}),
    ]);
    if (!failed) prevCode = code;
  }

  async function disconnect() {
    await API.usw.revoke(editor.style.id);
    prevCode = null; // to allow the next publishStyle to upload style
  }

  function updateUI(style = editor.style) {
    const usw = style._usw || {};
    const section = $('#publish');
    toggleDataset(section, 'connected', usw.token);
    for (const type of ['name', 'description']) {
      const el = $(`dd[data-usw="${type}"]`, section);
      el.textContent = el.title = usw[type] || '';
    }
    const elUrl = $('#usw-url');
    elUrl.href = `${URLS.usw}${usw.id ? `style/${usw.id}` : ''}`;
    elUrl.textContent = t('publishUsw').replace(/<(.+)>/, `$1${usw.id ? `#${usw.id}` : ''}`);
  }

  //#endregion
  //#region Utility

  function disableWhileActive(fn) {
    /** @this {Element} */
    return async function () {
      this.disabled = true;
      timerOn();
      await fn().catch(console.error);
      timerOff();
      this.disabled = false;
    };
  }

  function timerOn() {
    if (!spinnerTimer) {
      $(PROGRESS).textContent = '';
      spinnerTimer = setTimeout(showSpinner, 250, PROGRESS);
    }
  }

  function timerOff() {
    $remove(`${PROGRESS} .lds-spinner`);
    clearTimeout(spinnerTimer);
    spinnerTimer = 0;
  }

  //#endregion
})();
