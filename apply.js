var request = {method: "getStyles", matchUrl: location.href, enabled: true, asHash: true};
if (location.href.indexOf(chrome.extension.getURL("")) == 0) {
	chrome.extension.getBackgroundPage().getStyles(request, applyStyles);
} else {
	chrome.extension.sendMessage(request, applyStyles);
}

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	// Also handle special request just for the pop-up
	switch (request.method == "updatePopup" ? request.reason : request.method) {
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
			applyStyles(request.styles);
			break;
		case "styleReplaceAll":
			replaceAll(request.styles, document);
			break;
		case "realURL":
			sendResponse(location.href);
			break;
		case "styleDisableAll":
			disableAll(request.disableAll);
			break;
	}
});

var g_disableAll = false;
function disableAll(disable) {
	if (!disable === !g_disableAll) return;
	g_disableAll = disable;
	disableSheets(g_disableAll, document);

	function disableSheets(disable, doc) {
		Array.prototype.forEach.call(doc.styleSheets, function(stylesheet) {
			if (stylesheet.ownerNode.classList.contains("stylish")) {
				stylesheet.disabled = disable;
			}
		});
		getDynamicIFrames(doc).forEach(function(iframe) {
			disableSheets(disable, iframe.contentDocument);
		});
	}
}

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
	if ("disableAll" in styleHash) {
		disableAll(styleHash.disableAll);
		delete styleHash.disableAll;
	}

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
	doc.documentElement.appendChild(doc.importNode(styleElement, true))
	  .disabled = g_disableAll;
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
	var styles = Array.prototype.slice.call(document.querySelectorAll('STYLE.stylish'));
	if (styles.length == 0) {
		return;
	}
	mutations.filter(function(mutation) {
		return "childList" === mutation.type;
	}).forEach(function(mutation) {
		Array.prototype.filter.call(mutation.addedNodes, function(node) { return "IFRAME" === node.tagName; }).filter(iframeIsDynamic).forEach(function(iframe) {
			var doc = iframe.contentDocument;
			styles.forEach(function(style) {
				doc.documentElement.appendChild(doc.importNode(style, true))
				  .disabled = g_disableAll;
			});
		});
	});
});
iframeObserver.observe(document, {childList: true, subtree: true});