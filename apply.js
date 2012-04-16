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
	if (section.urls) {
		var found = false;
		section.urls.forEach(function(url) {
			if (url == location.href) {
				found = true;
				return;
			}
		});
		if (found) {
			return true;
		}
	}
	if (section.urlPrefixes) {
		var found = false;
		section.urlPrefixes.forEach(function(urlPrefix) {
			if (location.href.indexOf(urlPrefix) == 0) {
				found = true;
				return;
			}
		});
		if (found) {
			return true;
		}
	}
	if (section.domains) {
		var found = false;
		var currentDomains = getDomains(location.href);
		section.domains.forEach(function(domain) {
			if (currentDomains.indexOf(domain) >= 0) {
				found = true;
				return;
			}
		});
		if (found) {
			return true;
		}
	}
	if (section.regexps) {
		var found = false;
		section.regexps.forEach(function(regexp) {
			if ((new RegExp(regexp)).test(location.href)) {
				found = true;
				return;
			}
		});
		if (found) {
			return true;
		}
	}
	return false;
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
