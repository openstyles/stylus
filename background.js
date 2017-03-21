/* globals openURL, wildcardAsRegExp, KEEP_CHANNEL_OPEN */

// This happens right away, sometimes so fast that the content script isn't even ready. That's
// why the content script also asks for this stuff.
chrome.webNavigation.onCommitted.addListener(webNavigationListener.bind(this, 'styleApply'));
chrome.webNavigation.onHistoryStateUpdated.addListener(webNavigationListener.bind(this, 'styleReplaceAll'));
chrome.webNavigation.onBeforeNavigate.addListener(webNavigationListener.bind(this, null));

function webNavigationListener(method, data) {
	getStyles({matchUrl: data.url, enabled: true, asHash: true}, styles => {
		// we can't inject chrome:// and chrome-extension:// pages except our own
		// that request the styles on their own, so we'll only update the icon
		if (method && !data.url.startsWith('chrome')) {
			chrome.tabs.sendMessage(data.tabId, {method, styles}, {frameId: data.frameId});
		}
		// main page frame id is 0
		if (data.frameId == 0) {
			updateIcon({id: data.tabId, url: data.url}, styles);
		}
	});
}

// catch direct URL hash modifications not invoked via HTML5 history API

var tabUrlHasHash = {};
chrome.tabs.onUpdated.addListener(function(tabId, info, tab) {
	if (info.status == "loading" && info.url) {
		if (info.url.indexOf('#') > 0) {
			tabUrlHasHash[tabId] = true;
		} else if (tabUrlHasHash[tabId]) {
			delete tabUrlHasHash[tabId];
		} else {
			// do nothing since the tab neither had # before nor has # now
			return;
		}
		webNavigationListener("styleReplaceAll", {tabId: tabId, frameId: 0, url: info.url});
	}
});
chrome.tabs.onRemoved.addListener(function(tabId, info) {
	delete tabUrlHasHash[tabId];
});

// messaging

chrome.runtime.onMessage.addListener(onBackgroundMessage);

function onBackgroundMessage(request, sender, sendResponse) {
	switch (request.method) {
		case "getStyles":
			var styles = getStyles(request, sendResponse);
			// check if this is a main content frame style enumeration
			if (request.matchUrl && !request.id
			&& sender && sender.tab && sender.frameId == 0
			&& sender.tab.url == request.matchUrl) {
				updateIcon(sender.tab, styles);
			}
			return KEEP_CHANNEL_OPEN;
		case "saveStyle":
			saveStyle(request).then(sendResponse);
			return KEEP_CHANNEL_OPEN;
		case "invalidateCache":
			if (typeof invalidateCache != "undefined") {
				invalidateCache(false, request);
			}
			break;
		case "healthCheck":
			getDatabase(function() { sendResponse(true); }, function() { sendResponse(false); });
			return KEEP_CHANNEL_OPEN;
		case "openURL":
			openURL(request);
			break;
		case "styleDisableAll":
			// fallthru to prefChanged
			request = {prefName: 'disableAll', value: request.disableAll};
		case "prefChanged":
			if (typeof request.value == 'boolean' && contextMenus[request.prefName]) {
				chrome.contextMenus.update(request.prefName, {checked: request.value});
			}
			break;
		case "refreshAllTabs":
			refreshAllTabs().then(sendResponse);
			return KEEP_CHANNEL_OPEN;
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
var editFullUrl = chrome.extension.getURL("edit.html");
chrome.tabs.onAttached.addListener(function(tabId, data) {
	chrome.tabs.get(tabId, function(tabData) {
		if (tabData.url.indexOf(editFullUrl) == 0) {
			chrome.windows.get(tabData.windowId, {populate: true}, function(win) {
				// If there's only one tab in this window, it's been dragged to new window
				prefs.set("openEditInWindow", win.tabs.length == 1);
			});
		}
	});
});

var codeMirrorThemes;
getCodeMirrorThemes(function(themes) {
	 codeMirrorThemes = themes;
});

// do not use prefs.get('version', null) as it might not yet be available
chrome.storage.local.get('version', prefs => {
	// Open FAQs page once after installation to guide new users,
	// https://github.com/schomery/stylish-chrome/issues/22#issuecomment-279936160
	if (!prefs.version) {
		// do not display the FAQs page in development mode
		if ('update_url' in chrome.runtime.getManifest()) {
			let version = chrome.runtime.getManifest().version;
			chrome.storage.local.set({
				version
			}, () => {
				window.setTimeout(() => {
					chrome.tabs.create({
						url: 'http://add0n.com/stylus.html?version=' + version + '&type=install'
					});
				}, 3000);
			})
		}
	}
});

injectContentScripts();

function injectContentScripts() {
	const contentScripts = chrome.app.getDetails().content_scripts;
	for (let cs of contentScripts) {
		cs.matches = cs.matches.map(m => m == '<all_urls>' ? m : wildcardAsRegExp(m));
	}
	chrome.tabs.query({url: '*://*/*'}, tabs => {
		for (let tab of tabs) {
			for (let cs of contentScripts) {
				for (let m of cs.matches) {
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
	chrome.runtime.lastError;
}
