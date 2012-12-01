var styleId = null;
var dirty = false;

var appliesToTemplate = document.createElement("li");
appliesToTemplate.innerHTML = '<select name="applies-type" class="applies-type"><option value="url">' + t("appliesUrlOption") + '</option><option value="url-prefix">' + t("appliesUrlPrefixOption") + '</option><option value="domain">' + t("appliesDomainOption") + '</option><option value="regexp">' + t("appliesRegexpOption") + '</option></select><input name="applies-value" class="applies-value"><button class="remove-applies-to">' + t("appliesRemove") + '</button><button class="add-applies-to">' + t("appliesAdd") + '</button>';

var appliesToEverythingTemplate = document.createElement("li");
appliesToEverythingTemplate.className = "applies-to-everything";
appliesToEverythingTemplate.innerHTML = t("appliesToEverything") + ' <button class="add-applies-to">' + t("appliesSpecify") + '</button>'

var sectionTemplate = document.createElement("div");
sectionTemplate.innerHTML = '<label>' + t('sectionCode') + '</label><textarea class="code"></textarea><br><div class="applies-to"><label>' + t("appliesLabel") + ' <img class="applies-to-help" src="help.png" alt="' + t('helpAlt') + '"></label><ul class="applies-to-list"></ul></div><button class="remove-section">' + t('sectionRemove') + '</button><button class="add-section">' + t('sectionAdd') + '</button>';


var editors = [] // array of all CodeMirror instances
// replace given textarea with the CodeMirror editor
function setupCodeMirror(textarea) {
  var cm = CodeMirror.fromTextArea(textarea, {
    mode: 'css',
    lineNumbers: true,
    lineWrapping: true
  });
  editors.push(cm);
}


function makeDirty() {
	dirty = true;
}

window.onbeforeunload = function() {
	return dirty ? t('styleChangesNotSaved') : null;	
}

function addAppliesTo(list, name, value) {
	var showingEverything = list.querySelector(".applies-to-everything") != null;
	// blow away "Everything" if it's there
	if (showingEverything) {
		list.removeChild(list.firstChild);
	}
	var e;
	if (name && value) {
		e = appliesToTemplate.cloneNode(true);
		e.querySelector("[name=applies-type]").value = name;
		e.querySelector("[name=applies-value]").value = value;
		e.querySelector(".remove-applies-to").addEventListener("click", removeAppliesTo, false);
		e.querySelector(".applies-value").addEventListener("change", makeDirty, false);
		e.querySelector(".applies-type").addEventListener("change", makeDirty, false);
	} else if (showingEverything || list.hasChildNodes()) {
		e = appliesToTemplate.cloneNode(true);
		if (list.hasChildNodes()) {
			e.querySelector("[name=applies-type]").value = list.querySelector("li:last-child [name='applies-type']").value;
		}
		e.querySelector(".remove-applies-to").addEventListener("click", removeAppliesTo, false);
		e.querySelector(".applies-value").addEventListener("change", makeDirty, false);
		e.querySelector(".applies-type").addEventListener("change", makeDirty, false);
	} else {
		e = appliesToEverythingTemplate.cloneNode(true);
	}
	e.querySelector(".add-applies-to").addEventListener("click", function() {addAppliesTo(this.parentNode.parentNode)}, false);
	list.appendChild(e);
}

function addSection(section) {
	var div = sectionTemplate.cloneNode(true);
	div.querySelector(".applies-to-help").addEventListener("click", showAppliesToHelp, false);
	div.querySelector(".remove-section").addEventListener("click", removeSection, false);
	div.querySelector(".add-section").addEventListener("click", function() {addSection()}, false);

	var appliesTo = div.querySelector(".applies-to-list");

	if (section) {
		var codeElement = div.querySelector(".code");
		codeElement.value = section.code;
		codeElement.addEventListener("change", makeDirty, false);
		if (section.urls) {
			section.urls.forEach(function(url) {
				addAppliesTo(appliesTo, "url", url);
			});
		}
		if (section.urlPrefixes) {
			section.urlPrefixes.forEach(function(url) {
				addAppliesTo(appliesTo, "url-prefix", url);
			});
		}
		if (section.domains) {
			section.domains.forEach(function(d) {
				addAppliesTo(appliesTo, "domain", d);
			});
		}
		if (section.regexps) {
			section.regexps.forEach(function(d) {
				addAppliesTo(appliesTo, "regexp", d);
			});
		}
		if (!section.urls && !section.urlPrefixes && !section.domains && !section.regexps) {
			addAppliesTo(appliesTo);
		}
	} else {
		addAppliesTo(appliesTo);
	}

	var sections = document.getElementById("sections");
	sections.appendChild(div);
  setupCodeMirror(div.querySelector('.code'));
}

function removeAppliesTo(event) {
	var appliesToList = event.target.parentNode.parentNode;
	appliesToList.removeChild(event.target.parentNode);
	if (!appliesToList.hasChildNodes()) {
		var e = appliesToEverythingTemplate.cloneNode(true);
		e.querySelector(".add-applies-to").addEventListener("click", function() {addAppliesTo(this.parentNode.parentNode)}, false);
		appliesToList.appendChild(e);
	}
	makeDirty();
}

function removeSection(event) {
	event.target.parentNode.parentNode.removeChild(event.target.parentNode);
	makeDirty();
}

window.addEventListener("load", init, false);

function init() {
	tE("sections-help", "helpAlt", "alt");
	var idMatch = /[&\?]id=([0-9]+)/.exec(location.href)
	if (idMatch == null || idMatch.length != 2) { // match should be 2 - one for the whole thing, one for the parentheses
		// This is an add
		addSection();
		document.title = t("addStyleTitle");
		tE("heading", "addStyleTitle");
		return;
	}
	// This is an edit
	var id = idMatch[1];
	chrome.extension.sendMessage({method: "getStyles", id: id}, function(styles) {
		var style = styles[0];
		styleId = style.id;
		initWithStyle(style);
	});
}

function initWithStyle(style) {
	document.getElementById("name").value = style.name;
	document.getElementById("enabled").checked = style.enabled == "true";
	document.getElementById("heading").innerHTML = t("editStyleHeading");
	initTitle(style.name);
	// if this was done in response to an update, we need to clear existing sections
	Array.prototype.forEach.call(document.querySelectorAll("#sections > div"), function(div) {
		div.parentNode.removeChild(div);
	});
	style.sections.forEach(addSection);
}

function initTitle(name) {
	document.title = t('editStyleTitle', [name]);
}

function validate() {
	var name = document.getElementById("name").value;
	if (name == "") {
		return t("styleMissingName");
	}
	// validate the regexps
	if (Array.prototype.some.call(document.querySelectorAll(".applies-to-list"), function(list) {
		return Array.prototype.some.call(list.childNodes, function(li) {
			if (li.className == appliesToEverythingTemplate.className) {
				return false;
			}
			var valueElement = li.querySelector("[name=applies-value]");
			var a = li.querySelector("[name=applies-type]").value;
			var b = valueElement.value;
			if (a && b) {
				if (a == "regexp") {
					try {
						new RegExp(b);
					} catch (ex) {
						valueElement.focus();
						return true;
					}
				}
			}
			return false;
		});
	})) {
		return t("styleBadRegexp");
	}
	return null;
}

function save() {
  // save the contents of the CodeMirror editors back into the textareas
  for(var i=0; i < editors.length; i++) {
    editors[i].save();
  }

	var error = validate();
	if (error) {
		alert(error);
		return;
	}
	var name = document.getElementById("name").value;
	var enabled = document.getElementById("enabled").checked;
	var request = {
		method: "saveStyle",
		id: styleId,
		name: name,
		enabled: enabled,
		sections: getSections(),
	};
	chrome.extension.sendMessage(request, saveComplete);
}

function getSections() {
	var sections = [];
	Array.prototype.forEach.call(document.querySelectorAll("#sections > div"), function(div) {
		var code = div.querySelector(".code").value;
		if (/^\s*$/.test(code)) {
			return;
		}
		var meta = getMeta(div);
		meta.code = code;
		sections.push(meta);
	});
	return sections;
}

function getMeta(e) {
	var meta = {urls: [], urlPrefixes: [], domains: [], regexps: []};
	Array.prototype.forEach.call(e.querySelector(".applies-to-list").childNodes, function(li) {
		if (li.className == appliesToEverythingTemplate.className) {
			return;
		}
		var a = li.querySelector("[name=applies-type]").value;
		var b = li.querySelector("[name=applies-value]").value;
		if (a && b) {
			switch (a) {
				case "url":
					meta.urls.push(b);
					break;
				case "url-prefix":
					meta.urlPrefixes.push(b);
					break;
				case "domain":
					meta.domains.push(b);
					break;
				case "regexp":
					meta.regexps.push(b);
					break;
			}
		}
	});
	return meta;
}

function saveComplete(style) {
	dirty = false;
	// Go from new style URL to edit style URL
	if (location.href.indexOf("id=") == -1) {
		// give the code above a moment before we kill the page
		setTimeout(function() {location.href = "edit.html?id=" + style.id;}, 200);
	} else {
		initTitle(document.getElementById("name").value);
	}
}

function showMozillaFormat() {
	var w = window.open("data:text/plain;charset=UTF-8," + encodeURIComponent(toMozillaFormat()));
}

function toMozillaFormat() {
	return getSections().map(function(section) {
		if (section.urls.length == 0 && section.urlPrefixes.length == 0 && section.domains.length == 0 && section.regexps.length == 0) {
			return section.code;
		}
		var propertyToCss = {"urls": "url", "urlPrefixes": "url-prefix", "domains": "domain", "regexps": "regexp"};
		var cssMds = [];
		for (var i in propertyToCss) {
			cssMds = cssMds.concat(section[i].map(function(v) {
				return propertyToCss[i] + "(\"" + v.replace(/\\/g, "\\\\") + "\")";
			}));
		}
		return "@-moz-document " + cssMds.join(", ") + " {\n" + section.code + "\n}";
	}).join("\n\n");
}

function showSectionHelp() {
	showHelp(t("sectionHelp"));
}

function showAppliesToHelp() {
	showHelp(t("appliesHelp"));
}

function showToMozillaHelp() {
	showHelp(t("styleToMozillaFormatHelp"));
}

function showHelp(text) {
	alert(text);
}

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	var installed = document.getElementById("installed");
	switch(request.name) {
		case "styleUpdated":
			if (styleId == request.id) {
				initWithStyle(request.style);
				dirty = false;
			} 
			break;
		case "styleDeleted":
			if (styleId == request.id) {
				window.close();
				break;
			}
	}
});

tE("name-label", "styleNameLabel");
tE("enabled-label", "styleEnabledLabel");
tE("to-mozilla", "styleToMozillaFormat");
tE("save-button", "styleSaveLabel");
tE("cancel-button", "styleCancelEditLabel");
tE("sections-heading", "styleSectionsTitle");
document.getElementById("name").addEventListener("change", makeDirty, false);
document.getElementById("enabled").addEventListener("change", makeDirty, false);
document.getElementById("to-mozilla").addEventListener("click", showMozillaFormat, false);
document.getElementById("to-mozilla-help").addEventListener("click", showToMozillaHelp, false);
document.getElementById("save-button").addEventListener("click", save, false);
document.getElementById("sections-help").addEventListener("click", showSectionHelp, false);
