"use strict";

var styleId = null;
var dirty = false;
var lockScroll; // ensure the section doesn't jump when clicking selected text
var isSeparateWindow;

var appliesToTemplate = document.createElement("li");
appliesToTemplate.innerHTML = '<select name="applies-type" class="applies-type"><option value="url">' + t("appliesUrlOption") + '</option><option value="url-prefix">' + t("appliesUrlPrefixOption") + '</option><option value="domain">' + t("appliesDomainOption") + '</option><option value="regexp">' + t("appliesRegexpOption") + '</option></select><input name="applies-value" class="applies-value"><button class="remove-applies-to">' + t("appliesRemove") + '</button><button class="add-applies-to">' + t("appliesAdd") + '</button>';

var appliesToEverythingTemplate = document.createElement("li");
appliesToEverythingTemplate.className = "applies-to-everything";
appliesToEverythingTemplate.innerHTML = t("appliesToEverything") + ' <button class="add-applies-to">' + t("appliesSpecify") + '</button>'

var sectionTemplate = document.createElement("div");
sectionTemplate.innerHTML = '<label>' + t('sectionCode') + '</label><textarea class="code"></textarea><br><div class="applies-to"><label>' + t("appliesLabel") + ' <img class="applies-to-help" src="help.png" alt="' + t('helpAlt') + '"></label><ul class="applies-to-list"></ul></div><button class="remove-section">' + t('sectionRemove') + '</button><button class="add-section">' + t('sectionAdd') + '</button>';

document.addEventListener("change", function(event) {
	var node = event.target;
	if (node.type && !node.form) { // INPUTs that aren't in a FORM are stylesheet
		switch (node.type) {
			case "checkbox":
				setCleanItem(node, node.checked === node.defaultChecked);
				break;
			case "text":
			case "select-one":
			case "select-multiple":
				setCleanItem(node, node.value === node.defaultValue);
				break;
		}
	}
});

// Set .dirty on stylesheet contributors that have changed
var items = {};
function isCleanItem(node) {
	return items[node.id];
}
function setCleanItem(node, clean) {
	var id = node.id;
	if (!id) id = node.id = Date.now().toString(32).substr(-6);
	items[id] = clean;

	if (clean) node.classList.remove("dirty");
	else node.classList.add("dirty");

	initTitle();
}
function isCleanGlobal() {
	var clean = Object.keys(items)
				      .every(function(item) { return items[item] });

	if (clean) document.body.classList.remove("dirty");
	else document.body.classList.add("dirty");

	return clean;
}
function setCleanGlobal(form) {
	if (!form) form = null;
	Array.prototype.forEach.call(document.querySelectorAll("input, select"), function(node) {
		if (node.form === form) {
			if ("checkbox" === node.type) {
				node.defaultChecked = node.checked;
			} else {
				node.defaultValue = node.value;
			}

			node.classList.remove("dirty");
			delete items[node.id];
		}
	});

	editors.forEach(function(cm) {
		cm.lastChange = cm.changeGeneration();
		cm.getTextArea().parentNode.defaultValue = cm.lastChange;
		indicateCodeChange(cm);
	});

	initTitle();
}

var editors = []; // array of all CodeMirror instances
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
	};
	mergeOptions(stylishOptions, CM.defaults);
	mergeOptions(userOptions, CM.defaults);

	function mergeOptions(source, target) {
		for (var key in source) target[key] = source[key];
		return target;
	}

	// additional commands
	var cc = CM.commands;
	cc.jumpToLine = jumpToLine;
	cc.nextBuffer = nextBuffer;
	cc.prevBuffer = prevBuffer;
	// cc.save = save;

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
function setupCodeMirror(textarea) {
	var cm = CodeMirror.fromTextArea(textarea);
	cm.addKeyMap({
		"Ctrl-G": "jumpToLine",
		"Alt-PageDown": "nextBuffer",
		"Alt-PageUp": "prevBuffer"
	});
	cm.lastChange = cm.changeGeneration();
	cm.on("change", indicateCodeChange);

	// ensure the entire section is visible on focus
	cm.on("focus", function(cm) {
		var section = cm.display.wrapper.parentNode;
		var bounds = section.getBoundingClientRect();
		if ((bounds.bottom > window.innerHeight && bounds.top > 0) || (bounds.top < 0 && bounds.bottom < window.innerHeight)) {
			lockScroll = null;
			if (bounds.top < 0) {
				window.scrollBy(0, bounds.top - 1);
			} else {
				window.scrollBy(0, bounds.bottom - window.innerHeight + 1);
			}

			// prevent possible double fire of selection change event induced by window.scrollBy
			var selectionChangeCount = 0, selection;
			function beforeSelectionChange(cm, obj) {
				if (++selectionChangeCount == 1) {
					selection = obj.ranges;
				} else {
					obj.update(selection);
					cm.off("beforeSelectionChange", beforeSelectionChange);
				}
			}
			cm.on("beforeSelectionChange", beforeSelectionChange);
			setTimeout(function() {
				cm.off("beforeSelectionChange", beforeSelectionChange)
			}, 200);
		}
	});

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

	editors.push(cm);
}

// ensure the section doesn't jump when clicking selected text
document.addEventListener("scroll", function(e) {
	if (lockScroll && lockScroll.windowScrollY != window.scrollY) {
		window.scrollTo(0, lockScroll.windowScrollY);
		lockScroll.editor.scrollTo(lockScroll.editorScrollInfo.left, lockScroll.editorScrollInfo.top);
		lockScroll = null;
	}
});

document.addEventListener("keydown", function(e) {
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

function indicateCodeChange(cm) {
	setCleanItem(cm.getTextArea().parentNode, cm.isClean(cm.lastChange));
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

	var appliesTo = div.querySelector(".applies-to-list");

	if (section) {
		var codeElement = div.querySelector(".code");
		codeElement.value = section.code;
		// codeElement.addEventListener("change", makeDirty, false);
		// // Why is this here? Is it possible for CM to not load?
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
	var section = event ? event.target.parentNode : null;
	if (event && section.nextElementSibling) {
		sections.insertBefore(div, section.nextElementSibling);
	} else {
		sections.appendChild(div);
	}
	setupCodeMirror(div.querySelector('.code'));
	if (section) {
		var index = Array.prototype.indexOf.call(sections.children, section);
		var cm = editors.pop();
		editors.splice(index, 0, cm);
		cm.focus();
	}
}

function removeAppliesTo(event) {
	var appliesTo = event.target.parentNode,
	    appliesToList = appliesTo.parentNode;
	appliesToList.removeChild(appliesTo);
	if (!appliesToList.hasChildNodes()) {
		var e = appliesToEverythingTemplate.cloneNode(true);
		e.querySelector(".add-applies-to").addEventListener("click", function() {addAppliesTo(this.parentNode.parentNode)}, false);
		appliesToList.appendChild(e);
	}
	Array.prototype.forEach.call(appliesTo.querySelectorAll("input, select"), function(node) {
		setCleanItem(node, !node.defaultValue);
	});
}

function removeSection(event) {
    var section = event.target.parentNode;
    var wrapper = section.querySelector(".CodeMirror-wrap");
	var idx = editors.indexOf(wrapper && wrapper.CodeMirror);
    if (idx >= 0) {
        editors.splice(idx, 1);
		setCleanItem(wrapper.parentNode, true);
    }
	section.parentNode.removeChild(section);
	Array.prototype.forEach.call(section.querySelectorAll("input, select"), function(node) {
		setCleanItem(node, !node.defaultValue);
	});
	setCleanItem(section, !section.defaultValue);
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
			if (searchCursor.find(reverse) || editors.length == 1) {
				if (editors.length > 1) {
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

function nextBuffer(cm) {
	editors[(editors.indexOf(cm) + 1) % editors.length].focus();
}
function prevBuffer(cm) {
	editors[(editors.indexOf(cm) - 1 + editors.length) % editors.length].focus();
}

window.addEventListener("load", init, false);

function init() {
	tE("sections-help", "helpAlt", "alt");
	var params = getParams();
	if (!params.id) { // match should be 2 - one for the whole thing, one for the parentheses
		// This is an add
		var section = {code: ""}
		if (params.domain) {
			section.domains = [params.domain];
		} else if (params.url) {
			section.urls = [params.url];
		} else if (params["url-prefix"]) {
			section.urlPrefixes = [params["url-prefix"]];
		}
		addSection(null, section);
		// default to enabled
		document.getElementById("enabled").checked = true
		tE("heading", "addStyleTitle");
		setupGlobalSearch();
		setCleanGlobal(null);
		initTitle();
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
	Array.prototype.forEach.call(document.querySelectorAll("#sections > div"), function(div) {
		div.parentNode.removeChild(div);
	});
	style.sections.forEach(function(section) {
		setTimeout(function() {
			addSection(null, section)
		}, 0);
	});
	setupGlobalSearch();
	setCleanGlobal(null);
	initTitle();
}

function initTitle() {
	const DIRTY_TITLE = "* $";

	var name = document.getElementById("name").defaultValue;
	var dirty = !isCleanGlobal();
	var title = styleId === null ? t("addStyleTitle") : t('editStyleTitle', [name]);
	document.title = !dirty ? title : DIRTY_TITLE.replace("$", title);
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
	styleId = style.id;
	setCleanGlobal(null);

	// Go from new style URL to edit style URL
	if (location.href.indexOf("id=") == -1) {
		// give the code above a moment before we kill the page
		setTimeout(function() {location.href = "edit.html?id=" + style.id;}, 200);
	} else {
		initTitle();
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
				dirty = false;
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

tE("name-label", "styleNameLabel");
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
