import messageBox from '/js/dlg/message-box';
import {$, $$, $create, $remove, showSpinner, toggleDataset} from '/js/dom';
import {t} from '/js/localization';
import * as msg from '/js/msg';
import {API} from '/js/msg';
import {isEmptyObj, URLS} from '/js/toolbox';
import editor from './editor';
import styleReady from './style-ready';

styleReady.then(() => {
  const ERROR_TITLE = 'UserStyles.world ' + t('genericError');
  const elProgress = $('#usw-progress');
  const UI = $('#publish');
  const style = editor.style;
  let spinner;
  let spinnerTimer = 0;
  let prevCode = '';

  msg.onExtension(request => {
    if (request.method === 'uswData' &&
        request.style.id === style.id) {
      Object.assign(style, request.style);
      for (const el of $$('#usw-data input')) editor.dirty.clear(el.id);
      updateUI();
    }
  });

  updateUI();
  $('#usw-publish-style').onclick = disableWhileActive(publishStyle);
  $('#usw-disconnect').onclick = disableWhileActive(disconnect);

  async function publishStyle() {
    const {id, _usw} = style;
    if (await API.data.has('usw' + id) &&
        !await messageBox.confirm(t('publishRetry'), 'danger', ERROR_TITLE)) {
      return;
    }
    let error;
    const code = editor.getValue();
    const isDiff = code !== prevCode;
    const res = isDiff
      ? await API.usw.publish(id, code, _usw).catch(e => (error = e.message))
      : t('importReportUnchanged');
    const title = `${new Date().toLocaleString()}\n${res}`;
    const failed = error || /^Error:/.test(res);
    elProgress.append(...failed ? [
      $create('a.error', {title, tabIndex: 0, 'data-cmd': 'note'}, res),
      _usw && _usw.token && $create('div', t('publishReconnect')),
    ].filter(Boolean) : [
      $create(`span.${isDiff ? 'success' : 'unchanged'}`, {title}),
    ]);
    if (!failed) prevCode = code;
  }

  async function disconnect() {
    await API.usw.revoke(style.id);
    prevCode = null; // to allow the next publishStyle to upload style
  }

  function updateUI() {
    const usw = style._usw || false;
    const elUrl = $('#usw-url');
    const elData = $('#usw-data');
    const isOn = usw.token;
    toggleDataset(UI, 'connected', isOn);
    UI.classList.toggle('ignore-pref', !isOn);
    if (!isOn) UI.open = false;
    elUrl.href = `${URLS.usw}${usw.id ? `style/${usw.id}` : ''}`;
    elUrl.textContent = t('publishUsw').replace(/<(.+)>/, `$1${usw.id ? `#${usw.id}` : ''}`);
    if ((elData.hidden = editor.isUsercss)) {
      return;
    }
    for (const key of ['name', 'description', 'license', 'username>author', 'homepage', 'namespace']) {
      const [from, to = from] = key.split('>');
      const value = usw[from] || '';
      const id = 'usw-data-' + to;
      let el = $('#' + id);
      if (!el) {
        el = $create('input', {
          id,
          _from: from,
          placeholder: key === 'name' ? style[key] : '',
        });
        el.on('input', onDataChanged);
        elData.appendChild($create([
          $create('label', {htmlFor: id}, '@' + to),
          el,
        ]));
      }
      el.value = value;
      onDataChanged.call(el);
    }
  }

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

  function onDataChanged() {
    const val = this.value.trim();
    const usw = style._usw || val && (style._usw = {});
    const key = this._from;
    editor.dirty.modify(this.id, usw && usw[key] || '', val);
    if (usw) {
      if (val) usw[key] = val;
      else if (delete usw[key] && isEmptyObj(usw)) style._usw = null;
    }
    this.parentElement.classList.toggle('empty', !val);
  }

  function timerOn() {
    if (!spinnerTimer) {
      elProgress.textContent = '';
      spinnerTimer = setTimeout(async () => (spinner = await showSpinner(elProgress)), 250);
    }
  }

  function timerOff() {
    $remove(spinner);
    clearTimeout(spinnerTimer);
    spinnerTimer = 0;
    spinner = null;
  }
});
