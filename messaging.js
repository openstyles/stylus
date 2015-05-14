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
	// use a shallow copy since the original `request` is still being processed
	var reqPopup = {};
	for (var k in request) reqPopup[k] = request[k];
	reqPopup.reason = request.method;
	reqPopup.method = "updatePopup";
	chrome.extension.sendMessage(reqPopup);
}

var defaultBadgeColor = "red";
chrome.browserAction.getBadgeBackgroundColor({}, function(color) {
	defaultBadgeColor = color;
});

function updateIcon(tab, styles) {
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
	// if we have access to this, call directly. a page sending a message to itself doesn't seem to work right.
	if (typeof getStyles != "undefined") {
		getStyles({matchUrl: tab.url, enabled: true}, stylesReceived);
	} else {
		chrome.extension.sendMessage({method: "getStyles", matchUrl: tab.url, enabled: true}, stylesReceived);
	}

	function stylesReceived(styles) {
		var disableAll = prefs.getPref("disableAll");
		var postfix = styles.length == 0 || disableAll ? "w" : "";
		chrome.browserAction.setIcon({
			path: {19: "19" + postfix + ".png", 38: "38" + postfix + ".png"},
			tabId: tab.id
		});
		var t = prefs.getPref("show-badge") && styles.length ? ("" + styles.length) : "";
		chrome.browserAction.setBadgeText({text: t, tabId: tab.id});
		chrome.browserAction.setBadgeBackgroundColor({color: disableAll ? "#aaa" : defaultBadgeColor});
		//console.log("Tab " + tab.id + " (" + tab.url + ") badge text set to '" + t + "'.");
	}
}
