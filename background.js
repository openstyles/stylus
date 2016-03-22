var frameIdMessageable;
runTryCatch(function() {
	chrome.tabs.sendMessage(0, {}, {frameId: 0}, function() {
		var clearError = chrome.runtime.lastError;
		frameIdMessageable = true;
	});
});

// This happens right away, sometimes so fast that the content script isn't even ready. That's
// why the content script also asks for this stuff.
chrome.webNavigation.onCommitted.addListener(webNavigationListener.bind(this, "styleApply"));
// Not supported in Firefox - https://bugzilla.mozilla.org/show_bug.cgi?id=1239349
if ("onHistoryStateUpdated" in chrome.webNavigation) {
	chrome.webNavigation.onHistoryStateUpdated.addListener(webNavigationListener.bind(this, "styleReplaceAll"));
}
chrome.webNavigation.onBeforeNavigate.addListener(webNavigationListener.bind(this, null));
function webNavigationListener(method, data) {
	// Until Chrome 41, we can't target a frame with a message
	// (https://developer.chrome.com/extensions/tabs#method-sendMessage)
	// so a style affecting a page with an iframe will affect the main page as well.
	// Skip doing this for frames in pre-41 to prevent page flicker.
	if (data.frameId != 0 && !frameIdMessageable) {
		return;
	}
	getStyles({matchUrl: data.url, enabled: true, asHash: true}, function(styleHash) {
		if (method) {
			chrome.tabs.sendMessage(data.tabId, {method: method, styles: styleHash},
				frameIdMessageable ? {frameId: data.frameId} : undefined);
		}
		if (data.frameId == 0) {
			updateIcon({id: data.tabId, url: data.url}, styleHash);
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

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.method) {
		case "getStyles":
			var styles = getStyles(request, sendResponse);
			// check if this is a main content frame style enumeration
			if (request.matchUrl && !request.id
			&& sender && sender.tab && sender.frameId == 0
			&& sender.tab.url == request.matchUrl) {
				updateIcon(sender.tab, styles);
			}
			return true;
		case "saveStyle":
			saveStyle(request, sendResponse);
			return true;
		case "invalidateCache":
			if (typeof invalidateCache != "undefined") {
				invalidateCache(false);
			}
			break;
		case "healthCheck":
			getDatabase(function() { sendResponse(true); }, function() { sendResponse(false); });
			return true;
		case "openURL":
			openURL(request);
			break;
		case "styleDisableAll":
			chrome.contextMenus.update("disableAll", {checked: request.disableAll});
			break;
		case "prefChanged":
			if (request.prefName == "show-badge") {
				chrome.contextMenus.update("show-badge", {checked: request.value});
			}
			break;
	}
});


// Not available in Firefox - https://bugzilla.mozilla.org/show_bug.cgi?id=1240350
if ("commands" in chrome) {
	chrome.commands.onCommand.addListener(function(command) {
		switch (command) {
			case "openManage":
				openURL({url: chrome.extension.getURL("manage.html")});
				break;
			case "styleDisableAll":
				disableAllStylesToggle();
				chrome.contextMenus.update("disableAll", {checked: prefs.get("disableAll")});
				break;
		}
	});
}

// contextMenus API is present in ancient Chrome but it throws an exception
// upon encountering the unsupported parameter value "browser_action", so we have to catch it.
runTryCatch(function() {
	chrome.contextMenus.create({
		id: "show-badge", title: chrome.i18n.getMessage("menuShowBadge"),
		type: "checkbox", contexts: ["browser_action"], checked: prefs.get("show-badge")
	}, function() { var clearError = chrome.runtime.lastError });
	chrome.contextMenus.create({
		id: "disableAll", title: chrome.i18n.getMessage("disableAllStyles"),
		type: "checkbox", contexts: ["browser_action"], checked: prefs.get("disableAll")
	}, function() { var clearError = chrome.runtime.lastError });
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
	if (info.menuItemId == "disableAll") {
		disableAllStylesToggle(info.checked);
	} else {
		prefs.set(info.menuItemId, info.checked);
	}
});

function disableAllStylesToggle(newState) {
	if (newState === undefined || newState === null) {
		newState = !prefs.get("disableAll");
	}
	prefs.set("disableAll", newState);
}

// Get the DB so that any first run actions will be performed immediately when the background page loads.
getDatabase(function() {}, reportError);

// When an edit page gets attached or detached, remember its state so we can do the same to the next one to open.
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

function openURL(options) {
	chrome.tabs.query({currentWindow: true, url: options.url}, function(tabs) {
		// switch to an existing tab with the requested url
		if (tabs.length) {
			chrome.tabs.highlight({windowId: tabs[0].windowId, tabs: tabs[0].index}, function (window) {});
		} else {
			delete options.method;
			getActiveTab(function(tab) {
				// re-use an active new tab page
				chrome.tabs[tab.url == "chrome://newtab/" ? "update" : "create"](options);
			});
		}
	});
}

var codeMirrorThemes;
getCodeMirrorThemes(function(themes) {
	 codeMirrorThemes = themes;
});
