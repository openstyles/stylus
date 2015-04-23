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
var appliesToTemplate = tHTML('\
	<li>\
		<select name="applies-type" class="applies-type style-contributor">\
			<option value="url" i18n-text="appliesUrlOption"></option>\
			<option value="url-prefix" i18n-text="appliesUrlPrefixOption"></option>\
			<option value="domain" i18n-text="appliesDomainOption"></option>\
			<option value="regexp" i18n-text="appliesRegexpOption"></option>\
		</select>\
		<input name="applies-value" class="applies-value style-contributor">\
		<button class="remove-applies-to" i18n-text="appliesRemove"></button>\
		<button class="add-applies-to" i18n-text="appliesAdd"></button>\
	</li>\
');

var appliesToEverythingTemplate = tHTML('\
	<li class="applies-to-everything" i18n-html="appliesToEverything")>\
		<button class="add-applies-to" i18n-text="appliesSpecify"></button>\
	</li>\
');

var sectionTemplate = tHTML('\
	<div>\
		<label i18n-text="sectionCode"></label>\
		<textarea class="code"></textarea>\
		<br>\
		<div class="applies-to">\
			<label i18n-text="appliesLabel">\
				&nbsp;<img class="applies-to-help" src="help.png" i18n-alt="helpAlt">\
			</label>\
			<ul class="applies-to-list"></ul>\
		</div>\
		<button class="remove-section" i18n-text="sectionRemove"></button>\
		<button class="add-section" i18n-text="sectionAdd"></button>\
	</div>\
');

var findTemplate = t("search") + ': <input type="text" style="width: 10em" class="CodeMirror-search-field"/>&nbsp;' +
	'<span style="color: #888" class="CodeMirror-search-hint">(' + t("searchRegexp") + ')</span>';

var jumpToLineTemplate = t('editGotoLine') + ': <input class="CodeMirror-jump-field" type="text" style="width: 5em"/>';

// make querySelectorAll enumeration code readable
["forEach", "some", "indexOf"].forEach(function(method) {
	NodeList.prototype[method]= Array.prototype[method];
});

// reroute handling to nearest editor when keypress resolves to one of these commands
var commandsToReroute = {
	save: true, jumpToLine: true, nextEditor: true, prevEditor: true,
	find: true, findNext: true, findPrev: true, replace: true, replaceAll: true
};

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
		// A div would indicate a section
		if (node.nodeName.toLowerCase() == "div") {
			node.savedValue = getCodeMirrorForSection(node).changeGeneration();
		} else {
			node.savedValue = "checkbox" === node.type ? node.checked : node.value;
		}
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
	var cm = getCodeMirrorForSection(section)
	if (cm) {
		section.savedValue = cm.changeGeneration();
		indicateCodeChange(cm);
	}
}

function initCodeMirror() {
	var CM = CodeMirror;
	var isWindowsOS = navigator.appVersion.indexOf("Windows") > 0;

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
		theme: "default",
		keyMap: isWindowsOS ? "sublime" : "default",
		extraKeys: { // independent of current keyMap
			"Alt-PageDown": "nextEditor",
			"Alt-PageUp": "prevEditor"
		}
	}
	mergeOptions(stylishOptions, CM.defaults);
	mergeOptions(userOptions, CM.defaults);

	function mergeOptions(source, target) {
		for (var key in source) target[key] = source[key];
		return target;
	}

	// additional commands
	CM.commands.jumpToLine = jumpToLine;
	CM.commands.nextEditor = function(cm) { nextPrevEditor(cm, 1) };
	CM.commands.prevEditor = function(cm) { nextPrevEditor(cm, -1) };
	CM.commands.save = save;

	// "basic" keymap only has basic keys by design, so we skip it

	CM.keyMap.sublime["Ctrl-G"] = "jumpToLine";
	CM.keyMap.emacsy["Ctrl-G"] = "jumpToLine";
	CM.keyMap.pcDefault["Ctrl-J"] = "jumpToLine";
	CM.keyMap.macDefault["Cmd-J"] = "jumpToLine";

	CM.keyMap.pcDefault["Ctrl-Space"] = "autocomplete"; // will be used by "sublime" on PC via fallthrough
	CM.keyMap.macDefault["Alt-Space"] = "autocomplete"; // OSX uses Ctrl-Space and Cmd-Space for something else
	CM.keyMap.emacsy["Alt-/"] = "autocomplete"; // copied from "emacs" keymap
	// "vim" and "emacs" define their own autocomplete hotkeys

	if (isWindowsOS) {
		// "pcDefault" keymap on Windows should have F3/Shift-F3
		CM.keyMap.pcDefault["F3"] = "findNext";
		CM.keyMap.pcDefault["Shift-F3"] = "findPrev";

		// try to remap non-interceptable Ctrl-(Shift-)N/T/W hotkeys
		["N", "T", "W"].forEach(function(char) {
			[{from: "Ctrl-", to: ["Alt-", "Ctrl-Alt-"]},
			 {from: "Shift-Ctrl-", to: ["Ctrl-Alt-", "Shift-Ctrl-Alt-"]} // Note: modifier order in CM is S-C-A
			].forEach(function(remap) {
				var oldKey = remap.from + char;
				Object.keys(CM.keyMap).forEach(function(keyMapName) {
					var keyMap = CM.keyMap[keyMapName];
					var command = keyMap[oldKey];
					if (!command) {
						return;
					}
					remap.to.some(function(newMod) {
						var newKey = newMod + char;
						if (!(newKey in keyMap)) {
							delete keyMap[oldKey];
							keyMap[newKey] = command;
							return true;
						}
					});
				});
			});
		});
	}

	// TODO: remove when CM 5.1.0+ is used
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

	// preload the theme so that CodeMirror can calculate its metrics in DOMContentLoaded->loadPrefs()
	var theme = prefs.getPref("editor.theme");
	document.getElementById("cm-theme").href = theme == "default" ? "" : "codemirror/theme/" + theme + ".css";

	// initialize global editor controls
	document.addEventListener("DOMContentLoaded", function() {
		function optionsHtmlFromArray(options) {
			return options.map(function(opt) { return "<option>" + opt + "</option>"; }).join("");
		}
		var themeControl = document.getElementById("editor.theme");
		var bg = chrome.extension.getBackgroundPage();
		if (bg && bg.codeMirrorThemes) {
			themeControl.innerHTML = optionsHtmlFromArray(bg.codeMirrorThemes);
		} else {
			// Chrome is starting up and shows our edit.html, but the background page isn't loaded yet
			themeControl.innerHTML = optionsHtmlFromArray([theme == "default" ? t("defaultTheme") : theme]);
			getCodeMirrorThemes(function(themes) {
				themeControl.innerHTML = optionsHtmlFromArray(themes);
				themeControl.selectedIndex = Math.max(0, themes.indexOf(theme));
			});
		}
		document.getElementById("editor.keyMap").innerHTML = optionsHtmlFromArray(Object.keys(CM.keyMap).sort());
		var controlPrefs = {};
		document.querySelectorAll("#options *[data-option][id^='editor.']").forEach(function(option) {
			controlPrefs[option.id] = CM.defaults[option.dataset.option];
		});
		document.getElementById("options").addEventListener("change", acmeEventListener, false);
		loadPrefs(controlPrefs);
	});
}
initCodeMirror();

function acmeEventListener(event) {
	var el = event.target;
	var option = el.dataset.option;
	//console.log("acmeEventListener heard %s on %s", event.type, el.id);
	if (!option) {
		console.error("acmeEventListener: no 'cm_option' %O", el);
		return;
	}
	var value = el.type == "checkbox" ? el.checked : el.value;
	switch (option) {
		case "tabSize":
			CodeMirror.setOption("indentUnit", value);
			break;
		case "theme":
			var themeLink = document.getElementById("cm-theme");
			// use non-localized "default" internally
			if (!value || value == "default" || value == t("defaultTheme")) {
				value = "default";
				if (prefs.getPref(el.id) != value) {
					prefs.setPref(el.id, value);
				}
				themeLink.href = "";
				el.selectedIndex = 0;
				break;
			}
			var url = chrome.extension.getURL("codemirror/theme/" + value + ".css");
			if (themeLink.href == url) { // preloaded in initCodeMirror()
				break;
			}
			// avoid flicker: wait for the second stylesheet to load, then apply the theme
			document.head.insertAdjacentHTML("beforeend",
				'<link id="cm-theme2" rel="stylesheet" href="' + url + '">');
			(function() {
				setTimeout(function() {
					CodeMirror.setOption(option, value);
					themeLink.remove();
					document.getElementById("cm-theme2").id = "cm-theme";
				}, 100);
			})();
			return;
	}
	CodeMirror.setOption(option, value);
}

// replace given textarea with the CodeMirror editor
function setupCodeMirror(textarea, index) {
	var cm = CodeMirror.fromTextArea(textarea);

	cm.on("change", indicateCodeChange);

	// TODO: remove when CM 5.1.0+ is used
	// ensure the section doesn't jump when clicking selected text
	cm.on("cursorActivity", function(cm) {
		editors.lastActive = cm;
		setTimeout(function() {
			lockScroll = {
				windowScrollY: window.scrollY,
				editor: cm,
				editorScrollInfo: cm.getScrollInfo()
			}
		}, 0);
	});

	var resizeGrip = cm.display.wrapper.appendChild(document.createElement("div"));
	resizeGrip.className = "resize-grip";
	resizeGrip.addEventListener("mousedown", function(e) {
		e.preventDefault();
		var cm = e.target.parentNode.CodeMirror;
		var minHeight = cm.defaultTextHeight()
			+ cm.display.lineDiv.offsetParent.offsetTop /* .CodeMirror-lines padding */
			+ cm.display.wrapper.offsetHeight - cm.display.wrapper.scrollHeight /* borders */;
		function resize(e) {
			cm.setSize(null, Math.max(minHeight, cm.display.wrapper.scrollHeight + e.movementY));
		}
		document.addEventListener("mousemove", resize);
		document.addEventListener("mouseup", function resizeStop() {
			document.removeEventListener("mouseup", resizeStop);
			document.removeEventListener("mousemove", resize);
		});
	});
	// resizeGrip has enough space when scrollbars.horiz is visible
	if (cm.display.scrollbars.horiz.style.display != "") {
		cm.display.scrollbars.vert.style.marginBottom = "0";
	}
	// resizeGrip space adjustment in case a long line was entered/deleted by a user
	new MutationObserver(function(mutations) {
		var hScrollbar = mutations[0].target;
		var hScrollbarVisible = hScrollbar.style.display != "";
		var vScrollbar = hScrollbar.parentNode.CodeMirror.display.scrollbars.vert;
		vScrollbar.style.marginBottom = hScrollbarVisible ? "0" : "";
	}).observe(cm.display.scrollbars.horiz, {
		attributes: true,
		attributeFilter: ["style"]
	});

	editors.splice(index || editors.length, 0, cm);
	return cm;
}

function indicateCodeChange(cm) {
	var section = getSectionForCodeMirror(cm);
	setCleanItem(section, cm.isClean(section.savedValue));
	updateTitle();
}

function getSectionForCodeMirror(cm) {
	return cm.getTextArea().parentNode;
}

function getCodeMirrorForSection(section) {
	// #header section has no codemirror
	var wrapper = section.querySelector(".CodeMirror");
	if (wrapper) {
		return wrapper.CodeMirror;
	}
	return null;
}

// ensure the section doesn't jump when clicking selected text
// TODO: remove when CM 5.1.0+ is used
document.addEventListener("scroll", function(e) {
	if (lockScroll && lockScroll.windowScrollY != window.scrollY) {
		window.scrollTo(0, lockScroll.windowScrollY);
		lockScroll.editor.scrollTo(lockScroll.editorScrollInfo.left, lockScroll.editorScrollInfo.top);
		lockScroll = null;
	}
});

// prevent the browser from seeing hotkeys that should be handled by nearest editor
document.addEventListener("keydown", function(event) {
	if (event.target.localName == "textarea") {
		return; // let CodeMirror handle it
	}
	var keyName = CodeMirror.keyName(event);
	if ("handled" == CodeMirror.lookupKey(keyName, CodeMirror.getOption("keyMap"), handleCommand)
	 || "handled" == CodeMirror.lookupKey(keyName, CodeMirror.defaults.extraKeys, handleCommand)) {
		event.preventDefault();
		event.stopPropagation();
	}

	function handleCommand(command) {
		if (commandsToReroute[command] === true) {
			var cm = getEditorInSight(event.target);
			if (command != "save") {
				cm.focus();
			}
			CodeMirror.commands[command](cm);
			return true;
		}
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
		var cm = setupCodeMirror(codeElement, newIndex);
		makeSectionVisible(cm);
		cm.focus()
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

	var curState; // cm.state.search for last used 'find'

	function shouldIgnoreCase(query) { // treat all-lowercase non-regexp queries as case-insensitive
		return typeof query == "string" && query == query.toLowerCase();
	}

	function updateState(cm, newState) {
		if (!newState) {
			if (cm.state.search) {
				return cm.state.search;
			}
			newState = curState;
		}
		cm.state.search = {
			query: newState.query,
			overlay: newState.overlay,
			annotate: cm.showMatchesOnScrollbar(newState.query, shouldIgnoreCase(newState.query))
		}
		cm.addOverlay(newState.overlay);
		return cm.state.search;
	}

	function find(activeCM) {
		var originalOpenDialog = activeCM.openDialog;
		activeCM.openDialog = function(template, callback, options) {
			originalOpenDialog.call(activeCM, findTemplate, function(query) {
				activeCM.openDialog = originalOpenDialog;
				callback(query);
				curState = activeCM.state.search;
				if (editors.length == 1 || !curState.query) {
					return;
				}
				editors.forEach(function(cm) {
					if (cm != activeCM) {
						cm.execCommand("clearSearch");
						updateState(cm, curState);
					}
				});
				if (CodeMirror.cmpPos(curState.posFrom, curState.posTo) == 0) {
					findNext(activeCM);
				}
			}, options);
		}
		originalCommand.find(activeCM);
	}

	function findNext(activeCM, reverse) {
		var state = updateState(activeCM);
		if (!state || !state.query) {
			find(activeCM);
			return;
		}
		var pos = activeCM.getCursor(reverse ? "from" : "to");
		activeCM.setSelection(activeCM.getCursor()); // clear the selection, don't move the cursor

		for (var i=0, cm=activeCM; i < editors.length; i++) {
			state = updateState(cm);
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

	function findPrev(cm) {
		findNext(cm, true);
	}

	CodeMirror.commands.find = find;
	CodeMirror.commands.findNext = findNext;
	CodeMirror.commands.findPrev = findPrev;
}

function jumpToLine(cm) {
	var cur = cm.getCursor();
	cm.openDialog(jumpToLineTemplate, function(str) {
		var m = str.match(/^\s*(\d+)(?:\s*:\s*(\d+))?\s*$/);
		if (m) {
			cm.setCursor(m[1] - 1, m[2] ? m[2] - 1 : cur.ch);
		}
	}, {value: cur.line+1});
}

function nextPrevEditor(cm, direction) {
	cm = editors[(editors.indexOf(cm) + direction + editors.length) % editors.length];
	makeSectionVisible(cm);
	cm.focus();
}

function getEditorInSight(nearbyElement) {
	// priority: 1. associated CM for applies-to element 2. last active if visible 3. first visible
	var cm;
	if (nearbyElement && nearbyElement.className.indexOf("applies-") >= 0) {
		cm = getCodeMirrorForSection(querySelectorParent(nearbyElement, "#sections > div"));
	} else {
		cm = editors.lastActive;
	}
	if (!cm || offscreenDistance(cm) > 0) {
		var sorted = editors
			.map(function(cm, index) { return {cm: cm, distance: offscreenDistance(cm), index: index} })
			.sort(function(a, b) { return a.distance - b.distance || a.index - b.index });
		cm = sorted[0].cm;
		if (sorted[0].distance > 0) {
			makeSectionVisible(cm)
		}
	}
	return cm;

	function offscreenDistance(cm) {
		var LINES_VISIBLE = 2; // closest editor should have at least # lines visible
		var bounds = getSectionForCodeMirror(cm).getBoundingClientRect();
		if (bounds.top < 0) {
			return -bounds.top;
		} else if (bounds.top < window.innerHeight - cm.defaultTextHeight() * LINES_VISIBLE) {
			return 0;
		} else {
			return bounds.top - bounds.height;
		}
	}
}

window.addEventListener("load", init, false);

function init() {
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
	requestStyle();
	function requestStyle() {
		chrome.extension.sendMessage({method: "getStyles", id: params.id}, function callback(styles) {
			if (!styles) { // Chrome is starting up and shows edit.html
				requestStyle();
				return;
			}
			var style = styles[0];
			styleId = style.id;
			initWithStyle(style);
		});
	}
}

function initWithStyle(style) {
	document.getElementById("name").value = style.name;
	document.getElementById("enabled").checked = style.enabled == "true";
	tE("heading", "editStyleHeading", null, false);
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
	document.getElementById("to-mozilla").addEventListener("click", showMozillaFormat, false);
	document.getElementById("to-mozilla-help").addEventListener("click", showToMozillaHelp, false);
	document.getElementById("save-button").addEventListener("click", save, false);
	document.getElementById("sections-help").addEventListener("click", showSectionHelp, false);

	setupGlobalSearch();
	setCleanGlobal();
	updateTitle();
}

function updateTitle() {
	var DIRTY_TITLE = "* $";

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

function querySelectorParent(node, selector) {
	var parent = node.parentNode;
	while (parent && parent.matches && !parent.matches(selector))
		parent = parent.parentNode;
	return parent.matches ? parent : null; // null for the root document.DOCUMENT_NODE
}
