chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	switch (request.name) {
		case "getStylesToApply":
			getStyles({matchUrl: sender.tab.url, enabled: true}, function(r) {
				sendResponse(r);
				chrome.browserAction.setBadgeText({text: getBadgeText(r), tabId: sender.tab.id});
			});
			break;
		case "getStylesForUrl":
			getStyles({url: request.url}, sendResponse);
			break;
		case "getStyleApplies":
			sendResponse(styleAppliesToUrl(request.style, request.url));
			break;
		case "saveFromJSON":
			saveFromJSON(request.json);
			sendResponse({});
			break;
		case "styleChanged":
			cachedGlobalStyleIds = null;
			cachedStyles = [];
			sendResponse({});
			break;
		case "getCachedStyles":
			sendResponse(cachedStyles);
			break;
		case "cacheStyles":
			request.styles.forEach(function(style) {
				cachedStyles[style.id] = style;
			});
			break;
	}
});

function styleAppliesToUrl(style, url) {
	style.sections = style.sections.filter(function(section) {
		return sectionAppliesToUrl(section, url);
	});
	if (style.sections.size == 0) {
		return null;
	}
	return style;
}

function sectionAppliesToUrl(section, url) {
	if (!section.urls && !section.domains && !section.urlPrefixes && !section.regexps) {
		console.log(section + " is global");
		return true;
	}
	if (section.urls && section.urls.indexOf(url) != -1) {
		console.log(section + " applies to " + url + " due to URL rules");
		return true;
	}
	if (section.urlPrefixes && section.urlPrefixes.some(function(prefix) {
		return url.indexOf(prefix) == 0;
	})) {
		console.log(section + " applies to " + url + " due to URL prefix rules");
		return true;
	}
	if (section.domains && getDomains(url).some(function(domain) {
		return section.domains.indexOf(domain) != -1;
	})) {
		console.log(section + " applies due to " + url + " due to domain rules");
		return true;
	}
	if (section.regexps && section.regexps.some(function(regexp) {
		return (new RegExp(regexp)).test(url);
	})) {
		console.log(section + " applies to " + url + " due to regexp rules");
		return true;
	}
	console.log(section + " does not apply due to " + url);
	return false;
}

var cachedGlobalStyleIds = null;
var cachedStyles = [];
var background = true;
