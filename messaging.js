function notifyAllTabs(request) {
	chrome.windows.getAll({populate: true}, function(windows) {
		windows.forEach(function(win) {
			win.tabs.forEach(function(tab) {
				chrome.tabs.sendRequest(tab.id, request);
				updateBadgeText(tab);
			});
		});
	});
}

function updateBadgeText(tab) {
	getStyles({matchUrl: tab.url}, function(styles) {
		chrome.browserAction.setBadgeText({text: getBadgeText(styles), tabId: tab.id});
	});
}

function getBadgeText(styles) {
	var e = styles.filter(function(style) { return style.enabled == "true"; });
	return e.length == 0 ? "" : ("" + e.length);
}
