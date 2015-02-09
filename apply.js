chrome.extension.sendMessage({method: "getStyles", matchUrl: location.href, enabled: true, asHash: true}, applyStyles);

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.method) {
		case "styleDeleted":
			removeStyle(request.id);
			break;
		case "styleUpdated":
			removeStyle(request.style.id);
			//fallthrough
		case "styleAdded":
			if (request.style.enabled == "true") {
				chrome.extension.sendMessage({method: "getStyles", matchUrl: location.href, enabled: true, id: request.style.id, asHash: true}, applyStyles);
			}
			break;
		case "styleApply":
			for (var styleId in request.styles) {
				applySections(styleId, request.styles[styleId]);
			}
	}
});

function removeStyle(id) {
	var e = document.getElementById("stylish-" + id);
	if (e) {
		e.parentNode.removeChild(e);
	}
}

function applyStyles(styleHash) {
	for (var styleId in styleHash) {
		applySections(styleId, styleHash[styleId]);
	}
}

function applySections(styleId, sections) {
	var styleElement = document.getElementById("stylish-" + styleId);
	// Already there.
	if (styleElement) {
		return;
	}
	if (document.documentElement instanceof SVGSVGElement) {
		// SVG document, make an SVG style element.
		styleElement = document.createElementNS("http://www.w3.org/2000/svg", "style");
	} else {
		// This will make an HTML style element. If there's SVG embedded in an HTML document, this works on the SVG too.
		styleElement = document.createElement("style");
	}
	styleElement.setAttribute("id", "stylish-" + styleId);
	styleElement.setAttribute("class", "stylish");
	styleElement.setAttribute("type", "text/css");
	styleElement.appendChild(document.createTextNode(sections.map(function(section) {
		return section.code;
	}).join("\n")));
	document.documentElement.appendChild(styleElement);
}
