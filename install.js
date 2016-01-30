chrome.runtime.sendMessage({method: "getStyles", url: getMeta("stylish-id-url") || location.href}, function(response) {
	if (response.length == 0) {
		sendEvent("styleCanBeInstalledChrome");
	} else {
		var installedStyle = response[0];
		// maybe an update is needed
		// use the md5 if available
		var md5Url = getMeta("stylish-md5-url");
		if (md5Url && installedStyle.md5Url && installedStyle.originalMd5) {
			getResource(md5Url, function(md5) {
				if (md5 == installedStyle.originalMd5) {
					sendEvent("styleAlreadyInstalledChrome", {updateUrl: installedStyle.updateUrl});
				} else {
					sendEvent("styleCanBeUpdatedChrome", {updateUrl: installedStyle.updateUrl});
				}
			});
		} else {
			getResource(getMeta("stylish-code-chrome"), function(code) {
				// this would indicate a failure (a style with settings?).
				if (code == null) {
					sendEvent("styleCanBeUpdatedChrome", {updateUrl: installedStyle.updateUrl});
				}
				var json = JSON.parse(code);
				if (json.sections.length == installedStyle.sections.length) {
					if (json.sections.every(function(section) {
						return installedStyle.sections.some(function(installedSection) {
							return sectionsAreEqual(section, installedSection);
						});
					})) {
						// everything's the same
						sendEvent("styleAlreadyInstalledChrome", {updateUrl: installedStyle.updateUrl});
						return;
					};
				}
				sendEvent("styleCanBeUpdatedChrome", {updateUrl: installedStyle.updateUrl});
			});
		}
	}
});

function sectionsAreEqual(a, b) {
	if (a.code != b.code) {
		return false;
	}
	return ["urls", "urlPrefixes", "domains", "regexps"].every(function(attribute) {
		return arraysAreEqual(a[attribute], b[attribute]);
	});
}

function arraysAreEqual(a, b) {
	// treat empty array and undefined as equivalent
	if (typeof a == "undefined")
		return (typeof b == "undefined") || (b.length == 0);
	if (typeof b == "undefined")
		return (typeof a == "undefined") || (a.length == 0);
	if (a.length != b.length) {
		return false;
	}
	return a.every(function(entry) {
		return b.indexOf(entry) != -1;
	});
}

function sendEvent(type, data) {
	if (typeof data == "undefined") {
		data = null;
	}
	var stylishEvent = new CustomEvent(type, {detail: data});
	document.dispatchEvent(stylishEvent);
}

document.addEventListener("stylishInstallChrome", function() {
	getResource(getMeta("stylish-description"), function(name) {
		if (confirm(chrome.i18n.getMessage('styleInstall', [name]))) {
			getResource(getMeta("stylish-code-chrome"), function(code) {
				// check for old style json
				var json = JSON.parse(code);
				json.method = "saveStyle";
				chrome.runtime.sendMessage(json, function(response) {
					sendEvent("styleInstalledChrome");
				});
			});
			getResource(getMeta("stylish-install-ping-url-chrome"));
		}	
	});
}, false);

document.addEventListener("stylishUpdateChrome", function() {
	chrome.runtime.sendMessage({method: "getStyles", url: getMeta("stylish-id-url") || location.href}, function(response) {
		var style = response[0];
		if (confirm(chrome.i18n.getMessage('styleUpdate', [style.name]))) {
			getResource(getMeta("stylish-code-chrome"), function(code) {
				var json = JSON.parse(code);
				json.method = "saveStyle";
				json.id = style.id;
				chrome.runtime.sendMessage(json, function() {
					sendEvent("styleInstalledChrome");
				});
			});
		}	
	});
}, false);


function getMeta(name) {
	var e = document.querySelector("link[rel='" + name + "']");
	return e ? e.getAttribute("href") : null;
}

function getResource(url, callback) {
	if (url.indexOf("#") == 0) {
		if (callback) {
			callback(document.getElementById(url.substring(1)).innerText);
		}
		return;
	}
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function() {
		if (xhr.readyState == 4 && callback) {
			if (xhr.status >= 400) {
				callback(null);
			} else {
		    callback(xhr.responseText);
			}
		}
	}
	if (url.length > 2000) {
		var parts = url.split("?");
		xhr.open("POST", parts[0], true);
		xhr.setRequestHeader("Content-type","application/x-www-form-urlencoded");
		xhr.send(parts[1]);
	} else {
		xhr.open("GET", url, true);
		xhr.send();
	}
}
