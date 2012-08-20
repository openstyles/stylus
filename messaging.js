function notifyAllTabs(request) {
	chrome.windows.getAll({populate: true}, function(windows) {
		windows.forEach(function(win) {
			win.tabs.forEach(function(tab) {
				chrome.tabs.sendMessage(tab.id, request);
				updateBadgeText(tab);
			});
		});
	});
}

function updateBadgeText(tab) {
	chrome.extension.sendMessage({method: "getStyles", matchUrl: tab.url, enabled: true}, function(styles) {
		var t = getBadgeText(styles);
		console.log("Tab " + tab.id + " (" + tab.url + ") badge text set to '" + t + "'.");
		chrome.browserAction.setBadgeText({text: t, tabId: tab.id});
	});
}

function getBadgeText(styles) {
	return styles.length == 0 ? "" : ("" + styles.length);
}
