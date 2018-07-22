/*
global dbExec getStyles saveStyle deleteStyle
global handleCssTransitionBug detectSloppyRegexps
global openEditor
global styleViaAPI
global loadScript
global usercss
*/
'use strict';

window.API_METHODS = Object.assign(window.API_METHODS || {}, {

  getStyles,
  saveStyle,
  deleteStyle,

  download(msg) {
    delete msg.method;
    return download(msg.url, msg);
  },
  parseCss({code}) {
    return usercss.invokeWorker({action: 'parse', code});
  },
  getPrefs: prefs.getAll,
  healthCheck: () => dbExec().then(() => true),

  detectSloppyRegexps,
  openEditor,
  updateIcon,

  // exposed for stuff that requires followup sendMessage() like popup::openSettings
  // that would fail otherwise if another extension forced the tab to open
  // in the foreground thus auto-closing the popup (in Chrome)
  openURL,

  closeTab: (msg, sender, respond) => {
    chrome.tabs.remove(msg.tabId || sender.tab.id, () => {
      if (chrome.runtime.lastError && msg.tabId !== sender.tab.id) {
        respond(new Error(chrome.runtime.lastError.message));
      }
    });
    return KEEP_CHANNEL_OPEN;
  },

  optionsCustomizeHotkeys() {
    return browser.runtime.openOptionsPage()
      .then(() => new Promise(resolve => setTimeout(resolve, 100)))
      .then(() => sendMessage({method: 'optionsCustomizeHotkeys'}));
  },
});

// eslint-disable-next-line no-var
var browserCommands, contextMenus;

// *************************************************************************
// register all listeners
chrome.runtime.onMessage.addListener(onRuntimeMessage);

{
  const listener =
    URLS.chromeProtectsNTP
      ? webNavigationListenerChrome
      : webNavigationListener;

  chrome.webNavigation.onBeforeNavigate.addListener(data =>
    listener(null, data));

  chrome.webNavigation.onCommitted.addListener(data =>
    listener('styleApply', data));

  chrome.webNavigation.onHistoryStateUpdated.addListener(data =>
    listener('styleReplaceAll', data));

  chrome.webNavigation.onReferenceFragmentUpdated.addListener(data =>
    listener('styleReplaceAll', data));

  if (FIREFOX) {
    // FF applies page CSP even to content scripts, https://bugzil.la/1267027
    chrome.webNavigation.onCommitted.addListener(webNavUsercssInstallerFF, {
      url: [
        {hostSuffix: '.githubusercontent.com', urlSuffix: '.user.css'},
        {hostSuffix: '.githubusercontent.com', urlSuffix: '.user.styl'},
      ]
    });
    // FF misses some about:blank iframes so we inject our content script explicitly
    chrome.webNavigation.onDOMContentLoaded.addListener(webNavIframeHelperFF, {
      url: [
        {urlEquals: 'about:blank'},
      ]
    });
  }
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) =>
    contextMenus[info.menuItemId].click(info, tab));
}

if (chrome.commands) {
  // Not available in Firefox - https://bugzilla.mozilla.org/show_bug.cgi?id=1240350
  chrome.commands.onCommand.addListener(command => browserCommands[command]());
}

if (!chrome.browserAction ||
    !['setIcon', 'setBadgeBackgroundColor', 'setBadgeText'].every(name => chrome.browserAction[name])) {
  window.updateIcon = () => {};
}

const tabIcons = new Map();
chrome.tabs.onRemoved.addListener(tabId => tabIcons.delete(tabId));
chrome.tabs.onReplaced.addListener((added, removed) => tabIcons.delete(removed));

// *************************************************************************
// set the default icon displayed after a tab is created until webNavigation kicks in
prefs.subscribe(['iconset'], () =>
  updateIcon({
    tab: {id: undefined},
    styles: {},
  }));

// *************************************************************************
{
  const onInstall = ({reason}) => {
    chrome.runtime.onInstalled.removeListener(onInstall);
    if (reason === 'update') {
      // translations may change
      localStorage.L10N = JSON.stringify({
        browserUIlanguage: chrome.i18n.getUILanguage(),
      });
      // themes may change
      delete localStorage.codeMirrorThemes;
    }
  };
  // bind for 60 seconds max and auto-unbind if it's a normal run
  chrome.runtime.onInstalled.addListener(onInstall);
  setTimeout(onInstall, 60e3, {reason: 'unbindme'});
}

// *************************************************************************
// browser commands
browserCommands = {
  openManage() {
    openURL({url: 'manage.html'});
  },
  styleDisableAll(info) {
    prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
};

// *************************************************************************
// context menus
contextMenus = {
  'show-badge': {
    title: 'menuShowBadge',
    click: info => prefs.set(info.menuItemId, info.checked),
  },
  'disableAll': {
    title: 'disableAllStyles',
    click: browserCommands.styleDisableAll,
  },
  'open-manager': {
    title: 'openStylesManager',
    click: browserCommands.openManage,
  },
  'editor.contextDelete': {
    presentIf: () => !FIREFOX && prefs.get('editor.contextDelete'),
    title: 'editDeleteText',
    type: 'normal',
    contexts: ['editable'],
    documentUrlPatterns: [URLS.ownOrigin + 'edit*'],
    click: (info, tab) => {
      sendMessage({tabId: tab.id, method: 'editDeleteText'});
    },
  }
};

if (chrome.contextMenus) {
  const createContextMenus = ids => {
    for (const id of ids) {
      let item = contextMenus[id];
      if (item.presentIf && !item.presentIf()) {
        continue;
      }
      item = Object.assign({id}, item);
      delete item.presentIf;
      const prefValue = prefs.readOnlyValues[id];
      item.title = chrome.i18n.getMessage(item.title);
      if (!item.type && typeof prefValue === 'boolean') {
        item.type = 'checkbox';
        item.checked = prefValue;
      }
      if (!item.contexts) {
        item.contexts = ['browser_action'];
      }
      delete item.click;
      chrome.contextMenus.create(item, ignoreChromeError);
    }
  };

  // circumvent the bug with disabling check marks in Chrome 62-64
  const toggleCheckmark = CHROME >= 3172 && CHROME <= 3288 ?
    (id => chrome.contextMenus.remove(id, () => createContextMenus([id]) + ignoreChromeError())) :
    ((id, checked) => chrome.contextMenus.update(id, {checked}, ignoreChromeError));

  const togglePresence = (id, checked) => {
    if (checked) {
      createContextMenus([id]);
    } else {
      chrome.contextMenus.remove(id, ignoreChromeError);
    }
  };

  const keys = Object.keys(contextMenus);
  prefs.subscribe(keys.filter(id => typeof prefs.readOnlyValues[id] === 'boolean'), toggleCheckmark);
  prefs.subscribe(keys.filter(id => contextMenus[id].presentIf), togglePresence);
  createContextMenus(keys);
}

// *************************************************************************
// [re]inject content scripts
window.addEventListener('storageReady', function _() {
  window.removeEventListener('storageReady', _);

  updateIcon({
    tab: {id: undefined},
    styles: {},
  });

  // Firefox injects content script automatically
  if (FIREFOX) return;

  const NTP = 'chrome://newtab/';
  const ALL_URLS = '<all_urls>';
  const contentScripts = chrome.runtime.getManifest().content_scripts;
  // expand * as .*?
  const wildcardAsRegExp = (s, flags) => new RegExp(
      s.replace(/[{}()[\]/\\.+?^$:=!|]/g, '\\$&')
        .replace(/\*/g, '.*?'), flags);
  for (const cs of contentScripts) {
    cs.matches = cs.matches.map(m => (
      m === ALL_URLS ? m : wildcardAsRegExp(m)
    ));
  }

  const injectCS = (cs, tabId) => {
    ignoreChromeError();
    chrome.tabs.executeScript(tabId, {
      file: cs.js[0],
      runAt: cs.run_at,
      allFrames: cs.all_frames,
      matchAboutBlank: cs.match_about_blank,
    }, ignoreChromeError);
  };

  const pingCS = (cs, {id, url}) => {
    const maybeInject = pong => !pong && injectCS(cs, id);
    cs.matches.some(match => {
      if ((match === ALL_URLS || url.match(match)) &&
          (!url.startsWith('chrome') || url === NTP)) {
        sendMessage({method: 'ping', tabId: id}, maybeInject);
        return true;
      }
    });
  };

  queryTabs().then(tabs =>
    tabs.forEach(tab => {
      // skip lazy-loaded aka unloaded tabs that seem to start loading on message in FF
      if (tab.width) {
        contentScripts.forEach(cs =>
          setTimeout(pingCS, 0, cs, tab));
      }
    }));
});

// *************************************************************************
{
  const getStylesForFrame = (msg, sender) => {
    const stylesTask = getStyles(msg);
    if (!sender || !sender.frameId) return stylesTask;
    return Promise.all([
      stylesTask,
      getTab(sender.tab.id),
    ]).then(([styles, tab]) => {
      if (tab) styles.exposeIframes = tab.url.replace(/(\/\/[^/]*).*/, '$1');
      return styles;
    });
  };
  const updateAPI = (_, enabled) => {
    window.API_METHODS.getStylesForFrame = enabled ? getStylesForFrame : getStyles;
  };
  prefs.subscribe(['exposeIframes'], updateAPI);
  updateAPI(null, prefs.readOnlyValues.exposeIframes);
}

// *************************************************************************

function webNavigationListener(method, {url, tabId, frameId}) {
  Promise.all([
    getStyles({matchUrl: url, asHash: true}),
    frameId && prefs.readOnlyValues.exposeIframes && getTab(tabId),
  ]).then(([styles, tab]) => {
    if (method && URLS.supported(url) && tabId >= 0) {
      if (method === 'styleApply') {
        handleCssTransitionBug({tabId, frameId, url, styles});
      }
      if (tab) styles.exposeIframes = tab.url.replace(/(\/\/[^/]*).*/, '$1');
      sendMessage({
        tabId,
        frameId,
        method,
        // ping own page so it retrieves the styles directly
        styles: url.startsWith(URLS.ownOrigin) ? 'DIY' : styles,
      });
    }
    // main page frame id is 0
    if (frameId === 0) {
      tabIcons.delete(tabId);
      updateIcon({tab: {id: tabId, url}, styles});
    }
  });
}


function webNavigationListenerChrome(method, data) {
  // Chrome 61.0.3161+ doesn't run content scripts on NTP
  if (
    !data.url.startsWith('https://www.google.') ||
    !data.url.includes('/_/chrome/newtab?')
  ) {
    webNavigationListener(method, data);
    return;
  }
  getTab(data.tabId).then(tab => {
    if (tab.url === 'chrome://newtab/') {
      data.url = tab.url;
    }
    webNavigationListener(method, data);
  });
}


function webNavUsercssInstallerFF(data) {
  const {tabId} = data;
  Promise.all([
    sendMessage({tabId, method: 'ping'}),
    // we need tab index to open the installer next to the original one
    // and also to skip the double-invocation in FF which assigns tab url later
    getTab(tabId),
  ]).then(([pong, tab]) => {
    if (pong !== true && tab.url !== 'about:blank') {
      window.API_METHODS.installUsercss({direct: true}, {tab});
    }
  });
}


function webNavIframeHelperFF({tabId, frameId}) {
  if (!frameId) return;
  sendMessage({method: 'ping', tabId, frameId}, pong => {
    ignoreChromeError();
    if (pong) return;
    chrome.tabs.executeScript(tabId, {
      frameId,
      file: '/content/apply.js',
      matchAboutBlank: true,
    }, ignoreChromeError);
  });
}


function updateIcon({tab, styles}) {
  if (tab.id < 0) {
    return;
  }
  if (URLS.chromeProtectsNTP && tab.url === 'chrome://newtab/') {
    styles = {};
  }
  if (styles) {
    stylesReceived(styles);
    return;
  }
  getTabRealURL(tab)
    .then(url => getStyles({matchUrl: url, asHash: true, omitCode: true}))
    .then(stylesReceived);

  function getLength(styles) {
    const keys = Object.keys(styles || {});
    // Using "included" because styles may not include the psuedo-section added by the
    // filterStylesInternal function
    return String(keys.filter(key => styles[key][0] ? styles[key][0].included : false).length);
  }

  function stylesReceived(styles) {
    const disableAll = 'disableAll' in styles ? styles.disableAll : prefs.get('disableAll');
    const postfix = disableAll ? 'x' : !styles.length ? 'w' : '';
    const color = prefs.get(disableAll ? 'badgeDisabled' : 'badgeNormal');
    const text = prefs.get('show-badge') && styles.length ? getLength(styles) : '';
    const iconset = ['', 'light/'][prefs.get('iconset')] || '';
    let tabIcon = tabIcons.get(tab.id);
    if (!tabIcon) tabIcons.set(tab.id, (tabIcon = {}));

    if (tabIcon.iconType !== iconset + postfix) {
      tabIcon.iconType = iconset + postfix;
      const sizes = FIREFOX || CHROME >= 2883 && !VIVALDI ? [16, 32] : [19, 38];
      const usePath = tabIcons.get('usePath');
      Promise.all(sizes.map(size => {
        const src = `/images/icon/${iconset}${size}${postfix}.png`;
        return usePath ? src : tabIcons.get(src) || loadIcon(src);
      })).then(data => {
        const imageKey = typeof data[0] === 'string' ? 'path' : 'imageData';
        const imageData = {};
        sizes.forEach((size, i) => (imageData[size] = data[i]));
        chrome.browserAction.setIcon({
          tabId: tab.id,
          [imageKey]: imageData,
        }, ignoreChromeError);
      });
    }
    if (tab.id === undefined) return;

    let defaultIcon = tabIcons.get(undefined);
    if (!defaultIcon) tabIcons.set(undefined, (defaultIcon = {}));
    if (defaultIcon.color !== color) {
      defaultIcon.color = color;
      chrome.browserAction.setBadgeBackgroundColor({color});
    }

    if (tabIcon.text === text) return;
    tabIcon.text = text;
    try {
      // Chrome supports the callback since 67.0.3381.0, see https://crbug.com/451320
      chrome.browserAction.setBadgeText({text, tabId: tab.id}, ignoreChromeError);
    } catch (e) {
      setTimeout(() => {
        getTab(tab.id).then(realTab => {
          // skip pre-rendered tabs
          if (realTab.index >= 0) {
            chrome.browserAction.setBadgeText({text, tabId: tab.id});
          }
        });
      });
    }
  }

  function loadIcon(src, resolve) {
    if (!resolve) return new Promise(resolve => loadIcon(src, resolve));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const w = canvas.width = img.width;
      const h = canvas.height = img.height;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      // Firefox breaks Canvas when privacy.resistFingerprinting=true, https://bugzil.la/1412961
      let usePath = tabIcons.get('usePath');
      if (usePath === undefined) {
        usePath = data.data.every(b => b === 255);
        tabIcons.set('usePath', usePath);
      }
      if (usePath) {
        resolve(src);
        return;
      }
      tabIcons.set(src, data);
      resolve(data);
    };
  }
}


function onRuntimeMessage(msg, sender, sendResponse) {
  const fn = window.API_METHODS[msg.method];
  if (!fn) return;

  // wrap 'Error' object instance as {__ERROR__: message},
  // which will be unwrapped by sendMessage,
  // and prevent exceptions on sending to a closed tab
  const respond = data =>
    tryCatch(sendResponse,
      data instanceof Error ? {__ERROR__: data.message} : data);

  const result = fn(msg, sender, respond);
  if (result instanceof Promise) {
    result
      .catch(e => ({__ERROR__: e instanceof Error ? e.message : e}))
      .then(respond);
    return KEEP_CHANNEL_OPEN;
  } else if (result === KEEP_CHANNEL_OPEN) {
    return KEEP_CHANNEL_OPEN;
  } else if (result !== undefined) {
    respond(result);
  }
}
