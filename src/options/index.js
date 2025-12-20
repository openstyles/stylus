import '@/js/dom-init';
import '@/js/browser';
import {kBadFavs, pKeepAlive} from '@/js/consts';
import {$create} from '@/js/dom';
import {getEventKeyName, messageBox, setInputValue, setupLivePrefs} from '@/js/dom-util';
import {htmlToTemplate, tBody, template, templateCache} from '@/js/localization';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {FIREFOX, MAC, OPERA} from '@/js/ua';
import {favicon, usoa, usw} from '@/js/urls';
import {clamp, getHost, NOP, t} from '@/js/util';
import './options-sync';
import '@/css/onoffswitch.css';
import './options.css';
import shortcutsFF from './shortcuts-ff.html';

tBody();
$$('input[min], input[max]').forEach(enforceInputRange);
if (location.hash === '#sync-styles') {
  $('.cloud-name').focus();
}
$('#FOUC .items').textContent = t(__.MV3 ? 'optionFOUCMV3' : 'optionFOUCMV2', [
  t('optionsAdvancedStyleViaXhr'),
  t('optionKeepAlive'),
]);
$id(pKeepAlive).previousElementSibling.firstChild.textContent +=
  (/^(zh|ja|ko)/.test($root.lang) ? '' : ' ') +
  t('optionKeepAlive2').trim();
$('#favs-note').title = t('optionTargetIconsNote', getHost(favicon('')));
$('#installer-note').dataset.title = t('optionsUrlInstallerNote', [
  usw + 'explore',
  usoa + 'browse/categories',
  'https://greasyfork.org/scripts?language=css',
].map(u => `<a href="${u}">${getHost(u)}</a>`).join(', '));
window.on('keydown', event => {
  if (getEventKeyName(event) === 'Escape') {
    tellTopToCloseOptions();
  }
});
top.on('beforeunload', () => {
  document.activeElement?.blur(); // auto-save on closing
});
$('header i').onclick = tellTopToCloseOptions;
// actions
$id('manage').onclick = () => {
  API.openManager();
};
$id('manage.newUI.favicons').onclick = () => {
  API.prefsDB.delete(kBadFavs);
};
$id('shortcuts').onclick = () => {
  if (__.BUILD !== 'chrome' && FIREFOX) {
    if (!browser.commands?.openShortcutSettings?.())
      customizeHotkeys();
  } else {
    API.openURL({
      url: `${OPERA ? 'opera://settings' : 'chrome://extensions'}/configureCommands`,
    });
  }
};
$id('shortcuts').hidden = FIREFOX && !browser.commands?.update;
$id('reset').onclick = async () => {
  if (await messageBox.confirm(t('confirmDiscardChanges'))) {
    for (const el of $$('input')) {
      const id = el.id || el.name;
      if (prefs.knownKeys.includes(id)) {
        prefs.reset(id);
      }
    }
  }
};
{
  const t1 = t('optionsAdvancedSitesNote');
  const t2 = t('sitesNoteRe');
  template.sites.$('a').dataset.title = `${
    // 1. non-table items
    t1.replace(/(?:^|\n)<.+(?=\n|$)/g, '').trim()
  }<table>${
    // 2. table items
    t1.replace(/(?:^|\n)[^<].+(?=\n|$)/g, '').replace(/^<([^>]+)>(.+)/gm,
      (_, a, b) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`)
  }</table>\n${
    // 3. regexp note
    t2.replace(/<([^>]+)>/g, '<code>$1</code>')
  }`;
}
for (const el of $$('[data-clickable]')) {
  const value = el.dataset.clickable;
  const parts = el.textContent.split(new RegExp(`(${value})(?=\\W)`, 'g'));
  if (parts)
    el.firstChild.replaceWith(...parts.map((p, i) =>
      i % 2 ? $create('span.clickable', {onclick: clickableValue}, p) : p));
}
for (const el of $$('[show-if]')) {
  const id = el.getAttribute('show-if').match(/[.\w]+/)[0];
  prefs.subscribe(id, toggleShowIf, true);
  if (el.matches('.sites')) {
    el.appendChild(template.sites.cloneNode(true));
    for (const elDep of el.$$('[id*="$"]')) {
      elDep.id = elDep.id.replace('$', id);
      if (elDep.localName === 'textarea') {
        elDep.on('keydown', onTextKey);
        elDep.on('input', onTextInput);
        onTextInput.call(elDep);
      }
    }
  }
}
if (!chrome.sidePanel && !browser.sidebarAction)
  $id('config.sidePanel').parentElement.hidden = true;
setupLivePrefs();
(async () => {
  const {wrb} = __.MV3 ? prefs.clientData : await prefs.clientData;
  if (wrb)
    return;
  const id = chrome.runtime.id;
  const title = t('webRequestBlockingMV3Note', [
    '<a href="https://chromeenterprise.google/policies/?policy=ExtensionInstallForcelist">' +
      'ExtensionInstallForcelist</a>',
    `<code>${id}</code>`,
    `<nobr><code>--allowlisted-extension-id=${id}</code></nobr>`,
  ]);
  const icon = $create('a.broken[data-cmd=note]', {title, tabIndex: 0}, '⚒');
  icon.dataset.title = title;
  for (const el of $$('.webRequestBlocking')) {
    el.classList.add('disabled');
    el.$('p').append(icon.isConnected ? icon.cloneNode(true) : icon);
  }
})();

function clickableValue() {
  setInputValue(
    this.closest('label').$('input'),
    this.textContent,
  );
}

function customizeHotkeys() {
  const CTRL = MAC ? 'metaKey' : 'ctrlKey';
  const SKIP = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Tab', 'Escape', 'OS'];
  messageBox.show({
    title: t('shortcutsNote'),
    contents: (templateCache.shortcutsFF ??= htmlToTemplate(shortcutsFF)).cloneNode(true),
    className: 'center-dialog pre-line',
    buttons: [t('confirmClose')],
    onshow(box) {
      const inputs = box.$$('input');
      for (const el of inputs) el.onkeydown = onInput;
      setupLivePrefs(inputs);
    },
  });

  async function onInput(evt) {
    if (SKIP.includes(evt.key)) return;
    evt.preventDefault();
    const mod =
      (evt[CTRL] ? 'Ctrl+' : '') +
      (evt.altKey ? 'Alt+' : '') +
      (evt.shiftKey ? 'Shift+' : '');
    const key = mod + evt.key.slice(0, 1).toUpperCase() + evt.key.slice(1);
    const el = evt.target;
    const name = el.id.split('.')[1];
    const shortcut = el.value = key === 'Delete' || key === 'Backspace' ? '' : key;
    let err;
    if (!shortcut) {
      browser.commands.reset(name).catch(NOP);
    } else {
      // must use try-catch as Firefox also uses `throw`
      try {
        await browser.commands.update({name, shortcut});
      } catch (e) {
        err = e;
      }
    }
    el.setCustomValidity(err || '');
    if (!err) el.dispatchEvent(new Event('change', {bubbles: true}));
  }
}

function enforceInputRange(element) {
  const min = Number(element.min);
  const max = Number(element.max);
  const doNotify = () => element.dispatchEvent(new Event('change', {bubbles: true}));
  const onChange = ({type}) => {
    if (type === 'input' && element.checkValidity()) {
      doNotify();
    } else if (type === 'change' && !element.checkValidity()) {
      element.value = clamp(Number(element.value), min, max);
      doNotify();
    }
  };
  element.on('change', onChange);
  element.on('input', onChange);
}

function onTextInput() {
  const rows = this.value.match(/^/gm).length;
  if (this.rows !== rows) this.rows = rows;
}

function onTextKey(e) {
  if (e.key === 's' && (e.metaKey === MAC && e.ctrlKey === !MAC) && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    this.dispatchEvent(new Event('change'));
  }
}

function toggleShowIf(key, val) {
  for (const el of $$(`[show-if*="${key}"]`)) {
    const [, not, id, op, opVal] = el.getAttribute('show-if')
      .match(/^\s*(!\s*)?([.\w]+)\s*(?:(!?=)\s*(\S*))?/);
    if (id === key) {
      el.classList.toggle('disabled', !(
        not ? !val : !op ? val :
          op === '=' ? val == opVal : val != opVal // eslint-disable-line eqeqeq
      ));
    }
  }
}

function tellTopToCloseOptions() {
  top.closeOptions();
}
