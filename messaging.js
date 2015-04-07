function notifyAllTabs(request) {
	chrome.windows.getAll({populate: true}, function(windows) {
		windows.forEach(function(win) {
			win.tabs.forEach(function(tab) {
				chrome.tabs.sendMessage(tab.id, request);
				updateBadgeText(tab);
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

function updateBadgeText(tab) {
	if (prefs.getPref("show-badge")) {
		function stylesReceived(styles) {
			var t = getBadgeText(styles);
			console.log("Tab " + tab.id + " (" + tab.url + ") badge text set to '" + t + "'.");
			chrome.browserAction.setBadgeText({text: t, tabId: tab.id});
		}
		// if we have access to this, call directly. a page sending a message to itself doesn't seem to work right.
		if (typeof getStyles != "undefined") {
			getStyles({matchUrl: tab.url, enabled: true}, stylesReceived);
		} else {
			chrome.extension.sendMessage({method: "getStyles", matchUrl: tab.url, enabled: true}, stylesReceived);
		}
	} else {
		chrome.browserAction.setBadgeText({text: "", tabId: tab.id});
	}
}

function getBadgeText(styles) {
	return styles.length == 0 ? "" : ("" + styles.length);
}
