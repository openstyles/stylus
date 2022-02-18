/* global API */// msg.js
/* global prefs */
/* global t */// localization.js
/* global $ $$ getEventKeyName messageBoxProxy setupLivePrefs */// dom.js
/* global
  CHROME_POPUP_BORDER_BUG
  FIREFOX
  URLS
  clamp
  ignoreChromeError
  openURL
*/// toolbox.js
'use strict';

setupLivePrefs();
$$('input[min], input[max]').forEach(enforceInputRange);
if (CHROME_POPUP_BORDER_BUG) {
  $('.chrome-no-popup-border').classList.remove('chrome-no-popup-border');
}
if (FIREFOX && 'update' in (chrome.commands || {})) {
  $('#shortcuts').classList.remove('chromium-only');
}
// actions
$('#options-close-icon').onclick = () => {
  top.dispatchEvent(new CustomEvent('closeOptions'));
};
$('#manage').onclick = () => {
  API.openManage();
};
$('#shortcuts').onclick = () => {
  if (FIREFOX) {
    customizeHotkeys();
  } else {
    openURL({url: URLS.configureCommands});
  }
};
$('#reset').onclick = async () => {
  if (await messageBoxProxy.confirm(t('confirmDiscardChanges'))) {
    for (const el of $$('input')) {
      const id = el.id || el.name;
      if (prefs.knownKeys.includes(id)) {
        prefs.reset(id);
      }
    }
  }
};

function customizeHotkeys() {
  messageBoxProxy.show({
    title: t('shortcutsNote'),
    contents: t.template.shortcutsFF.cloneNode(true),
    className: 'center-dialog pre-line',
    buttons: [t('confirmClose')],
    onshow(box) {
      box.oninput = onInput;
      setupLivePrefs($$('input', box).map(el => el.id));
    },
  });
  async function onInput({target: el}) {
    const name = el.id.split('.')[1];
    const shortcut = el.value.trim();
    if (!shortcut) {
      browser.commands.reset(name).catch(ignoreChromeError);
      el.setCustomValidity('');
      return;
    }
    try {
      await browser.commands.update({name, shortcut});
      el.setCustomValidity('');
    } catch (err) {
      el.setCustomValidity(err);
    }
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

window.onkeydown = event => {
  if (getEventKeyName(event) === 'Escape') {
    top.dispatchEvent(new CustomEvent('closeOptions'));
  }
};
