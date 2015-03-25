"use strict";

var styleId = null;
var dirty = {};       // only the actually dirty items here
var editors = [];     // array of all CodeMirror instances
var lockScroll;       // temporary focus-jump-on-click fix, TODO: revert c084ea3 once CM is updated
var isSeparateWindow; // used currrently to determine if the window size/pos should be remembered

// direct & reverse mapping of @-moz-document keywords and internal property names
var propertyToCss = {urls: "url", urlPrefixes: "url-prefix", domains: "domain", regexps: "regexp"};
var CssToProperty = {"url": "urls", "url-prefix": "urlPrefixes", "domain": "domains", "regexp": "regexps"};

// templates
var appliesToTemplate = document.createElement("li");
appliesToTemplate.innerHTML = '<select name="applies-type" class="applies-type style-contributor"><option value="url">' + t("appliesUrlOption") + '</option><option value="url-prefix">' + t("appliesUrlPrefixOption") + '</option><option value="domain">' + t("appliesDomainOption") + '</option><option value="regexp">' + t("appliesRegexpOption") + '</option></select><input name="applies-value" class="applies-value style-contributor"><button class="remove-applies-to">' + t("appliesRemove") + '</button><button class="add-applies-to">' + t("appliesAdd") + '</button>';

var appliesToEverythingTemplate = document.createElement("li");
appliesToEverythingTemplate.className = "applies-to-everything";
appliesToEverythingTemplate.innerHTML = t("appliesToEverything") + ' <button class="add-applies-to">' + t("appliesSpecify") + '</button>';

var sectionTemplate = document.createElement("div");
sectionTemplate.innerHTML = '<label>' + t('sectionCode') + '</label><textarea class="code"></textarea><br><div class="applies-to"><label>' + t("appliesLabel") + ' <img class="applies-to-help" src="help.png" alt="' + t('helpAlt') + '"></label><ul class="applies-to-list"></ul></div><button class="remove-section">' + t('sectionRemove') + '</button><button class="add-section">' + t('sectionAdd') + '</button>';


// make querySelectorAll enumeration code readable
["forEach", "some", "indexOf"].forEach(function(method) {
	NodeList.prototype[method]= Array.prototype[method];
});

function onChange(event) {
	var node = event.target;
	if ("savedValue" in node) {
		var currentValue = "checkbox" === node.type ? node.checked : node.value;
		setCleanItem(node, node.savedValue === currentValue);
	} else {
		// the manually added section's applies-to is dirty only when the value is non-empty
		setCleanItem(node, node.localName != "input" || !node.value.trim());
		delete node.savedValue; // only valid when actually saved
	}
	updateTitle();
}

// Set .dirty on stylesheet contributors that have changed
function setDirtyClass(node, isDirty) {
	node.classList.toggle("dirty", isDirty);
}

function setCleanItem(node, isClean) {
	if (!node.id) {
		node.id = Date.now().toString(32).substr(-6);
	}

	if (isClean) {
		delete dirty[node.id];
		node.savedValue = "checkbox" === node.type ? node.checked : node.value;
	} else {
		dirty[node.id] = true;
	}

	setDirtyClass(node, !isClean);
}

function isCleanGlobal() {
	var clean = Object.keys(dirty).length == 0;
	setDirtyClass(document.body, !clean);
	return clean;
}

function setCleanGlobal() {
	document.querySelectorAll("#header, #sections > div").forEach(setCleanSection);
	dirty = {}; // forget the dirty applies-to ids from a deleted section after the style was saved
}

function setCleanSection(section) {
	section.querySelectorAll(".style-contributor").forEach(function(node) { setCleanItem(node, true) });

	// #header section has no codemirror
	var wrapper = section.querySelector(".CodeMirror");
	if (wrapper) {
		var cm = wrapper.CodeMirror;
		section.savedValue = cm.changeGeneration();
		indicateCodeChange(cm);
	}
}

function initCodeMirror() {
	var CM = CodeMirror;
	// default option values
	var userOptions = prefs.getPref("editor.options");
	var stylishOptions = {
		mode: 'css',
		lineNumbers: true,
		lineWrapping: true,
		foldGutter: true,
		gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
		matchBrackets: true,
		lint: CodeMirror.lint.css,
		keyMap: "sublime",
		extraKeys: {"Ctrl-Space": "autocomplete"}
	}
	mergeOptions(stylishOptions, CM.defaults);
	mergeOptions(userOptions, CM.defaults);

	function mergeOptions(source, target) {
		for (var key in source) target[key] = source[key];
		return target;
	}

	// additional commands
	var cc = CM.commands;
	cc.jumpToLine = jumpToLine;
	cc.nextBuffer = function(cm) { nextPrevBuffer(cm, 1) };
	cc.prevBuffer = function(cm) { nextPrevBuffer(cm, -1) };

	var cssHintHandler = CM.hint.css;
	CM.hint.css = function(cm) {
		var cursor = cm.getCursor();
		var token = cm.getTokenAt(cursor);
		if (token.state.state === "prop" && "!important".indexOf(token.string) === 0) {
			return {
				from: CM.Pos(cursor.line, token.start),
				to: CM.Pos(cursor.line, token.end),
				list: ["!important"]
			}
		}
		return cssHintHandler(cm);
	}

	// user option values
	CM.getOption = function (o) {
		return CodeMirror.defaults[o];
	}
	CM.setOption = function (o, v) {
		CodeMirror.defaults[o] = v;
		editors.forEach(function(editor) {
			editor.setOption(o, v);
		});
	}

	// initialize global editor controls
	document.getElementById("options").addEventListener("change", acmeEventListener, false);

	var keymapControl = document.getElementById("editor.keyMap");
	Object.keys(CodeMirror.keyMap).sort().forEach(function(map) {
		keymapControl.appendChild(document.createElement("option")).textContent = map;
	});

	var controlPrefs = {},
	    controlOptions = ["smartIndent", "indentWithTabs", "tabSize", "keyMap", "lineWrapping"];
	controlOptions.forEach(function(option) {
		controlPrefs["editor." + option] = CM.defaults[option];
		tE(option + "-label", "cm_" + option);
	});
	loadPrefs(controlPrefs);

}
initCodeMirror();

function acmeEventListener(event) {
	var option = event.target.dataset.option;
	console.log("acmeEventListener heard %s on %s", event.type, event.target.id);
	if (!option) console.error("acmeEventListener: no 'cm_option' %O", event.target);
	else CodeMirror.setOption(option, event.target[isCheckbox(event.target) ? "checked" : "value"]);

	if ("tabSize" === option) CodeMirror.setOption("indentUnit", CodeMirror.getOption("tabSize"));
}

// replace given textarea with the CodeMirror editor
function setupCodeMirror(textarea, index) {
	var cm = CodeMirror.fromTextArea(textarea);
	cm.addKeyMap({
		"Ctrl-G": "jumpToLine",
		"Alt-PageDown": "nextBuffer",
		"Alt-PageUp": "prevBuffer"
	});
	cm.lastChange = cm.changeGeneration();
	cm.on("change", indicateCodeChange);

	// ensure the section doesn't jump when clicking selected text
	cm.on("cursorActivity", function(cm) {
		setTimeout(function() {
			lockScroll = {
				windowScrollY: window.scrollY,
				editor: cm,
				editorScrollInfo: cm.getScrollInfo()
			}
		}, 0);
	});

	editors.splice(index || editors.length, 0, cm);
	return cm;
}

function indicateCodeChange(cm) {
	var section = cm.getTextArea().parentNode;
	setCleanItem(section, cm.isClean(section.savedValue));
	updateTitle();
}

// ensure the section doesn't jump when clicking selected text
document.addEventListener("scroll", function(e) {
	if (lockScroll && lockScroll.windowScrollY != window.scrollY) {
		window.scrollTo(0, lockScroll.windowScrollY);
		lockScroll.editor.scrollTo(lockScroll.editorScrollInfo.left, lockScroll.editorScrollInfo.top);
		lockScroll = null;
	}
});

window.addEventListener("keydown", function(e) {
	if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.keyCode == 83) {
		e.preventDefault();
		save();
	}
});

chrome.tabs.query({currentWindow: true}, function(tabs) {
	isSeparateWindow = tabs.length == 1;
});

window.onbeforeunload = function() {
	if (isSeparateWindow) {
		prefs.setPref('windowPosition', {
			left: screenLeft,
			top: screenTop,
			width: outerWidth,
			height: outerHeight
		});
	}
	document.activeElement.blur();
	return !isCleanGlobal() ? t('styleChangesNotSaved') : null;
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
	} else if (showingEverything || list.hasChildNodes()) {
		e = appliesToTemplate.cloneNode(true);
		if (list.hasChildNodes()) {
			e.querySelector("[name=applies-type]").value = list.querySelector("li:last-child [name='applies-type']").value;
		}
		e.querySelector(".remove-applies-to").addEventListener("click", removeAppliesTo, false);
	} else {
		e = appliesToEverythingTemplate.cloneNode(true);
	}
	e.querySelector(".add-applies-to").addEventListener("click", function() {addAppliesTo(this.parentNode.parentNode)}, false);
	list.appendChild(e);
}

function addSection(event, section) {
	var div = sectionTemplate.cloneNode(true);
	div.querySelector(".applies-to-help").addEventListener("click", showAppliesToHelp, false);
	div.querySelector(".remove-section").addEventListener("click", removeSection, false);
	div.querySelector(".add-section").addEventListener("click", addSection, false);

	var codeElement = div.querySelector(".code");
	var appliesTo = div.querySelector(".applies-to-list");
	var appliesToAdded = false;

	if (section) {
		codeElement.value = section.code;
		for (var i in propertyToCss) {
			if (section[i]) {
				section[i].forEach(function(url) {
					addAppliesTo(appliesTo, propertyToCss[i], url);
					appliesToAdded = true;
				});
			}
		}
	}
	if (!appliesToAdded) {
		addAppliesTo(appliesTo);
	}

	appliesTo.addEventListener("change", onChange);
	appliesTo.addEventListener("input", onChange);

	var sections = document.getElementById("sections");
	if (event) {
		var clickedSection = event.target.parentNode;
		sections.insertBefore(div, clickedSection.nextElementSibling);
		var newIndex = document.querySelectorAll("#sections > div").indexOf(clickedSection) + 1;
		setupCodeMirror(codeElement, newIndex).focus();
	} else {
		sections.appendChild(div);
		setupCodeMirror(codeElement);
	}

	setCleanSection(div);
}

function removeAppliesTo(event) {
	var appliesTo = event.target.parentNode,
	    appliesToList = appliesTo.parentNode;
	removeAreaAndSetDirty(appliesTo);
	if (!appliesToList.hasChildNodes()) {
		addAppliesTo(appliesToList);
	}
}

function removeSection(event) {
	var section = event.target.parentNode;
	var cm = section.querySelector(".CodeMirror").CodeMirror;
	removeAreaAndSetDirty(section);
	editors.splice(editors.indexOf(cm), 1);
}

function removeAreaAndSetDirty(area) {
	area.querySelectorAll('.style-contributor').some(function(node) {
		if (node.savedValue) {
			// it's a saved section, so make it dirty and stop the enumeration
			setCleanItem(area, false);
			return true;
		} else {
			// it's an empty section, so undirty the applies-to items,
			// otherwise orphaned ids would keep the style dirty
			setCleanItem(node, true);
		}
	});
	updateTitle();
	area.parentNode.removeChild(area);
}

function makeSectionVisible(cm) {
	var section = cm.display.wrapper.parentNode;
	var bounds = section.getBoundingClientRect();
	if ((bounds.bottom > window.innerHeight && bounds.top > 0) || (bounds.top < 0 && bounds.bottom < window.innerHeight)) {
		lockScroll = null;
		if (bounds.top < 0) {
			window.scrollBy(0, bounds.top - 1);
		} else {
			window.scrollBy(0, bounds.bottom - window.innerHeight + 1);
		}
	}
}

function setupGlobalSearch() {
	var originalCommand = {
		find: CodeMirror.commands.find,
		findNext: CodeMirror.commands.findNext,
		findPrev: CodeMirror.commands.findPrev
	}

	function shouldIgnoreCase(query) { // treat all-lowercase non-regexp queries as case-insensitive
		return typeof query == "string" && query == query.toLowerCase();
	}

	function find(activeCM) {
		var originalOpenDialog = activeCM.openDialog;
		activeCM.openDialog = function(template, callback, options) {
			originalOpenDialog.call(activeCM, template, function(query) {
				activeCM.openDialog = originalOpenDialog;
				callback(query);
				var state = activeCM.state.search;
				if (editors.length == 1 || !state.query) {
					return;
				}
				for (var i=0; i < editors.length; i++) {
					var cm = editors[i];
					if (cm == activeCM) {
						continue;
					}
					cm.execCommand("clearSearch");
					cm.state.search = {
						query: state.query,
						overlay: state.overlay,
						annotate: cm.showMatchesOnScrollbar(state.query, shouldIgnoreCase(state.query))
					}
					cm.addOverlay(state.overlay);
				}
				if (CodeMirror.cmpPos(activeCM.state.search.posFrom, activeCM.state.search.posTo) == 0) {
					findNext(activeCM);
				}
			}, options);
		}
		originalCommand.find(activeCM);
	}

	function findNext(activeCM, reverse) {
		if (!activeCM.state.search || !activeCM.state.search.query) {
			find(activeCM);
			return;
		}
		var pos = activeCM.getCursor();
		// check if the search term is currently selected in the editor
		var m = activeCM.getSelection().match(activeCM.state.search.query);
		if (m && m[0].length == activeCM.getSelection().length) {
			pos = activeCM.getCursor(reverse ? "from" : "to");
			activeCM.setSelection(activeCM.getCursor());
		}

		for (var i=0, cm=activeCM; i < editors.length; i++) {
			var state = cm.state.search;
			if (cm != activeCM) {
				pos = reverse ? CodeMirror.Pos(cm.lastLine()) : CodeMirror.Pos(0, 0);
			}
			var searchCursor = cm.getSearchCursor(state.query, pos, shouldIgnoreCase(state.query));
			if (searchCursor.find(reverse)) {
				if (editors.length > 1) {
					makeSectionVisible(cm);
					cm.focus();
				}
				// speedup the original findNext
				state.posFrom = reverse ? searchCursor.to() : searchCursor.from();
				state.posTo = CodeMirror.Pos(state.posFrom.line, state.posFrom.ch);
				originalCommand[reverse ? "findPrev" : "findNext"](cm);
				return;
			}
			cm = editors[(editors.indexOf(cm) + (reverse ? -1 + editors.length : 1)) % editors.length];
		}
		// nothing found so far, so call the original search with wrap-around
		originalCommand[reverse ? "findPrev" : "findNext"](activeCM);
	}

	CodeMirror.commands.find = find;
	CodeMirror.commands.findNext = function(cm) { findNext(cm) }
	CodeMirror.commands.findPrev = function(cm) { findNext(cm, true) }
}

function jumpToLine(cm) {
	var cur = cm.getCursor();
	cm.openDialog(t('editGotoLine') + ': <input type="text" style="width: 5em"/>', function(str) {
		var m = str.match(/^\s*(\d+)(?:\s*:\s*(\d+))?\s*$/);
		if (m) {
			cm.setCursor(m[1] - 1, m[2] ? m[2] - 1 : cur.ch);
		}
	}, {value: cur.line+1});
}

function nextPrevBuffer(cm, direction) {
	cm = editors[(editors.indexOf(cm) + direction + editors.length) % editors.length];
	makeSectionVisible(cm);
	cm.focus();
}

window.addEventListener("load", init, false);

function init() {
	tE("sections-help", "helpAlt", "alt");
	var params = getParams();
	if (!params.id) { // match should be 2 - one for the whole thing, one for the parentheses
		// This is an add
		var section = {code: ""}
		for (var i in CssToProperty) {
			if (params[i]) {
				section[CssToProperty[i]] = [params[i]];
			}
		}
		addSection(null, section);
		// default to enabled
		document.getElementById("enabled").checked = true
		tE("heading", "addStyleTitle");
		initHooks();
		return;
	}
	// This is an edit
	chrome.extension.sendMessage({method: "getStyles", id: params.id}, function(styles) {
		var style = styles[0];
		styleId = style.id;
		initWithStyle(style);
	});
}

function initWithStyle(style) {
	document.getElementById("name").value = style.name;
	document.getElementById("enabled").checked = style.enabled == "true";
	document.getElementById("heading").innerHTML = t("editStyleHeading");
	// if this was done in response to an update, we need to clear existing sections
	document.querySelectorAll("#sections > div").forEach(function(div) {
		div.parentNode.removeChild(div);
	});
	style.sections.forEach(function(section) {
		setTimeout(function() {
			addSection(null, section)
		}, 0);
	});
	initHooks();
}

function initHooks() {
	document.querySelectorAll("#header .style-contributor").forEach(function(node) {
		node.addEventListener("change", onChange);
		node.addEventListener("input", onChange);
	});

	setupGlobalSearch();
	setCleanGlobal();
	updateTitle();
}

function updateTitle() {
	const DIRTY_TITLE = "* $";

	var name = document.getElementById("name").savedValue;
	var clean = isCleanGlobal();
	var title = styleId === null ? t("addStyleTitle") : t('editStyleTitle', [name]);
	document.title = clean ? title : DIRTY_TITLE.replace("$", title);
}

function validate() {
	var name = document.getElementById("name").value;
	if (name == "") {
		return t("styleMissingName");
	}
	// validate the regexps
	if (document.querySelectorAll(".applies-to-list").some(function(list) {
		return list.childNodes.some(function(li) {
			if (li.className == appliesToEverythingTemplate.className) {
				return false;
			}
			var valueElement = li.querySelector("[name=applies-value]");
			var type = li.querySelector("[name=applies-type]").value;
			var value = valueElement.value;
			if (type && value) {
				if (type == "regexp") {
					try {
						new RegExp(value);
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
	for (var i=0; i < editors.length; i++) {
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
		sections: getSections()
	};
	chrome.extension.sendMessage(request, saveComplete);
}

function getSections() {
	var sections = [];
	document.querySelectorAll("#sections > div").forEach(function(div) {
		var meta = getMeta(div);
		var code = div.querySelector(".CodeMirror").CodeMirror.getValue();
		if (/^\s*$/.test(code) && Object.keys(meta).length == 0) {
			return;
		}
		meta.code = code;
		sections.push(meta);
	});
	return sections;
}

function getMeta(e) {
	var meta = {};
	e.querySelector(".applies-to-list").childNodes.forEach(function(li) {
		if (li.className == appliesToEverythingTemplate.className) {
			return;
		}
		var type = li.querySelector("[name=applies-type]").value;
		var value = li.querySelector("[name=applies-value]").value;
		if (type && value) {
			var property = CssToProperty[type];
			meta[property] ? meta[property].push(value) : meta[property] = [value];
		}
	});
	return meta;
}

function saveComplete(style) {
	styleId = style.id;
	setCleanGlobal();

	// Go from new style URL to edit style URL
	if (location.href.indexOf("id=") == -1) {
		// give the code above a moment before we kill the page
		setTimeout(function() {location.href = "edit.html?id=" + style.id;}, 200);
	} else {
		updateTitle();
	}
}

function showMozillaFormat() {
	window.open("data:text/plain;charset=UTF-8," + encodeURIComponent(toMozillaFormat()));
}

function toMozillaFormat() {
	return getSections().map(function(section) {
		var cssMds = [];
		for (var i in propertyToCss) {
			if (section[i]) {
				cssMds = cssMds.concat(section[i].map(function (v){
					return propertyToCss[i] + "(\"" + v.replace(/\\/g, "\\\\") + "\")";
				}));
			}
		}
		return cssMds.length ? "@-moz-document " + cssMds.join(", ") + " {\n" + section.code + "\n}" : section.code;
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

function getParams() {
	var params = {};
	var urlParts = location.href.split("?", 2);
	if (urlParts.length == 1) {
		return params;
	}
	urlParts[1].split("&").forEach(function(keyValue) {
		var splitKeyValue = keyValue.split("=", 2);
		params[decodeURIComponent(splitKeyValue[0])] = decodeURIComponent(splitKeyValue[1]);
	});
	return params;
}

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	var installed = document.getElementById("installed");
	switch (request.method) {
		case "styleUpdated":
			if (styleId == request.id) {
				initWithStyle(request.style);
			}
			break;
		case "styleDeleted":
			if (styleId == request.id) {
				window.close();
				break;
			}
			break;
		case "prefChanged":
			if (request.prefName == "editor.smartIndent") {
				CodeMirror.setOption("smartIndent", request.value);
			}
	}
});

tE("name", "styleMissingName", "placeholder");
tE("enabled-label", "styleEnabledLabel");
tE("to-mozilla", "styleToMozillaFormat");
tE("save-button", "styleSaveLabel");
tE("cancel-button", "styleCancelEditLabel");
tE("sections-heading", "styleSectionsTitle");
tE("options-heading", "optionsHeading");

document.getElementById("to-mozilla").addEventListener("click", showMozillaFormat, false);
document.getElementById("to-mozilla-help").addEventListener("click", showToMozillaHelp, false);
document.getElementById("save-button").addEventListener("click", save, false);
document.getElementById("sections-help").addEventListener("click", showSectionHelp, false);
