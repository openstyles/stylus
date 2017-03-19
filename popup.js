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
	// reuse event function references
	createStyleElement.events = createStyleElement.events || {
		checkboxClick() {
			enableStyle(getClickedStyleId(), this.checked);
		},
		styleNameClick() {
			this.checkbox.click();
			window.event.preventDefault();
		},
		toggleClick() {
			enableStyle(getClickedStyleId(), this.matches('.enable'));
		},
		deleteClick() {
			doDelete();
    }
	};
	const entry = template.style.cloneNode(true);
	entry.setAttribute('style-id', style.id);
	Object.assign(entry, {
		styleId: style.id,
		className: ['entry', style.enabled ? 'enabled' : 'disabled'].join(' '),
		onmousedown: openEditorOnMiddleclick,
		onauxclick: openEditorOnMiddleclick,
	});

	const checkbox = entry.querySelector('.checker');
	Object.assign(checkbox, {
		id: 'style-' + style.id,
		checked: style.enabled,
		onclick: createStyleElement.events.checkboxClick,
	});

	const editLink = entry.querySelector('.style-edit-link');
	Object.assign(editLink, {
		href: editLink.getAttribute('href') + style.id,
		onclick: openLinkInTabOrWindow,
	});

	const styleName = entry.querySelector('.style-name');
	Object.assign(styleName, {
		htmlFor: 'style-' + style.id,
		onclick: createStyleElement.events.styleNameClick,
	});
	styleName.checkbox = checkbox;
	styleName.appendChild(document.createTextNode(style.name));

	entry.querySelector('.enable').onclick = createStyleElement.events.toggleClick;
	entry.querySelector('.disable').onclick = createStyleElement.events.toggleClick;
	entry.querySelector('.delete').onclick = createStyleElement.events.deleteClick;

	return entry;
}

function doDelete() {
	document.getElementById('confirm').dataset.display = true;
	const id = getClickedStyleId();
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

function getClickedStyleId() {
	const entry = window.event.target.closest('.entry');
	return entry ? entry.styleId : null;
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

function openEditorOnMiddleclick(event) {
	if (event.button != 1) {
		return;
	}
	// open an editor on middleclick
	if (event.target.matches('.entry, .style-name, .style-edit-link')) {
		this.querySelector('.style-edit-link').click();
		event.preventDefault();
		return;
	}
	// prevent the popup being opened in a background tab
	// when an irrelevant link was accidentally clicked
	if (event.target.closest('a')) {
		event.preventDefault();
		return;
	}
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
