import '@/js/dom-init';
import {kAboutBlank, kFind, kPopup, kSidebar, kStyleIdPrefix} from '@/js/consts';
import {isSidebar, urlParams} from '@/js/dom';
import {setupLivePrefs} from '@/js/dom-util';
import {sanitizeHtml, template} from '@/js/localization';
import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {isDark, onDarkChanged} from '@/js/themer';
import {CHROME, FIREFOX, MAC, MOBILE, OPERA} from '@/js/ua';
import {clamp, sleep0, t} from '@/js/util';
import {getActiveTab, ignoreChromeError} from '@/js/util-webext';
import {handleUpdate, openStyleFinder, styleFinder} from './events';
import {initHotkeys} from './hotkeys';
import {createWriterElement, reSort, showStyles, updateStateIcon, writerIcon} from './render';
import '@/css/onoffswitch.css';
import './popup.css';

const WRITE_FRAME_SEL = '.match:not([data-frame-id="0"]):not(.dupe)';
const UNREACHABLE = 'unreachable';
export let tabId;
export let tabUrl;
export let tabUrlSupported;
export let isBlocked;
let prevHeight;

(async function init(data, port) {
  data ??= (__.MV3 ? prefs.clientData : await prefs.clientData)[kPopup];
  initPopup(data).then(() => {
    writerIcon.title = t(isBlocked ? 'addStyleLabel' : 'writeStyleFor') + '\n' +
      writerIcon.title;
  });
  showStyles(data);
  initHotkeys(data);
  if (port) // re-entry from connectPort()
    return;
  prevHeight = Math.max(innerHeight, 150);
  if (!MOBILE) window.on('resize', onWindowResize);
  if (urlParams.has(kFind)) openStyleFinder(kSidebar);
  (function connectPort() {
    ignoreChromeError();
    port = chrome.runtime.connect({name: kPopup + ':' + tabId});
    port.onMessage.addListener(init);
    port.onDisconnect.addListener(connectPort);
  })();
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
      reSort([]);
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

/** @param {PopupData} data */
async function initPopup({frames, ping0, tab, urlSupported}) {
  let el;
  if (tabUrl) {
    blockPopup(false);
    $rootCL.remove(UNREACHABLE, 'search-results-shown');
    $('#write-style').textContent = '';
  } else {
    if (MOBILE || isSidebar) {
      $rootCL.add('maximized');
    } else {
      const kPopupWidth = 'popupWidth';
      prefs.subscribe([kPopupWidth, 'popupWidthMax'], (key, val) => {
        document.body.style[`${key === kPopupWidth ? 'min' : 'max'}-width`] =
          clamp(val, 200, 800) + 'px';
      }, true);
    }
    setupLivePrefs();

    el = $$('#toggler label')[1];
    el.title = el.title.replace('<', MAC ? '<⌥' : '<Alt-');

    for (el of $$('link[media=print]')) {
      el.removeAttribute('media');
    }
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

  let info;
  if (CHROME) {
    info = template.unreachableInfo;
  } else {
    info = $('.blocked-info');
    info.$('summary').textContent = t('unreachableAMO');
    const note = [
      !isStore && t('unreachableCSP', t('optionsAdvancedPatchCsp')),
      isStore && t(FIREFOX >= 59 ? 'unreachableAMOHint' : 'unreachableMozSiteHintOldFF'),
      FIREFOX >= 60 && t('unreachableMozSiteHint'),
    ].filter(Boolean).join('\n');
    const p = info.$('p');
    p.textContent = '';
    p.append(sanitizeHtml(note));
  }
  // Chrome "Allow access to file URLs" in chrome://extensions message
  if ((el = tabUrl.startsWith('file:') ? 'unreachableFileHint' : OPERA && 'unreachableOpera')) {
    info.appendChild($tag('p')).append(t(el));
  }
  $rootCL.add(UNREACHABLE);
  $('.blocked-info').replaceWith(info);
}

function blockPopup(val = true) {
  isBlocked = val;
  $rootCL.toggle('blocked', isBlocked);
}
