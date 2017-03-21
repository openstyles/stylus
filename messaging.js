// keep message channel open for sendResponse in chrome.runtime.onMessage listener
const KEEP_CHANNEL_OPEN = true;
const OWN_ORIGIN = chrome.runtime.getURL('');


function notifyAllTabs(request) {
	// list all tabs including chrome-extension:// which can be ours
	if (request.codeIsUpdated === false && request.style) {
		request = Object.assign({}, request, {
			style: getStyleWithNoCode(request.style)
    });
	}
	chrome.tabs.query({}, tabs => {
		for (let tab of tabs) {
			chrome.tabs.sendMessage(tab.id, request);
			updateIcon(tab);
		}
	});
	// notify all open popups
	const reqPopup = Object.assign({}, request, {method: 'updatePopup', reason: request.method});
	chrome.runtime.sendMessage(reqPopup);
	// notify self: the message no longer is sent to the origin in new Chrome
	if (typeof applyOnMessage !== 'undefined') {
		applyOnMessage(reqPopup);
	}
}


function refreshAllTabs() {
	return new Promise(resolve => {
		// list all tabs including chrome-extension:// which can be ours
		chrome.tabs.query({}, tabs => {
			const lastTab = tabs[tabs.length - 1];
			for (let tab of tabs) {
				getStyles({matchUrl: tab.url, enabled: true, asHash: true}, styles => {
					const message = {method: 'styleReplaceAll', styles};
					if (tab.url == location.href && typeof applyOnMessage !== 'undefined') {
						applyOnMessage(message);
					} else {
						chrome.tabs.sendMessage(tab.id, message);
					}
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
	if (tab.url == 'chrome://newtab/' && tab.status != 'complete') {
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
	getTabRealURL(tab).then(url => {
		// if we have access to this, call directly
		// (Chrome no longer sends messages to the page itself)
		const options = {method: 'getStyles', matchUrl: url, enabled: true, asHash: true};
		if (typeof getStyles != 'undefined') {
			getStyles(options, stylesReceived);
		} else {
			chrome.runtime.sendMessage(options, stylesReceived);
		}
	});

	function stylesReceived(styles) {
		let numStyles = styles.length;
		if (numStyles === undefined) {
			// for 'styles' asHash:true fake the length by counting numeric ids manually
			numStyles = 0;
			for (let id of Object.keys(styles)) {
				numStyles += id.match(/^\d+$/) ? 1 : 0;
			}
		}
		const disableAll = 'disableAll' in styles ? styles.disableAll : prefs.get('disableAll');
		const postfix = disableAll ? 'x' : numStyles == 0 ? 'w' : '';
		chrome.browserAction.setIcon({
			path: {
				// Material Design 2016 new size is 16px
				16: '16' + postfix + '.png', 32: '32' + postfix + '.png',
				// Chromium forks or non-chromium browsers may still use the traditional 19px
				19: '19' + postfix + '.png', 38: '38' + postfix + '.png',
			},
			tabId: tab.id
		}, () => {
			// if the tab was just closed an error may occur,
			// e.g. 'windowPosition' pref updated in edit.js::window.onbeforeunload
			if (!chrome.runtime.lastError) {
				const text = prefs.get('show-badge') && numStyles ? String(numStyles) : '';
				chrome.browserAction.setBadgeText({text, tabId: tab.id});
				chrome.browserAction.setBadgeBackgroundColor({
					color: prefs.get(disableAll ? 'badgeDisabled' : 'badgeNormal')
				});
			}
		});
	}
}


function getActiveTab() {
	return new Promise(resolve =>
		chrome.tabs.query({currentWindow: true, active: true}, tabs =>
			resolve(tabs[0])));
}


function getActiveTabRealURL() {
	return getActiveTab()
		.then(getTabRealURL);
}


function getTabRealURL(tab) {
	return new Promise(resolve => {
		if (tab.url != 'chrome://newtab/') {
			resolve(tab.url);
		} else {
			chrome.webNavigation.getFrame({tabId: tab.id, frameId: 0, processId: -1}, frame => {
				frame && resolve(frame.url);
			});
		}
	});
}


function openURL({url}) {
	url = !url.includes('://') ? chrome.runtime.getURL(url) : url;
	return new Promise(resolve => {
		chrome.tabs.query({currentWindow: true, url}, tabs => {
			// switch to an existing tab with the requested url
			if (tabs.length) {
				chrome.tabs.highlight({
					windowId: tabs[0].windowId,
					tabs: tabs[0].index,
				}, resolve);
			} else {
				// re-use an active new tab page
				getActiveTab().then(tab =>
					tab && tab.url == 'chrome://newtab/'
						? chrome.tabs.update({url}, resolve)
						: chrome.tabs.create({url}, resolve)
				);
			}
		});
	});
}


function onDOMready() {
	if (document.readyState != 'loading') {
		return Promise.resolve();
	}
	return new Promise(resolve => {
		document.addEventListener('DOMContentLoaded', function _() {
			document.removeEventListener('DOMContentLoaded', _);
			resolve();
		});
	});
}


function stringAsRegExp(s, flags) {
	return new RegExp(s.replace(/[{}()\[\]\/\\.+?^$:=*!|]/g, '\\$&'), flags);
}


// expands * as .*?
function wildcardAsRegExp(s, flags) {
	return new RegExp(s.replace(/[{}()\[\]\/\\.+?^$:=!|]/g, '\\$&').replace(/\*/g, '.*?'), flags);
}


var configureCommands = {
	get url () {
		return navigator.userAgent.indexOf('OPR') > -1 ?
			'opera://settings/configureCommands' :
			'chrome://extensions/configureCommands'
	},
	open: () => {
		chrome.tabs.create({
			'url': configureCommands.url
		});
	}
};
