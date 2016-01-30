function notifyAllTabs(request) {
	chrome.windows.getAll({populate: true}, function(windows) {
		windows.forEach(function(win) {
			win.tabs.forEach(function(tab) {
				chrome.tabs.sendMessage(tab.id, request);
				updateIcon(tab);
			});
		});
	});
	// notify all open popups
	var reqPopup = shallowMerge({}, request, {method: "updatePopup", reason: request.method});
	chrome.runtime.sendMessage(reqPopup);
}

function updateIcon(tab, styles) {
	// while NTP is still loading only process the request for its main frame with a real url
	// (but when it's loaded we should process style toggle requests from popups, for example)
	if (tab.url == "chrome://newtab/" && tab.status != "complete") {
		return;
	}
	if (styles) {
		// check for not-yet-existing tabs e.g. omnibox instant search
		chrome.tabs.get(tab.id, function() {
			if (!chrome.runtime.lastError) {
				// for 'styles' asHash:true fake the length by counting numeric ids manually
				if (styles.length === undefined) {
					styles.length = 0;
					for (var id in styles) {
						styles.length += id.match(/^\d+$/) ? 1 : 0;
					}
				}
				stylesReceived(styles);
			}
		});
		return;
	}
	getTabRealURL(tab, function(url) {
		// if we have access to this, call directly. a page sending a message to itself doesn't seem to work right.
		if (typeof getStyles != "undefined") {
			getStyles({matchUrl: url, enabled: true}, stylesReceived);
		} else {
			chrome.runtime.sendMessage({method: "getStyles", matchUrl: url, enabled: true}, stylesReceived);
		}
	});

	function stylesReceived(styles) {
		var disableAll = "disableAll" in styles ? styles.disableAll : prefs.get("disableAll");
		var postfix = styles.length == 0 || disableAll ? "w" : "";
		chrome.browserAction.setIcon({
			path: {19: "19" + postfix + ".png", 38: "38" + postfix + ".png"},
			tabId: tab.id
		}, function() {
			// if the tab was just closed an error may occur,
			// e.g. 'windowPosition' pref updated in edit.js::window.onbeforeunload
			if (!chrome.runtime.lastError) {
				var t = prefs.get("show-badge") && styles.length ? ("" + styles.length) : "";
				chrome.browserAction.setBadgeText({text: t, tabId: tab.id});
				chrome.browserAction.setBadgeBackgroundColor({color: disableAll ? "#aaa" : [0, 0, 0, 0]});
			}
		});
		//console.log("Tab " + tab.id + " (" + tab.url + ") badge text set to '" + t + "'.");
	}
}

function getActiveTab(callback) {
	chrome.tabs.query({currentWindow: true, active: true}, function(tabs) {
		callback(tabs[0]);
	});
}

function getActiveTabRealURL(callback) {
	getActiveTab(function(tab) {
		getTabRealURL(tab, callback);
	});
}

function getTabRealURL(tab, callback) {
	if (tab.url != "chrome://newtab/") {
		callback(tab.url);
	} else {
		chrome.webNavigation.getFrame({tabId: tab.id, frameId: 0, processId: -1}, function(frame) {
			frame && callback(frame.url);
		});
	}
}
