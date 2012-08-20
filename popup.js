var styleTemplate = document.createElement("div");
styleTemplate.innerHTML = "<div class='style-name'></div><div class='actions'><a class='style-edit-link' href='edit.html?id='>" + t('editStyleLabel') + "</a> <a href='#' class='enable'>" + t('enableStyleLabel') + "</a> <a href='#' class='disable'>" + t('disableStyleLabel') + "</a> <a href='#' class='delete'>" + t('deleteStyleLabel') + "</a></div>";

chrome.tabs.getSelected(null, function(tab) {
	chrome.extension.sendMessage({method: "getStyles", matchUrl: tab.url}, showStyles);
	document.querySelector("#find-styles a").href = "http://userstyles.org/styles/browse/all/" + encodeURIComponent(tab.url);
});

function showStyles(styles) {
	var installed = document.getElementById("installed");
	if (styles.length == 0) {
		installed.innerHTML = "<div class='entry' id='no-styles'>" + t('noStylesForSite') + "</div>";
	}
	styles.map(createStyleElement).forEach(function(e) {
		installed.appendChild(e);
	});
}

function createStyleElement(style) {
	var e = styleTemplate.cloneNode(true);
	e.setAttribute("class", "entry " + (style.enabled == "true" ? "enabled" : "disabled"));
	e.setAttribute("style-id", style.id);
	var styleName = e.querySelector(".style-name");
	styleName.appendChild(document.createTextNode(style.name));
	var editLink = e.querySelector(".style-edit-link");
	editLink.setAttribute("href", editLink.getAttribute("href") + style.id);
	editLink.addEventListener("click", openLink, false);
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
	if (!confirm(t('deleteStyleConfirm'))) {
		return;
	}
	var id = getId(event);
	deleteStyle(id);
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

function openLink(event) {
	chrome.tabs.create({url: event.target.href});
	return false;
}

function handleUpdate(style) {
	var installed = document.getElementById("installed");
	installed.replaceChild(createStyleElement(style), installed.querySelector("[style-id='" + style.id + "']"));
}

function handleDelete(id) {
	var installed = document.getElementById("installed");
	installed.removeChild(installed.querySelector("[style-id='" + id + "']"));
}

tE("open-manage-link", "openManage");
tE("find-styles-link", "findStylesForSite");

document.getElementById("find-styles-link").addEventListener("click", openLink, false);

