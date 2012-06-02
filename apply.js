chrome.extension.sendRequest({name:"getStylesToApply"}, function(response) {
	response.forEach(applyStyle);
});

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	switch(request.name) {
		case "styleDeleted":
			removeStyle(request.id);
			sendResponse({});
			break;
		case "styleUpdated":
			removeStyle(request.style.id);
			//fallthrough
		case "styleAdded":
			if (request.style.enabled == "true") {
				chrome.extension.sendRequest({name: "getStyleApplies", style: request.style, url: location.href}, function(response) {
					if (response) {
						applyStyle(response);
					}
				});
			}
			sendResponse({});
	}
});

function removeStyle(id) {
	var e = document.getElementById("stylish-" + id);
	if (e) {
		e.parentNode.removeChild(e);
	}
}

function applyStyle(s) {
	var style = document.createElement("style");
	style.setAttribute("id", "stylish-" + s.id);
	style.setAttribute("class", "stylish");
	style.setAttribute("type", "text/css");
	style.appendChild(document.createTextNode(s.sections.filter(filterSection).map(function(section) {
		return section.code;
	}).join("\n")));
	if (document.head) {
		document.head.appendChild(style);
	} else {
		document.documentElement.appendChild(style);
	}
}

function filterSection(section) {
	// global
	if (!section.urls && !section.urlPrefixes && !section.domains && !section.regexps) {
		return true;
	}
	if (section.urls && section.urls.some(function(url) {
			return url == location.href;
	})) {
		return true;
	}
	if (section.urlPrefixes && section.urlPrefixes.some(function(urlPrefix) {
		return location.href.indexOf(urlPrefix) == 0;
	})) {
		return true;
	}
	if (section.domains) {
		var currentDomains = getDomains(location.href);
		if (section.domains.some(function(domain) {
			return currentDomains.indexOf(domain) >= 0;
		})) {
			return true;
		}
	}
	return section.regexps && section.regexps.some(function(regexp) {
		return (new RegExp(regexp)).test(location.href);
	});
}

function getDomains(url) {
	var d = /.*?:\/*([^\/]+)/.exec(url)[1];
	var domains = [d];
	while (d.indexOf(".") != -1) {
		d = d.substring(d.indexOf(".") + 1);
		domains.push(d);
	}
	return domains;
}
