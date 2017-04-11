/* global getDatabase, getStyles, saveStyle, reportError, invalidateCache */
'use strict';

chrome.webNavigation.onBeforeNavigate.addListener(data => {
  webNavigationListener(null, data);
});

chrome.webNavigation.onCommitted.addListener(data => {
  webNavigationListener('styleApply', data);
});

chrome.webNavigation.onHistoryStateUpdated.addListener(data => {
  webNavigationListener('styleReplaceAll', data);
});

chrome.webNavigation.onReferenceFragmentUpdated.addListener(data => {
  webNavigationListener('styleReplaceAll', data);
});


function webNavigationListener(method, data) {
  getStyles({matchUrl: data.url, enabled: true, asHash: true}, styles => {
    // we can't inject chrome:// and chrome-extension:// pages
    // so we'll only inform our page of the change
    // and it'll retrieve the styles directly
    if (method && !data.url.startsWith('chrome:') && data.tabId >= 0) {
      const isOwnPage = data.url.startsWith(URLS.ownOrigin);
      chrome.tabs.sendMessage(
        data.tabId,
        {method, styles: isOwnPage ? 'DIY' : styles},
        {frameId: data.frameId});
    }
    // main page frame id is 0
    if (data.frameId == 0) {
      updateIcon({id: data.tabId, url: data.url}, styles);
    }
  });
}

// messaging

chrome.runtime.onMessage.addListener(onRuntimeMessage);

function onRuntimeMessage(request, sender, sendResponse) {
  switch (request.method) {

    case 'getStyles':
      getStyles(request, styles => {
        sendResponse(styles);
        // check if this is a main content frame style enumeration
        if (request.matchUrl && !request.id
        && sender && sender.tab && sender.frameId == 0
        && sender.tab.url == request.matchUrl) {
          updateIcon(sender.tab, styles);
        }
      });
      return KEEP_CHANNEL_OPEN;

    case 'saveStyle':
      saveStyle(request).then(sendResponse);
      return KEEP_CHANNEL_OPEN;

    case 'invalidateCache':
      invalidateCache(false, request);
      break;

    case 'healthCheck':
      getDatabase(
        () => sendResponse(true),
        () => sendResponse(false));
      return KEEP_CHANNEL_OPEN;

    case 'prefChanged':
      for (var prefName in request.prefs) { // eslint-disable-line no-var
        if (prefName in contextMenus) { // eslint-disable-line no-use-before-define
          chrome.contextMenus.update(prefName, {
            checked: request.prefs[prefName],
          }, ignoreChromeError);
        }
      }
      break;
  }
}

// commands (global hotkeys)

const browserCommands = {
  openManage() {
    openURL({url: '/manage.html'});
  },
  styleDisableAll(state) {
    prefs.set('disableAll',
      typeof state == 'boolean' ? state : !prefs.get('disableAll'));
  },
};
// Not available in Firefox - https://bugzilla.mozilla.org/show_bug.cgi?id=1240350
if ('commands' in chrome) {
  chrome.commands.onCommand.addListener(command => browserCommands[command]());
}

// context menus
// eslint-disable-next-line no-var
var contextMenus = {
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
};

// detect browsers without Delete by looking at the end of UA string
// Google Chrome: Safari/#
// but skip CentBrowser: Safari/# plus Shockwave Flash in plugins
// Vivaldi: Vivaldi/#
if (/Vivaldi\/[\d.]+$/.test(navigator.userAgent)
  || /Safari\/[\d.]+$/.test(navigator.userAgent)
  && !Array.from(navigator.plugins).some(p => p.name == 'Shockwave Flash')) {
  contextMenus.editDeleteText = {
    title: 'editDeleteText',
    contexts: ['editable'],
    documentUrlPatterns: [URLS.ownOrigin + 'edit*'],
    click: (info, tab) => {
      chrome.tabs.sendMessage(tab.id, {method: 'editDeleteText'});
    },
  };
}

chrome.contextMenus.onClicked.addListener((info, tab) =>
  contextMenus[info.menuItemId].click(info, tab));

Object.keys(contextMenus).forEach(id => {
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
});


// Get the DB so that any first run actions will be performed immediately
// when the background page loads.
getDatabase(function() {}, reportError);

// When an edit page gets attached or detached, remember its state
// so we can do the same to the next one to open.
const editFullUrl = URLS.ownOrigin + 'edit.html';
chrome.tabs.onAttached.addListener((tabId, data) => {
  chrome.tabs.get(tabId, tabData => {
    if (tabData.url.startsWith(editFullUrl)) {
      chrome.windows.get(tabData.windowId, {populate: true}, win => {
        // If there's only one tab in this window, it's been dragged to new window
        prefs.set('openEditInWindow', win.tabs.length == 1);
      });
    }
  });
});

// eslint-disable-next-line no-var
var codeMirrorThemes;
getCodeMirrorThemes().then(themes => {
  codeMirrorThemes = themes;
});

// do not use prefs.get('version', null) as it might not yet be available
chrome.storage.local.get('version', prefs => {
  // Open FAQs page once after installation to guide new users,
  // https://github.com/schomery/stylish-chrome/issues/22#issuecomment-279936160
  if (!prefs.version) {
    // do not display the FAQs page in development mode
    if ('update_url' in chrome.runtime.getManifest()) {
      const version = chrome.runtime.getManifest().version;
      chrome.storage.local.set({version}, () => {
        window.setTimeout(() => {
          chrome.tabs.create({
            url: `http://add0n.com/stylus.html?version=${version}&type=install`
          });
        }, 3000);
      });
    }
  }
});


injectContentScripts();

function injectContentScripts() {
  // expand * as .*?
  const wildcardAsRegExp = (s, flags) =>
    new RegExp(s.replace(/[{}()[\]/\\.+?^$:=!|]/g, '\\$&').replace(/\*/g, '.*?'), flags);
  const contentScripts = chrome.runtime.getManifest().content_scripts;
  for (const cs of contentScripts) {
    cs.matches = cs.matches.map(m => (
      m == '<all_urls>' ? m : wildcardAsRegExp(m)
    ));
  }
  // also inject in chrome://newtab/ page
  chrome.tabs.query({url: '*://*/*'}, tabs => {
    for (const tab of tabs) {
      for (const cs of contentScripts) {
        for (const m of cs.matches) {
          if (m == '<all_urls>' || tab.url.match(m)) {
            chrome.tabs.sendMessage(tab.id, {method: 'ping'}, pong => {
              if (!pong) {
                chrome.tabs.executeScript(tab.id, {
                  file: cs.js[0],
                  runAt: cs.run_at,
                  allFrames: cs.all_frames,
                }, ignoreChromeError);
              }
            });
            // inject the content script just once
            break;
          }
        }
      }
    }
  });
}


function refreshAllTabs() {
  return new Promise(resolve => {
    // list all tabs including chrome-extension:// which can be ours
    chrome.tabs.query({}, tabs => {
      const lastTab = tabs[tabs.length - 1];
      for (const tab of tabs) {
        getStyles({matchUrl: tab.url, enabled: true, asHash: true}, styles => {
          const message = {method: 'styleReplaceAll', styles};
          chrome.tabs.sendMessage(tab.id, message);
          updateIcon(tab, styles);
          if (tab == lastTab) {
            resolve();
          }
        });
      }
    });
  });
}


function updateIcon(tab, styles) {
  // while NTP is still loading only process the request for its main frame with a real url
  // (but when it's loaded we should process style toggle requests from popups, for example)
  const isNTP = tab.url == 'chrome://newtab/';
  if (isNTP && tab.status != 'complete' || tab.id < 0) {
    return;
  }
  if (styles) {
    // check for not-yet-existing tabs e.g. omnibox instant search
    chrome.tabs.get(tab.id, () => {
      if (!chrome.runtime.lastError) {
        stylesReceived(styles);
      }
    });
    return;
  }
  if (isNTP) {
    getTabRealURL(tab).then(url =>
      getStyles({matchUrl: url, enabled: true, asHash: true}, stylesReceived));
  } else {
    getStyles({matchUrl: tab.url, enabled: true, asHash: true}, stylesReceived);
  }

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
      if (!chrome.runtime.lastError) {
        // Vivaldi bug workaround: setBadgeText must follow setBadgeBackgroundColor
        chrome.browserAction.setBadgeBackgroundColor({color});
        chrome.browserAction.setBadgeText({text, tabId: tab.id});
      }
    });
  }
}


function getCodeMirrorThemes() {
  if (!chrome.runtime.getPackageDirectoryEntry) {
    return Promise.resolve([
      '3024-day',
      '3024-night',
      'abcdef',
      'ambiance',
      'ambiance-mobile',
      'base16-dark',
      'base16-light',
      'bespin',
      'blackboard',
      'cobalt',
      'colorforth',
      'dracula',
      'duotone-dark',
      'duotone-light',
      'eclipse',
      'elegant',
      'erlang-dark',
      'hopscotch',
      'icecoder',
      'isotope',
      'lesser-dark',
      'liquibyte',
      'material',
      'mbo',
      'mdn-like',
      'midnight',
      'monokai',
      'neat',
      'neo',
      'night',
      'panda-syntax',
      'paraiso-dark',
      'paraiso-light',
      'pastel-on-dark',
      'railscasts',
      'rubyblue',
      'seti',
      'solarized',
      'the-matrix',
      'tomorrow-night-bright',
      'tomorrow-night-eighties',
      'ttcn',
      'twilight',
      'vibrant-ink',
      'xq-dark',
      'xq-light',
      'yeti',
      'zenburn',
    ]);
  }
  return new Promise(resolve => {
    chrome.runtime.getPackageDirectoryEntry(rootDir => {
      rootDir.getDirectory('codemirror/theme', {create: false}, themeDir => {
        themeDir.createReader().readEntries(entries => {
          resolve([
            chrome.i18n.getMessage('defaultTheme')
          ].concat(
            entries.filter(entry => entry.isFile)
              .sort((a, b) => (a.name < b.name ? -1 : 1))
              .map(entry => entry.name.replace(/\.css$/, ''))
          ));
        });
      });
    });
  });
}
