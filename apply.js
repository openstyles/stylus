chrome.extension.sendMessage({method: "getStyles", matchUrl: location.href, enabled: true, updateBadge: window == window.top}, function(response) {
	response.forEach(applyStyle);
});

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	switch(request.name) {
		case "styleDeleted":
			removeStyle(request.id);
			break;
		case "styleUpdated":
			removeStyle(request.style.id);
			//fallthrough
		case "styleAdded":
			if (request.style.enabled == "true") {
				applyStyle(request.style);
			}
	}
});

function removeStyle(id) {
	var e = document.getElementById("stylish-" + id);
	if (e) {
		e.parentNode.removeChild(e);
	}
}

function applyStyle(s) {
	chrome.extension.sendMessage({method: "getStyleApplies", style: s, url: location.href}, function(response) {
		if (response && response.length > 0) {
			applySections(s, response);
		}
	});
}

function applySections(style, sections) {
	var styleElement = document.createElement("style");
	styleElement.setAttribute("id", "stylish-" + style.id);
	styleElement.setAttribute("class", "stylish");
	styleElement.setAttribute("type", "text/css");
	styleElement.appendChild(document.createTextNode(sections.map(function(section) {
		return section.code;
	}).join("\n")));
	if (document.head) {
		document.head.appendChild(styleElement);
	} else {
		document.documentElement.appendChild(styleElement);
	}
}
