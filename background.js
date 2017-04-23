/* global getDatabase, getStyles, saveStyle */
'use strict';

// eslint-disable-next-line no-var
var browserCommands, contextMenus;

// *************************************************************************
// preload the DB and report errors
getDatabase(() => {}, (...args) => {
  args.forEach(arg => 'message' in arg && console.error(arg.message));
});

// *************************************************************************
// register all listeners
chrome.runtime.onMessage.addListener(onRuntimeMessage);

chrome.webNavigation.onBeforeNavigate.addListener(data =>
  webNavigationListener(null, data));

chrome.webNavigation.onCommitted.addListener(data =>
  webNavigationListener('styleApply', data));

chrome.webNavigation.onHistoryStateUpdated.addListener(data =>
  webNavigationListener('styleReplaceAll', data));

chrome.webNavigation.onReferenceFragmentUpdated.addListener(data =>
  webNavigationListener('styleReplaceAll', data));

chrome.tabs.onAttached.addListener((tabId, data) => {
  // When an edit page gets attached or detached, remember its state
  // so we can do the same to the next one to open.
  chrome.tabs.get(tabId, tab => {
    if (tab.url.startsWith(URLS.ownOrigin + 'edit.html')) {
      chrome.windows.get(tab.windowId, {populate: true}, win => {
        // If there's only one tab in this window, it's been dragged to new window
        prefs.set('openEditInWindow', win.tabs.length == 1);
      });
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) =>
  contextMenus[info.menuItemId].click(info, tab));

if ('commands' in chrome) {
  // Not available in Firefox - https://bugzilla.mozilla.org/show_bug.cgi?id=1240350
  chrome.commands.onCommand.addListener(command => browserCommands[command]());
}

// *************************************************************************
// Open FAQs page once after installation to guide new users.
// Do not display it in development mode.
if (chrome.runtime.getManifest().update_url) {
  const openHomepageOnInstall = ({reason}) => {
    chrome.runtime.onInstalled.removeListener(openHomepageOnInstall);
    if (reason == 'install') {
      const version = chrome.runtime.getManifest().version;
      setTimeout(openURL, 100, {
        url: `http://add0n.com/stylus.html?version=${version}&type=install`
      });
    }
  };
  // bind for 60 seconds max and auto-unbind if it's a normal run
  chrome.runtime.onInstalled.addListener(openHomepageOnInstall);
  setTimeout(openHomepageOnInstall, 60e3, {reason: 'unbindme'});
}

// *************************************************************************
// reset L10N cache on UI language change
{
  const {browserUIlanguage} = tryJSONparse(localStorage.L10N) || {};
  const UIlang = chrome.i18n.getUILanguage();
  if (browserUIlanguage != UIlang) {
    localStorage.L10N = JSON.stringify({
      browserUIlanguage: UIlang,
    });
  }
}

// *************************************************************************
// browser commands
browserCommands = {
  openManage() {
    openURL({url: '/manage.html'});
  },
  styleDisableAll(info) {
    prefs.set('disableAll', info ? info.checked : !prefs.get('disableAll'));
  },
};

// *************************************************************************
// context menus
contextMenus = Object.assign({
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
},
  // detect browsers without Delete by looking at the end of UA string
  /Vivaldi\/[\d.]+$/.test(navigator.userAgent) ||
  // Chrome and co.
  /Safari\/[\d.]+$/.test(navigator.userAgent) &&
  // skip forks with Flash as those are likely to have the menu e.g. CentBrowser
  !Array.from(navigator.plugins).some(p => p.name == 'Shockwave Flash')
&& {
  'editDeleteText': {
    title: 'editDeleteText',
    contexts: ['editable'],
    documentUrlPatterns: [URLS.ownOrigin + 'edit*'],
    click: (info, tab) => {
      chrome.tabs.sendMessage(tab.id, {method: 'editDeleteText'});
    },
  }
});

for (const id of Object.keys(contextMenus)) {
  const item = Object.assign({id}, contextMenus[id]);
  const prefValue = prefs.readOnlyValues[id];
  const isBoolean = typeof prefValue == 'boolean';
  item.title = chrome.i18n.getMessage(item.title);
  if (isBoolean) {
    item.type = 'checkbox';
    item.checked = prefValue;
  }
  if (!item.contexts) {
    item.contexts = ['browser_action'];
  }
  delete item.click;
  chrome.contextMenus.create(item, ignoreChromeError);
}

prefs.subscribe((id, checked) => {
  chrome.contextMenus.update(id, {checked}, ignoreChromeError);
}, Object.keys(contextMenus));

// *************************************************************************
// [re]inject content scripts
{
  const NTP = 'chrome://newtab/';
  const PING = {method: 'ping'};
  const ALL_URLS = '<all_urls>';
  const contentScripts = chrome.runtime.getManifest().content_scripts;
  // expand * as .*?
  const wildcardAsRegExp = (s, flags) => new RegExp(
      s.replace(/[{}()[\]/\\.+?^$:=!|]/g, '\\$&')
        .replace(/\*/g, '.*?'), flags);
  for (const cs of contentScripts) {
    cs.matches = cs.matches.map(m => (
      m == ALL_URLS ? m : wildcardAsRegExp(m)
    ));
  }

  const injectCS = (cs, tabId) => {
    chrome.tabs.executeScript(tabId, {
      file: cs.js[0],
      runAt: cs.run_at,
      allFrames: cs.all_frames,
      matchAboutBlank: cs.match_about_blank,
    }, ignoreChromeError);
  };

  const pingCS = (cs, {id, url}) => {
    cs.matches.some(match => {
      if ((match == ALL_URLS || url.match(match))
        && (!url.startsWith('chrome') || url == NTP)) {
        chrome.tabs.sendMessage(id, PING, pong => !pong && injectCS(cs, id));
        return true;
      }
    });
  };

  chrome.tabs.query({}, tabs =>
    tabs.forEach(tab =>
      contentScripts.forEach(cs =>
        pingCS(cs, tab))));
}


// *************************************************************************

function webNavigationListener(method, {url, tabId, frameId}) {
  getStyles({matchUrl: url, enabled: true, asHash: true}, styles => {
    if (method && !url.startsWith('chrome:') && tabId >= 0) {
      chrome.tabs.sendMessage(tabId, {
        method,
        // ping own page so it retrieves the styles directly
        styles: url.startsWith(URLS.ownOrigin) ? 'DIY' : styles,
      }, {
        frameId
      });
    }
    // main page frame id is 0
    if (frameId == 0) {
      updateIcon({id: tabId, url}, styles);
    }
  });
}


function updateIcon(tab, styles) {
  if (tab.id < 0) {
    return;
  }
  if (styles) {
    stylesReceived(styles);
    return;
  }
  getTabRealURL(tab).then(url =>
    getStyles({matchUrl: url, enabled: true, asHash: true},
      stylesReceived));

  function stylesReceived(styles) {
    let numStyles = styles.length;
    if (numStyles === undefined) {
      // for 'styles' asHash:true fake the length by counting numeric ids manually
      numStyles = 0;
      for (const id of Object.keys(styles)) {
        numStyles += id.match(/^\d+$/) ? 1 : 0;
      }
    }
    const disableAll = 'disableAll' in styles ? styles.disableAll : prefs.get('disableAll');
    const postfix = disableAll ? 'x' : numStyles == 0 ? 'w' : '';
    const color = prefs.get(disableAll ? 'badgeDisabled' : 'badgeNormal');
    const text = prefs.get('show-badge') && numStyles ? String(numStyles) : '';
    chrome.browserAction.setIcon({
      tabId: tab.id,
      path: {
        // Material Design 2016 new size is 16px
        16: `images/icon/16${postfix}.png`,
        32: `images/icon/32${postfix}.png`,
        // Chromium forks or non-chromium browsers may still use the traditional 19px
        19: `images/icon/19${postfix}.png`,
        38: `images/icon/38${postfix}.png`,
        // TODO: add Edge preferred sizes: 20, 25, 30, 40
      },
    }, () => {
      if (chrome.runtime.lastError) {
        return;
      }
      // Vivaldi bug workaround: setBadgeText must follow setBadgeBackgroundColor
      chrome.browserAction.setBadgeBackgroundColor({color});
      getTab(tab.id).then(() => {
        chrome.browserAction.setBadgeText({text, tabId: tab.id});
      });
    });
  }
}


function onRuntimeMessage(request, sender, sendResponse) {
  switch (request.method) {

    case 'getStyles':
      getStyles(request, sendResponse);
      return KEEP_CHANNEL_OPEN;

    case 'saveStyle':
      saveStyle(request).then(sendResponse);
      return KEEP_CHANNEL_OPEN;

    case 'healthCheck':
      getDatabase(
        () => sendResponse(true),
        () => sendResponse(false));
      return KEEP_CHANNEL_OPEN;

    case 'download':
      download(request.url)
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return KEEP_CHANNEL_OPEN;
  }
}
