import '@/js/dom-init';
import '@/js/browser';
import {pKeepAlive} from '@/js/consts';
import {$create} from '@/js/dom';
import {getEventKeyName, messageBox, setInputValue, setupLivePrefs} from '@/js/dom-util';
import {htmlToTemplate, tBody, template, templateCache} from '@/js/localization';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {FIREFOX, MAC, OPERA} from '@/js/ua';
import {clamp, t} from '@/js/util';
import {CHROME_POPUP_BORDER_BUG, ignoreChromeError} from '@/js/util-webext';
import './options-sync';
import '@/css/onoffswitch.css';
import './options.css';
import shortcutsFF from './shortcuts-ff.html';

tBody();
$$('input[min], input[max]').forEach(enforceInputRange);
$('#FOUC .items').textContent = t(__.MV3 ? 'optionFOUCMV3' : 'optionFOUCMV2')
  .replace('<a>', t('optionsAdvancedStyleViaXhr'))
  .replace('<b>', t('optionKeepAlive'));
$id(pKeepAlive).previousElementSibling.firstChild.textContent +=
  (/^(zh|ja|ko)/.test($root.lang) ? '' : ' ') +
  t('optionKeepAlive2').trim();
for (const el of $$('[show-if]')) {
  prefs.subscribe(el.getAttribute('show-if').match(/[.\w]+/)[0], toggleShowIf, true);
}
if (!__.MV3 && __.BUILD !== 'firefox' && CHROME_POPUP_BORDER_BUG) {
  $id('popupWidth').closest('.items').append(template.popupBorders);
}
window.on('keydown', event => {
  if (getEventKeyName(event) === 'Escape') {
    tellTopToCloseOptions();
  }
});
$('header i').onclick = tellTopToCloseOptions;
// actions
$id('manage').onclick = () => {
  API.openManager();
};
$id('manage.newUI.favicons').onclick = () => {
  API.prefsDB.delete('badFavs');
};
$id('shortcuts').onclick = () => {
  if (__.BUILD !== 'chrome' && FIREFOX) {
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
for (const el of $$('[data-clickable]')) {
  const value = el.dataset.clickable;
  const p = el.textContent.match(new RegExp(`^(.*\\W)(${value})(?=\\W)(.*)`));
  if (!p) continue;
  const input = el.closest('label').$('input');
  const span = $create('span.clickable', {onclick: () => setInputValue(input, value)}, p[2]);
  el.firstChild.replaceWith(p[1], span, p[3]);
}
(async () => {
  const {wrb} = __.MV3 ? prefs.clientData : await prefs.clientData;
  setupLivePrefs();
  if (wrb === false) {
    for (let el of $$('#patchCsp')) {
      el = el.closest('label');
      el.classList.add('disabled');
      el.$('.icon').after($create('a.broken[data-cmd=note]', {
        tabIndex: 0,
        title: t('webRequestBlockingMV3Note', chrome.runtime.id),
      }, '⚒'));
    }
  }
  if (location.hash === '#sync-styles') {
    $('.cloud-name').focus();
  }
})();

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
      browser.commands.reset(name).catch(ignoreChromeError);
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

function toggleShowIf(key, val) {
  for (const el of $$(`[show-if*="${key}"]`)) {
    const [, not, id, op, opVal] = el.getAttribute('show-if').match(/^(!?)([.\w]+)(!?=)?(.*)/);
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
