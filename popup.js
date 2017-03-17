/* globals configureCommands */

var writeStyleTemplate = document.createElement("a");
writeStyleTemplate.className = "write-style-link";

var installed = document.getElementById("installed");

if (!prefs.get("popup.stylesFirst")) {
	document.body.insertBefore(document.querySelector("body > .actions"), installed);
}

getActiveTabRealURL(updatePopUp);

function updatePopUp(url) {
	var urlWillWork = /^(file|http|https|ftps?|chrome\-extension):/.exec(url);
	if (!urlWillWork) {
		document.body.classList.add("blocked");
		document.getElementById("unavailable").style.display = "flex";
		return;
	}

	getStylesSafe({matchUrl: url}).then(showStyles);

	document.querySelector("#find-styles a").href = "https://userstyles.org/styles/browse/all/" + encodeURIComponent("file" === urlWillWork[1] ? "file:" : url);

	// Write new style links
	var writeStyleLinks = [],
	    container = document.createElement('span');
	container.id = "match";

	// For this URL
	var urlLink = writeStyleTemplate.cloneNode(true);
	urlLink.href = "edit.html?url-prefix=" + encodeURIComponent(url);
	urlLink.appendChild(document.createTextNode( // switchable; default="this&nbsp;URL"
		!prefs.get("popup.breadcrumbs.usePath")
		? t("writeStyleForURL").replace(/ /g, "\u00a0")
		: /\/\/[^/]+\/(.*)/.exec(url)[1]
	));
	urlLink.title = "url-prefix(\"$\")".replace("$", url);
	writeStyleLinks.push(urlLink);
	document.querySelector("#write-style").appendChild(urlLink)
	if (prefs.get("popup.breadcrumbs")) { // switchable; default=enabled
		urlLink.addEventListener("mouseenter", function(event) { this.parentNode.classList.add("url()") }, false);
		urlLink.addEventListener("focus", function(event) { this.parentNode.classList.add("url()") }, false);
		urlLink.addEventListener("mouseleave", function(event) { this.parentNode.classList.remove("url()") }, false);
		urlLink.addEventListener("blur", function(event) { this.parentNode.classList.remove("url()") }, false);
	}

	// For domain
	var domains = getDomains(url)
	domains.forEach(function(domain) {
		// Don't include TLD
		if (domains.length > 1 && domain.indexOf(".") == -1) {
			return;
		}
		var domainLink = writeStyleTemplate.cloneNode(true);
		domainLink.href = "edit.html?domain=" + encodeURIComponent(domain);
		domainLink.appendChild(document.createTextNode(domain));
		domainLink.title = "domain(\"$\")".replace("$", domain);
		domainLink.setAttribute("subdomain", domain.substring(0, domain.indexOf(".")));
		writeStyleLinks.push(domainLink);
	});

	var writeStyle = document.querySelector("#write-style");
	writeStyleLinks.forEach(function(link, index) {
		link.addEventListener("click", openLinkInTabOrWindow, false);
		container.appendChild(link);
	});
	if (prefs.get("popup.breadcrumbs")) {
		container.classList.add("breadcrumbs");
		container.appendChild(container.removeChild(container.firstChild));
	}
	writeStyle.appendChild(container);
}

function showStyles(styles) {
	var enabledFirst = prefs.get("popup.enabledFirst");
	styles.sort(function(a, b) {
		if (enabledFirst && a.enabled !== b.enabled) return !(a.enabled < b.enabled) ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	if (styles.length == 0) {
		installed.innerHTML = "<div class='entry' id='no-styles'>" + t('noStylesForSite') + "</div>";
	}
	styles.map(createStyleElement).forEach(function(e) {
		installed.appendChild(e);
	});
	// force Chrome to resize the popup
	document.body.style.height = '10px';
	document.documentElement.style.height = '10px';
}

function createStyleElement(style) {
	var e = template.style.cloneNode(true);
	var checkbox = e.querySelector(".checker");
	checkbox.id = "style-" + style.id;
	checkbox.checked = style.enabled;

	e.setAttribute("class", "entry " + (style.enabled ? "enabled" : "disabled"));
	e.setAttribute("style-id", style.id);
	var styleName = e.querySelector(".style-name");
	styleName.appendChild(document.createTextNode(style.name));
	styleName.setAttribute("for", "style-" + style.id);
	styleName.checkbox = checkbox;
	var editLink = e.querySelector(".style-edit-link");
	editLink.setAttribute("href", editLink.getAttribute("href") + style.id);
	editLink.addEventListener("click", openLinkInTabOrWindow, false);

	styleName.addEventListener("click", function() { this.checkbox.click(); event.preventDefault(); });
	// clicking the checkbox will toggle it, and this will run after that happens
	checkbox.addEventListener("click", function() { enable(event, event.target.checked); }, false);
	e.querySelector(".enable").addEventListener("click", function() { enable(event, true); }, false);
	e.querySelector(".disable").addEventListener("click", function() { enable(event, false); }, false);

	e.querySelector(".delete").addEventListener("click", function() { doDelete(event, false); }, false);
	return e;
}

function enable(event, enabled) {
	var id = getId(event);
	enableStyle(id, enabled);
}

function doDelete() {
	document.getElementById('confirm').dataset.display = true;
	let id = getId(event);
	document.querySelector('#confirm b').textContent =
		document.querySelector(`[style-id="${id}"] label`).textContent;
	document.getElementById('confirm').dataset.id = id;

}
document.getElementById('confirm').addEventListener('click', e => {
	let cmd = e.target.dataset.cmd;
	if (cmd === 'ok') {
		deleteStyle(document.getElementById('confirm').dataset.id, () => {
			// update view with 'No styles installed for this site' message
			if (document.getElementById('installed').children.length === 0) {
				showStyles([]);
			}
		});
	}
	//
	if (cmd) {
		document.getElementById('confirm').dataset.display = false;
	}
});

function getBrowser() {
	if (navigator.userAgent.indexOf("OPR") > -1) {
		return "Opera";
	}
	return "Chrome";
}

function getId(event) {
	var e = event.target;
	while (e) {
		if (e.hasAttribute("style-id")) {
			return e.getAttribute("style-id");
		}
		e = e.parentNode;
	}
	return null;
}

function openLinkInTabOrWindow(event) {
	event.preventDefault();
	if (prefs.get("openEditInWindow", false)) {
		var options = {url: event.target.href}
		var wp = prefs.get("windowPosition", {});
		for (var k in wp) options[k] = wp[k];
		chrome.windows.create(options);
	} else {
		openLink(event);
	}
	close();
}

function openLink(event) {
	event.preventDefault();
	chrome.runtime.sendMessage({method: "openURL", url: event.target.href});
	close();
}

function handleUpdate(style) {
	var styleElement = installed.querySelector("[style-id='" + style.id + "']");
	if (styleElement) {
		installed.replaceChild(createStyleElement(style), styleElement);
	} else {
		getActiveTabRealURL(function(url) {
			if (chrome.extension.getBackgroundPage().getApplicableSections(style, url).length) {
				// a new style for the current url is installed
				document.getElementById("unavailable").style.display = "none";
				installed.appendChild(createStyleElement(style));
			}
		});
	}
}

function handleDelete(id) {
	var styleElement = installed.querySelector("[style-id='" + id + "']");
	if (styleElement) {
		installed.removeChild(styleElement);
	}
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.method == "updatePopup") {
		switch (request.reason) {
			case "styleAdded":
			case "styleUpdated":
				handleUpdate(request.style);
				break;
			case "styleDeleted":
				handleDelete(request.id);
				break;
		}
	}
});

["find-styles-link"].forEach(function(id) {
	document.getElementById(id).addEventListener("click", openLink, false);
});

document.getElementById("disableAll").addEventListener("change", function(event) {
	installed.classList.toggle("disabled", prefs.get("disableAll"));
});
setupLivePrefs(["disableAll"]);

document.querySelector('#popup-manage-button').addEventListener("click", function() {
    window.open(chrome.runtime.getURL('manage.html'));
});

document.querySelector('#popup-options-button').addEventListener("click", function() {
    if (chrome.runtime.openOptionsPage) {
        // Supported (Chrome 42+)
        chrome.runtime.openOptionsPage();
    } else {
        // Fallback
        window.open(chrome.runtime.getURL('options/index.html'));
    }
});

document.querySelector('#popup-shortcuts-button').addEventListener("click", configureCommands.open);

// popup width
document.body.style.width = (localStorage.getItem('popupWidth') || '246') + 'px';
