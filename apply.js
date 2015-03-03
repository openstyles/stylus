chrome.extension.sendMessage({method: "getStyles", matchUrl: location.href, enabled: true, asHash: true}, applyStyles);

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.method) {
		case "styleDeleted":
			removeStyle(request.id, document);
			break;
		case "styleUpdated":
			removeStyle(request.style.id, document);
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
			break;
		case "styleReplaceAll":
			replaceAll(request.styles);
			break;
	}
});

function removeStyle(id, doc) {
	var e = doc.getElementById("stylish-" + id);
	if (e) {
		e.parentNode.removeChild(e);
	}
	getDynamicIFrames(doc).forEach(function(iframe) {
		removeStyle(id, iframe.contentDocument);
	});
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
	addStyleElement(styleElement, document);
}

function addStyleElement(styleElement, doc) {
	doc.documentElement.appendChild(doc.importNode(styleElement, true));
	getDynamicIFrames(doc).forEach(function(iframe) {
		addStyleElement(styleElement, iframe.contentDocument);
	});
}

// Only dynamic iframes get the parent document's styles. Other ones should get styles based on their own URLs.
function getDynamicIFrames(doc) {
	return Array.prototype.filter.call(doc.getElementsByTagName('iframe'), iframeIsDynamic);
}

function iframeIsDynamic(f) {
	var href;
	try {
		href = f.contentDocument.location.href;
	} catch (ex) {
		// Cross-origin, so it's not a dynamic iframe
		return false;
	}
	return href == document.location.href || href.indexOf("about:") == 0;
}

function replaceAll(newStyles, doc) {
	Array.prototype.forEach.call(doc.querySelectorAll("STYLE.stylish"), function(style) {
		style.parentNode.removeChild(style);
	});
	applyStyles(newStyles);
	getDynamicIFrames(doc).forEach(function(iframe) {
		replaceAll(newStyles, iframe.contentDocument);
	});
}

// Observe dynamic IFRAMEs being added
var iframeObserver = new MutationObserver(function(mutations) {
	var styles = document.querySelectorAll('STYLE.stylish');
	if (styles.length == 0) {
		return;
	}
	mutations.filter(function(mutation) {
		return "childList" === mutation.type;
	}).forEach(function(mutation) {
		Array.prototype.filter.call(mutation.addedNodes, function(node) { return "IFRAME" === node.tagName; }).filter(iframeIsDynamic).forEach(function(iframe) {
			var doc = f.contentDocument;
			styles.forEach(function(style) {
				document.documentElement.appendChild(doc.importNode(style, true));
			});
		});
	});
});
iframeObserver.observe(document, {childList: true, subtree: true});
