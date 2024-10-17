import browser from '/js/browser';
import {$, $$, $create, getEventKeyName, messageBox, setInputValue, setupLivePrefs} from '/js/dom';
import {t, tBody, template} from '/js/localization';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import {CHROME_POPUP_BORDER_BUG, clamp, FIREFOX, ignoreChromeError, MAC, OPERA} from '/js/toolbox';
import './options-sync';
import './onoffswitch.css';
import './options.css';

tBody();
setupLivePrefs();
$$('input[min], input[max]').forEach(enforceInputRange);
for (const el of $$('[show-if]')) {
  prefs.subscribe(el.getAttribute('show-if').replace(/^!/, ''), toggleShowIf, true);
}
if (CHROME_POPUP_BORDER_BUG) {
  $('.chrome-no-popup-border').classList.remove('chrome-no-popup-border');
}
// actions
$('header i').onclick = () => {
  top.dispatchEvent(new CustomEvent('closeOptions'));
};
$('#manage').onclick = () => {
  API.openManage();
};
$('#manage.newUI.favicons').onclick = () => {
  API.prefsDb.delete('badFavs');
};
$('#shortcuts').onclick = () => {
  if (FIREFOX) {
    customizeHotkeys();
  } else {
    API.openURL({
      url: `${OPERA ? 'opera://settings' : 'chrome://extensions'}/configureCommands`,
    });
  }
};
$('#shortcuts').hidden = FIREFOX && !browser.commands?.update;
$('#reset').onclick = async () => {
  if (await messageBox.confirm(t('confirmDiscardChanges'))) {
    for (const el of $$('input')) {
      const id = el.id || el.name;
      if (prefs.knownKeys.includes(id)) {
        prefs.reset(id);
      }
    }
  }
};
$$('[data-clickable]').forEach(el => {
  const input = $('input', el.closest('label'));
  const value = el.dataset.clickable;
  const rx = new RegExp(`\\b(${value})\\b`, 'g');
  const onclick = () => setInputValue(input, value);
  const parts = elementize(el.textContent, rx, s => $create('span.clickable', {onclick}, s));
  el.firstChild.replaceWith(...parts);
});

function customizeHotkeys() {
  const CTRL = MAC ? 'metaKey' : 'ctrlKey';
  const SKIP = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Tab', 'Escape', 'OS'];
  messageBox.show({
    title: t('shortcutsNote'),
    contents: template.shortcutsFF.cloneNode(true),
    className: 'center-dialog pre-line',
    buttons: [t('confirmClose')],
    onshow(box) {
      const inputs = $$('input', box);
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

function elementize(str, rx, cb) {
  return str.split(rx).map((s, i) => i % 2 ? cb(s) : s).filter(Boolean);
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

function toggleShowIf(id, val) {
  for (const el of $$(`[show-if="${id}"], [show-if="!${id}"]`)) {
    el.classList.toggle('disabled', el.getAttribute('show-if')[0] === '!' ? !!val : !val);
  }
}

window.onkeydown = event => {
  if (getEventKeyName(event) === 'Escape') {
    top.dispatchEvent(new CustomEvent('closeOptions'));
  }
};
