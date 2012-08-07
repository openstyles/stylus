var styleId = null;
var dirty = false;

var appliesToTemplate = document.createElement("li");
appliesToTemplate.innerHTML = '<select name="applies-type" onchange="makeDirty()"><option value="url">' + t("appliesUrlOption") + '</option><option value="url-prefix">' + t("appliesUrlPrefixOption") + '</option><option value="domain">' + t("appliesDomainOption") + '</option><option value="regexp">' + t("appliesRegexpOption") + '</option></select><input name="applies-value" onchange="makeDirty()"><button onclick="removeAppliesTo(event)" class="remove-applies-to">' + t("appliesRemove") + '</button><button class="add-applies-to" onclick="addAppliesTo(this.parentNode.parentNode)">' + t("appliesAdd") + '</button>';

var appliesToEverythingTemplate = document.createElement("li");
appliesToEverythingTemplate.className = "applies-to-everything";
appliesToEverythingTemplate.innerHTML = t("appliesToEverything") + ' <button class="add-applies-to" onclick="addAppliesTo(this.parentNode.parentNode)">' + t("appliesSpecify") + '</button>'

var sectionTemplate = document.createElement("div");
sectionTemplate.innerHTML = '<label>' + t('sectionCode') + '</label><textarea class="code" onchange="makeDirty()"></textarea><br><div class="applies-to"><label>' + t("appliesLabel") + ' <img src="help.png" onclick="showAppliesToHelp()" alt="' + t('helpAlt') + '"></label><ul class="applies-to-list"></ul></div><button class="remove-section" onclick="removeSection(event)">' + t('sectionRemove') + '</button><button class="add-section" onclick="addSection()">' + t('sectionAdd') + '</button>';

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
	} else if (showingEverything || list.hasChildNodes()) {
		e = appliesToTemplate.cloneNode(true);
		if (list.hasChildNodes()) {
			e.querySelector("[name=applies-type]").value = list.querySelector("li:last-child [name='applies-type']").value;
		}
	} else {
		e = appliesToEverythingTemplate.cloneNode(true);
	}
	list.appendChild(e);
}

function addSection(section) {
	var div = sectionTemplate.cloneNode(true);
	var appliesTo = div.querySelector(".applies-to-list");

	if (section) {
		div.querySelector(".code").value = section.code;
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
}

function removeAppliesTo(event) {
	var appliesToList = event.target.parentNode.parentNode;
	appliesToList.removeChild(event.target.parentNode);
	if (!appliesToList.hasChildNodes()) {
		appliesToList.appendChild(appliesToEverythingTemplate);
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
	getStyles({id: id}, function(styles) {
		var style = styles[0];
		styleId = style.id;
		initWithStyle(style);
	});
}

function initWithStyle(style) {
	document.getElementById("name").value = style.name;
	document.getElementById("enabled").checked = style.enabled == "true";
	document.getElementById("heading").innerHTML = t("editStyleHeading");
	initTitle(style);
	// if this was done in response to an update, we need to clear existing sections
	Array.prototype.forEach.call(document.querySelectorAll("#sections > div"), function(div) {
		div.parentNode.removeChild(div);
	});
	style.sections.forEach(addSection);
}

function initTitle(style) {
	document.title = t('editStyleTitle', [style.name]);
}

function validate() {
	var name = document.getElementById("name").value;
	if (name == "") {
		return t("styleMissingName");
	}
	return null;
}

function save() {
	var error = validate();
	if (error) {
		alert(error);
		return;
	}
	var name = document.getElementById("name").value;
	var enabled = document.getElementById("enabled").checked;
	getDatabase(function(db) {
		db.transaction(function (t) {
			var sections = getSections();
			if (styleId == null) {
				t.executeSql('INSERT INTO styles (name, enabled) VALUES (?, ?);', [name, enabled]);
				sections.forEach(function(s) {
					t.executeSql("INSERT INTO sections (style_id, code) SELECT id, ? FROM styles ORDER BY id DESC LIMIT 1;", [s.code]);
					s.meta.forEach(function(m) {
						t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, ?, ? FROM sections ORDER BY id DESC LIMIT 1;", [m[0], m[1]]);
					});
				});
			} else {
				t.executeSql('UPDATE styles SET name = ?, enabled = ? WHERE id = ?;', [name, enabled, styleId]);
				t.executeSql('DELETE FROM section_meta WHERE section_id IN (SELECT id FROM sections WHERE style_id = ?);', [styleId]);
				t.executeSql('DELETE FROM sections WHERE style_id = ?;', [styleId]);
				sections.forEach(function(s) {
					t.executeSql("INSERT INTO sections (style_id, code) VALUES (?, ?);", [styleId, s.code]);
					s.meta.forEach(function(m) {
						t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, ?, ? FROM sections ORDER BY id DESC LIMIT 1;", [m[0], m[1]]);
					});
				});
			}
			dirty = false;
		}, reportError, saveComplete);
	}, reportError);
}

function getSections() {
	var sections = [];
	Array.prototype.forEach.call(document.querySelectorAll("#sections > div"), function(div) {
		var code = div.querySelector(".code").value;
		if (/^\s*$/.test(code)) {
			return;
		}
		sections.push({code: code, meta: getMeta(div)});
	});
	return sections;
}

function getMeta(e) {
	var meta = [];
	Array.prototype.forEach.call(e.querySelector(".applies-to-list").childNodes, function(li) {
		if (li.className == appliesToEverythingTemplate.className) {
			return;
		}
		var a = li.querySelector("[name=applies-type]").value;
		var b = li.querySelector("[name=applies-value]").value;
		if (a && b) {
			meta.push([a, b]);
		}
	});
	return meta;
}

function saveComplete() {
	if (styleId == null) {
		// Load the style id
		getDatabase(function(db) {
			db.readTransaction(function (t) {
				t.executeSql('SELECT id FROM styles ORDER BY id DESC LIMIT 1', [], function(t, r) {
					styleId = r.rows.item(0).id;
					notifySave(true);
				}, reportError)
			}, reportError)
		});
		return;
	}
	notifySave(false);
}

function showMozillaFormat() {
	var w = window.open("data:text/plain;charset=UTF-8," + encodeURIComponent(toMozillaFormat()));
}

function toMozillaFormat() {
	return getSections().map(function(section) {
		if (section.meta.length == 0) {
			return section.code;
		}
		var mf = "@-moz-document ";
		mf += section.meta.map(function(meta) {
			// escape the meta according to css rules
			return meta[0] + "(\"" + meta[1].replace(/\\/g, "\\\\") + "\")";
		}).join(", ");
		return mf + " {\n" + section.code + "\n}";
	}).join("\n\n");
}

function notifySave(newStyle) {
	chrome.extension.sendRequest({name: "styleChanged"});
	getStyles({id: styleId}, function(styles) {
		if (newStyle) {
			notifyAllTabs({name:"styleAdded", style: styles[0]});
			// give the code above a moment before we kill the page
			setTimeout(function() {location.href = "edit.html?id=" + styleId;}, 200);
		} else {
			initTitle(styles[0]);
			notifyAllTabs({name:"styleUpdated", style: styles[0]});
		}
	});
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

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	var installed = document.getElementById("installed");
	switch(request.name) {
		case "styleUpdated":
			initWithStyle(request.style);
			break;
		case "styleDeleted":
			if (styleId == request.id) {
				window.close();
				break;
			}
	}
});
