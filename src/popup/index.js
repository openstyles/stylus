import '@/js/dom-init';
import {kAboutBlank, kPopup, kStyleIdPrefix} from '@/js/consts';
import {$create, $createFragment} from '@/js/dom';
import {setupLivePrefs} from '@/js/dom-util';
import {template} from '@/js/localization';
import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {isDark, onDarkChanged} from '@/js/themer';
import {CHROME, FIREFOX, MAC, MOBILE, OPERA} from '@/js/ua';
import {clamp, sleep0, t} from '@/js/util';
import {CHROME_POPUP_BORDER_BUG, getActiveTab} from '@/js/util-webext';
import * as Events from './events';
import {handleUpdate} from './events';
import {initHotkeys} from './hotkeys';
import {createWriterElement, showStyles, updateStateIcon} from './render';
import '@/css/onoffswitch.css';
import './popup.css';

const WRITE_FRAME_SEL = '.match:not([data-frame-id="0"]):not(.dupe)';
export const styleFinder = {};
export let tabId;
export let tabUrl;
export let tabUrlSupported;
export let isBlocked;
let prevHeight;

(async () => {
  const data = (__.MV3 ? prefs.clientData : await prefs.clientData)[kPopup];
  initPopup(data);
  showStyles(data);
  initHotkeys(data);
  prevHeight = Math.max(innerHeight, 150);
  if (!MOBILE) window.on('resize', onWindowResize);
})();

onMessage.set(onRuntimeMessage);

updateStateIcon(isDark);
onDarkChanged.add(val => updateStateIcon(val, null));

prefs.subscribe('popup.stylesFirst', (key, stylesFirst) => {
  $rootCL.toggle('styles-first', stylesFirst);
  $rootCL.toggle('styles-last', !stylesFirst);
}, true);
prefs.subscribe('disableAll', (key, val) => {
  updateStateIcon(null, val);
  $id('disableAll-label').title = t('masterSwitch') + ':\n' +
    t(val ? 'disableAllStylesOff' : 'genericEnabledLabel');
}, true);
if (!__.MV3 && __.BUILD !== 'firefox' && CHROME_POPUP_BORDER_BUG) {
  prefs.subscribe('popup.borders', (_key, state) => {
    const style = $root.style;
    if (state) {
      style.cssText += 'left right'.replace(/\S+/g, 'border-$&: 2px solid white !important;');
    } else if (style.borderLeft) {
      style.borderLeft = style.borderRight = '';
    }
  }, true);
}
if (!__.MV3 && CHROME >= 66 && CHROME <= 69) {
  // Chrome 66-69 adds a gap, https://crbug.com/821143
  $root.style.overflow = 'overlay';
}

function onRuntimeMessage(msg) {
  if (!tabUrl) return;
  let ready;
  switch (msg.method) {
    case 'styleAdded':
    case 'styleUpdated':
      if (msg.reason === 'editPreview' || msg.reason === 'editPreviewEnd') return;
      ready = handleUpdate(msg);
      break;
    case 'styleDeleted':
      $id(kStyleIdPrefix + msg.style.id)?.remove();
      break;
  }
  styleFinder.on?.(msg, ready);
}

function onWindowResize() {
  const h = innerHeight;
  if (h > prevHeight
  && document.readyState !== 'loading'
  && document.body.clientHeight > h + 1/*rounding errors in CSS*/) {
    window.off('resize', onWindowResize);
    document.body.style.maxHeight = h + 'px';
  }
  prevHeight = h;
}

async function initPopup({frames, ping0, tab, urlSupported}) {
  const kPopupWidth = 'popupWidth';
  prefs.subscribe([kPopupWidth, 'popupWidthMax'], (key, val) => {
    document.body.style[`${key === kPopupWidth ? 'min' : 'max'}-width`] = MOBILE ? 'none'
      : clamp(val, 200, 800) + 'px';
  }, true);
  setupLivePrefs();

  const elFind = $id('find-styles-btn');
  elFind.on('click', async () => {
    elFind.disabled = true;
    if (!styleFinder.on) await import('./search');
    styleFinder.inline();
  });
  elFind.on('split-btn', async e => {
    if (!styleFinder.on) await import('./search');
    styleFinder.inSite(e);
  });

  Object.assign($id('popup-manage-button'), {
    onclick: Events.openManager,
    oncontextmenu: Events.openManager,
  }).on('split-btn', Events.openManager);

  $id('options-btn').onclick = () => {
    API.openManager({options: true});
    window.close();
  };

  let el = $$('#multi-toggler label')[1];
  el.title = el.title.replace('<', MAC ? '<⌥' : '<Alt-');

  for (el of $$('link[media=print]')) {
    el.removeAttribute('media');
  }

  tabId = tab.id;
  tabUrl = frames[0].url;
  tabUrlSupported = urlSupported;
  frames.forEach(createWriterElement);

  if ($('.match .match:not(.dupe),' + WRITE_FRAME_SEL)) {
    $id('write-style').append(Object.assign(template.writeForFrames, {
      onclick() {
        this.remove();
        $id('write-style').classList.add('expanded');
      },
    }));
  }

  if (ping0) return;

  const isStore = FIREFOX ? tabUrl.startsWith('https://addons.mozilla.org/') :
      OPERA ? tabUrl.startsWith('https://addons.opera.com/') :
        tabUrl.startsWith('https://chrome.google.com/webstore/') ||
        tabUrl.startsWith('https://chromewebstore.google.com/');
  blockPopup();
  if (CHROME && isStore || !urlSupported) {
    return;
  }

  for (let t2 = performance.now() + 1000; performance.now() < t2;) {
    if (await API.pingTab(tabId)) {
      blockPopup(false);
      return;
    }
    if (tab.status === 'complete' && (CHROME || tab.url !== kAboutBlank)) {
      break;
    }
    // FF and some Chrome forks (e.g. CentBrowser) implement tab-on-demand
    // so we'll wait a bit to handle popup being invoked right after switching
    await sleep0();
    tab = await getActiveTab();
  }

  const info = template.unreachableInfo;
  if (CHROME) {
    // Chrome "Allow access to file URLs" in chrome://extensions message
    info.appendChild($create('p', t('unreachableFileHint')));
  } else {
    info.$('label').textContent = t('unreachableAMO');
    const note = [
      !isStore && t('unreachableCSP', t('optionsAdvancedPatchCsp')),
      isStore && t(FIREFOX >= 59 ? 'unreachableAMOHint' : 'unreachableMozSiteHintOldFF'),
      FIREFOX >= 60 && t('unreachableMozSiteHint'),
    ].filter(Boolean).join('\n');
    const renderToken = s => s[0] === '<'
      ? $create('a.copy', {
        tabIndex: 0,
        title: t('copy'),
      }, [
        s.slice(1, -1),
        $create('i.i-copy'),
      ])
      : s;
    const renderLine = line => $create('p', line.split(/(<.*?>)/).map(renderToken));
    const noteNode = $createFragment(note.split('\n').map(renderLine));
    info.appendChild(noteNode);
  }
  // Inaccessible locally hosted file type, e.g. JSON, PDF, etc.
  if (tabUrl.length - tabUrl.lastIndexOf('.') <= 5) {
    info.appendChild($create('p', t('InaccessibleFileHint')));
  }
  document.body.classList.add('unreachable');
  const elInfo = $('.blocked-info');
  if (elInfo) elInfo.replaceWith(info);
  else document.body.prepend(info);
}

function blockPopup(val = true) {
  isBlocked = val;
  $rootCL.toggle('blocked', isBlocked);
}
