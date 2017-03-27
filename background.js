/* global getDatabase, getStyles, reportError */
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
    if (method && !data.url.startsWith('chrome:')) {
      const isOwnPage = data.url.startsWith(OWN_ORIGIN);
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

chrome.runtime.onMessage.addListener(onBackgroundMessage);

function onBackgroundMessage(request, sender, sendResponse) {
  switch (request.method) {

    case 'getStyles':
      var styles = getStyles(request, sendResponse); // eslint-disable-line no-var
      // check if this is a main content frame style enumeration
      if (request.matchUrl && !request.id
      && sender && sender.tab && sender.frameId == 0
      && sender.tab.url == request.matchUrl) {
        updateIcon(sender.tab, styles);
      }
      return KEEP_CHANNEL_OPEN;

    case 'saveStyle':
      saveStyle(request).then(sendResponse);
      return KEEP_CHANNEL_OPEN;

    case 'invalidateCache':
      if (typeof invalidateCache != 'undefined') {
        invalidateCache(false, request);
      }
      break;

    case 'healthCheck':
      getDatabase(
        () => sendResponse(true),
        () => sendResponse(false));
      return KEEP_CHANNEL_OPEN;

    case 'styleDisableAll':
      request = {prefName: 'disableAll', value: request.disableAll};
      // fallthrough to prefChanged

    case 'prefChanged':
      // eslint-disable-next-line no-use-before-define
      if (typeof request.value == 'boolean' && contextMenus[request.prefName]) {
        chrome.contextMenus.update(request.prefName, {checked: request.value});
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

const contextMenus = {
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
  && ![...navigator.plugins].some(p => p.name == 'Shockwave Flash')) {
  contextMenus.editDeleteText = {
    title: 'editDeleteText',
    contexts: ['editable'],
    documentUrlPatterns: [OWN_ORIGIN + 'edit*'],
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
const editFullUrl = OWN_ORIGIN + 'edit.html';
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

var codeMirrorThemes; // eslint-disable-line no-var
getCodeMirrorThemes(themes => (codeMirrorThemes = themes));

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
  const contentScripts = chrome.app.getDetails().content_scripts;
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


function ignoreChromeError() {
  chrome.runtime.lastError; // eslint-disable-line no-unused-expressions
}
