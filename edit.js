"use strict";

var styleId = null;
var dirty = {};       // only the actually dirty items here
var editors = [];     // array of all CodeMirror instances
var saveSizeOnClose;
var useHistoryBack;   // use browser history back when "back to manage" is clicked

// direct & reverse mapping of @-moz-document keywords and internal property names
var propertyToCss = {urls: "url", urlPrefixes: "url-prefix", domains: "domain", regexps: "regexp"};
var CssToProperty = {"url": "urls", "url-prefix": "urlPrefixes", "domain": "domains", "regexp": "regexps"};

// make querySelectorAll enumeration code readable
["forEach", "some", "indexOf", "map"].forEach(function(method) {
	NodeList.prototype[method]= Array.prototype[method];
});

// Chrome pre-34
Element.prototype.matches = Element.prototype.matches || Element.prototype.webkitMatchesSelector;

// Chrome pre-41 polyfill
Element.prototype.closest = Element.prototype.closest || function(selector) {
	for (var e = this; e && !e.matches(selector); e = e.parentElement) {}
	return e;
};

Array.prototype.rotate = function(amount) { // negative amount == rotate left
	var r = this.slice(-amount, this.length);
	Array.prototype.push.apply(r, this.slice(0, this.length - r.length));
	return r;
}

Object.defineProperty(Array.prototype, "last", {get: function() { return this[this.length - 1]; }});

// reroute handling to nearest editor when keypress resolves to one of these commands
var hotkeyRerouter = {
	commands: {
		save: true, jumpToLine: true, nextEditor: true, prevEditor: true,
		find: true, findNext: true, findPrev: true, replace: true, replaceAll: true
	},
	setState: function(enable) {
		setTimeout(function() {
			document[(enable ? "add" : "remove") + "EventListener"]("keydown", hotkeyRerouter.eventHandler);
		}, 0);
	},
	eventHandler: function(event) {
		var keyName = CodeMirror.keyName(event);
		if ("handled" == CodeMirror.lookupKey(keyName, CodeMirror.getOption("keyMap"), handleCommand)
		 || "handled" == CodeMirror.lookupKey(keyName, CodeMirror.defaults.extraKeys, handleCommand)) {
			event.preventDefault();
			event.stopPropagation();
		}
		function handleCommand(command) {
			if (hotkeyRerouter.commands[command] === true) {
				CodeMirror.commands[command](getEditorInSight(event.target));
				return true;
			}
		}
	}
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
		// code sections have .CodeMirror property
		if (node.CodeMirror) {
			node.savedValue = node.CodeMirror.changeGeneration();
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
	document.getElementById("save-button").disabled = clean;
	return clean;
}

function setCleanGlobal() {
	document.querySelectorAll("#header, #sections > div").forEach(setCleanSection);
	dirty = {}; // forget the dirty applies-to ids from a deleted section after the style was saved
}

function setCleanSection(section) {
	section.querySelectorAll(".style-contributor").forEach(function(node) { setCleanItem(node, true) });

	// #header section has no codemirror
	var cm = section.CodeMirror;
	if (cm) {
		section.savedValue = cm.changeGeneration();
		indicateCodeChange(cm);
	}
}

function initCodeMirror() {
	var CM = CodeMirror;
	var isWindowsOS = navigator.appVersion.indexOf("Windows") > 0;

	// default option values
	shallowMerge(CM.defaults, {
		mode: 'css',
		lineNumbers: true,
		lineWrapping: true,
		foldGutter: true,
		gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
		matchBrackets: true,
		lint: {getAnnotations: CodeMirror.lint.css, delay: prefs.get("editor.lintDelay")},
		lintReportDelay: prefs.get("editor.lintReportDelay"),
		styleActiveLine: true,
		theme: "default",
		keyMap: prefs.get("editor.keyMap"),
		extraKeys: { // independent of current keyMap
			"Alt-PageDown": "nextEditor",
			"Alt-PageUp": "prevEditor"
		}
	}, prefs.get("editor.options"));

	// additional commands
	CM.commands.jumpToLine = jumpToLine;
	CM.commands.nextEditor = function(cm) { nextPrevEditor(cm, 1) };
	CM.commands.prevEditor = function(cm) { nextPrevEditor(cm, -1) };
	CM.commands.save = save;
	CM.commands.blockComment = function(cm) {
		cm.blockComment(cm.getCursor("from"), cm.getCursor("to"), {fullLines: false});
	};

	// "basic" keymap only has basic keys by design, so we skip it

	var extraKeysCommands = {};
	Object.keys(CM.defaults.extraKeys).forEach(function(key) {
		extraKeysCommands[CM.defaults.extraKeys[key]] = true;
	});
	if (!extraKeysCommands.jumpToLine) {
		CM.keyMap.sublime["Ctrl-G"] = "jumpToLine";
		CM.keyMap.emacsy["Ctrl-G"] = "jumpToLine";
		CM.keyMap.pcDefault["Ctrl-J"] = "jumpToLine";
		CM.keyMap.macDefault["Cmd-J"] = "jumpToLine";
	}
	if (!extraKeysCommands.autocomplete) {
		CM.keyMap.pcDefault["Ctrl-Space"] = "autocomplete"; // will be used by "sublime" on PC via fallthrough
		CM.keyMap.macDefault["Alt-Space"] = "autocomplete"; // OSX uses Ctrl-Space and Cmd-Space for something else
		CM.keyMap.emacsy["Alt-/"] = "autocomplete"; // copied from "emacs" keymap
		// "vim" and "emacs" define their own autocomplete hotkeys
	}
	if (!extraKeysCommands.blockComment) {
		CM.keyMap.sublime["Shift-Ctrl-/"] = "blockComment";
	}

	if (isWindowsOS) {
		// "pcDefault" keymap on Windows should have F3/Shift-F3
		if (!extraKeysCommands.findNext) {
			CM.keyMap.pcDefault["F3"] = "findNext";
		}
		if (!extraKeysCommands.findPrev) {
			CM.keyMap.pcDefault["Shift-F3"] = "findPrev";
		}

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

	CM.prototype.getSection = function() {
		return this.display.wrapper.parentNode;
	}

	// preload the theme so that CodeMirror can calculate its metrics in DOMContentLoaded->setupLivePrefs()
	var theme = prefs.get("editor.theme");
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
		document.getElementById("options").addEventListener("change", acmeEventListener, false);
		setupLivePrefs(
			document.querySelectorAll("#options *[data-option][id^='editor.']")
				.map(function(option) { return option.id })
		);
	});

	hotkeyRerouter.setState(true);
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
				if (prefs.get(el.id) != value) {
					prefs.set(el.id, value);
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
	cm.on("blur", function(cm) {
		editors.lastActive = cm;
		hotkeyRerouter.setState(true);
		setTimeout(function() {
			var cm = editors.lastActive;
			var childFocused = cm.display.wrapper.contains(document.activeElement);
			cm.display.wrapper.classList.toggle("CodeMirror-active", childFocused);
		}, 0);
	});
	cm.on("focus", function() {
		hotkeyRerouter.setState(false);
		cm.display.wrapper.classList.add("CodeMirror-active");
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
	var section = cm.getSection();
	setCleanItem(section, cm.isClean(section.savedValue));
	updateTitle();
	updateLintReport(cm);
}

function getSectionForChild(e) {
	return e.closest("#sections > div");
}

function getSections() {
	return document.querySelectorAll("#sections > div");
}

// remind Chrome to repaint a previously invisible editor box by toggling any element's transform
// this bug is present in some versions of Chrome (v37-40 or something)
document.addEventListener("scroll", function(event) {
	var style = document.getElementById("name").style;
	style.webkitTransform = style.webkitTransform ? "" : "scale(1)";
});

// Shift-Ctrl-Wheel scrolls entire page even when mouse is over a code editor
document.addEventListener("wheel", function(event) {
	if (event.shiftKey && event.ctrlKey && !event.altKey && !event.metaKey) {
		// Chrome scrolls horizontally when Shift is pressed but on some PCs this might be different
		window.scrollBy(0, event.deltaX || event.deltaY);
		event.preventDefault();
	}
});

chrome.tabs.query({currentWindow: true}, function(tabs) {
	var windowId = tabs[0].windowId;
	if (prefs.get("openEditInWindow")) {
		if (tabs.length == 1 && window.history.length == 1) {
			chrome.windows.getAll(function(windows) {
				if (windows.length > 1) {
					sessionStorageHash("saveSizeOnClose").set(windowId, true);
					saveSizeOnClose = true;
				}
			});
		} else {
			saveSizeOnClose = sessionStorageHash("saveSizeOnClose").value[windowId];
		}
	}
	chrome.tabs.onRemoved.addListener(function(tabId, info) {
		sessionStorageHash("manageStylesHistory").unset(tabId);
		if (info.windowId == windowId && info.isWindowClosing) {
			sessionStorageHash("saveSizeOnClose").unset(windowId);
		}
	});
});

getActiveTab(function(tab) {
	useHistoryBack = sessionStorageHash("manageStylesHistory").value[tab.id] == location.href;
});

function goBackToManage(event) {
	if (useHistoryBack) {
		event.stopPropagation();
		event.preventDefault();
		history.back();
	}
}

window.onbeforeunload = function() {
	if (saveSizeOnClose) {
		prefs.set("windowPosition", {
			left: screenLeft,
			top: screenTop,
			width: outerWidth,
			height: outerHeight
		});
	}
	document.activeElement.blur();
	if (isCleanGlobal()) {
		return;
	}
	updateLintReport(null, 0);
	return confirm(t('styleChangesNotSaved'));
}

function addAppliesTo(list, name, value) {
	var showingEverything = list.querySelector(".applies-to-everything") != null;
	// blow away "Everything" if it's there
	if (showingEverything) {
		list.removeChild(list.firstChild);
	}
	var e;
	if (name && value) {
		e = template.appliesTo.cloneNode(true);
		e.querySelector("[name=applies-type]").value = name;
		e.querySelector("[name=applies-value]").value = value;
		e.querySelector(".remove-applies-to").addEventListener("click", removeAppliesTo, false);
	} else if (showingEverything || list.hasChildNodes()) {
		e = template.appliesTo.cloneNode(true);
		if (list.hasChildNodes()) {
			e.querySelector("[name=applies-type]").value = list.querySelector("li:last-child [name='applies-type']").value;
		}
		e.querySelector(".remove-applies-to").addEventListener("click", removeAppliesTo, false);
	} else {
		e = template.appliesToEverything.cloneNode(true);
	}
	e.querySelector(".add-applies-to").addEventListener("click", function() {addAppliesTo(this.parentNode.parentNode)}, false);
	list.appendChild(e);
}

function addSection(event, section) {
	var div = template.section.cloneNode(true);
	div.querySelector(".applies-to-help").addEventListener("click", showAppliesToHelp, false);
	div.querySelector(".remove-section").addEventListener("click", removeSection, false);
	div.querySelector(".add-section").addEventListener("click", addSection, false);
	div.querySelector(".beautify-section").addEventListener("click", beautify);

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
		var clickedSection = getSectionForChild(event.target);
		sections.insertBefore(div, clickedSection.nextElementSibling);
		var newIndex = getSections().indexOf(clickedSection) + 1;
		var cm = setupCodeMirror(codeElement, newIndex);
		makeSectionVisible(cm);
		cm.focus()
		renderLintReport();
	} else {
		sections.appendChild(div);
		var cm = setupCodeMirror(codeElement);
	}

	div.CodeMirror = cm;
	setCleanSection(div);
	return div;
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
	var section = getSectionForChild(event.target);
	var cm = section.CodeMirror;
	removeAreaAndSetDirty(section);
	editors.splice(editors.indexOf(cm), 1);
	renderLintReport();
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
	var section = cm.getSection();
	var bounds = section.getBoundingClientRect();
	if ((bounds.bottom > window.innerHeight && bounds.top > 0) || (bounds.top < 0 && bounds.bottom < window.innerHeight)) {
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
		findPrev: CodeMirror.commands.findPrev,
		replace: CodeMirror.commands.replace
	}
	var originalOpenDialog = CodeMirror.prototype.openDialog;
	var originalOpenConfirm = CodeMirror.prototype.openConfirm;

	var curState; // cm.state.search for last used 'find'

	function shouldIgnoreCase(query) { // treat all-lowercase non-regexp queries as case-insensitive
		return typeof query == "string" && query == query.toLowerCase();
	}

	function updateState(cm, newState) {
		if (!newState) {
			if (cm.state.search) {
				return cm.state.search;
			}
			if (!curState) {
				return null;
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

	// temporarily overrides the original openDialog with the provided template's innerHTML
	function customizeOpenDialog(cm, template, callback) {
		cm.openDialog = function(tmpl, cb, opt) {
			// invoke 'callback' and bind 'this' to the original callback
			originalOpenDialog.call(cm, template.innerHTML, callback.bind(cb), opt);
		};
		setTimeout(function() { cm.openDialog = originalOpenDialog; }, 0);
		refocusMinidialog(cm);
	}

	function focusClosestCM(activeCM) {
		editors.lastActive = activeCM;
		var cm = getEditorInSight();
		if (cm != activeCM) {
			cm.focus();
		}
		return cm;

	}

	function find(activeCM) {
		activeCM = focusClosestCM(activeCM);
		customizeOpenDialog(activeCM, template.find, function(query) {
			this(query);
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
		});
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

		var rxQuery = typeof state.query == "object"
			? state.query : stringAsRegExp(state.query, shouldIgnoreCase(state.query) ? "i" : "");

		if (document.activeElement && document.activeElement.name == "applies-value"
			&& searchAppliesTo(activeCM)) {
			return;
		}
		for (var i=0, cm=activeCM; i < editors.length; i++) {
			state = updateState(cm);
			if (!cm.hasFocus()) {
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
			} else if (!reverse && searchAppliesTo(cm)) {
				return;
			}
			cm = editors[(editors.indexOf(cm) + (reverse ? -1 + editors.length : 1)) % editors.length];
			if (reverse && searchAppliesTo(cm)) {
				return;
			}
		}
		// nothing found so far, so call the original search with wrap-around
		originalCommand[reverse ? "findPrev" : "findNext"](activeCM);

		function searchAppliesTo(cm) {
			var inputs = [].slice.call(cm.getSection().querySelectorAll(".applies-value"));
			if (reverse) {
				inputs = inputs.reverse();
			}
			inputs.splice(0, inputs.indexOf(document.activeElement) + 1);
			return inputs.some(function(input) {
				var match = rxQuery.exec(input.value);
				if (match) {
					input.focus();
					var end = match.index + match[0].length;
					// scroll selected part into view in long inputs,
					// works only outside of current event handlers chain, hence timeout=0
					setTimeout(function() {
						input.setSelectionRange(end, end);
						input.setSelectionRange(match.index, end)
					}, 0);
					return true;
				}
			});
		}
	}

	function findPrev(cm) {
		findNext(cm, true);
	}

	function replace(activeCM, all) {
		var queue, query, replacement;
		activeCM = focusClosestCM(activeCM);
		customizeOpenDialog(activeCM, template[all ? "replaceAll" : "replace"], function(txt) {
			query = txt;
			customizeOpenDialog(activeCM, template.replaceWith, function(txt) {
				replacement = txt;
				queue = editors.rotate(-editors.indexOf(activeCM));
				all ? editors.forEach(doReplace) : doReplace();
			});
			this(query);
		});
		originalCommand.replace(activeCM, all);

		function doReplace() {
			var cm = queue.shift();
			if (!cm) {
				if (!all) {
					editors.lastActive.focus();
				}
				return;
			}
			// hide the first two dialogs (replace, replaceWith)
			cm.openDialog = function(tmpl, callback, opt) {
				cm.openDialog = function(tmpl, callback, opt) {
					cm.openDialog = originalOpenDialog;
					if (all) {
						callback(replacement);
					} else {
						doConfirm(cm);
						callback(replacement);
						if (!cm.getWrapperElement().querySelector(".CodeMirror-dialog")) {
							// no dialog == nothing found in the current CM, move to the next
							doReplace();
						}
					}
				};
				callback(query);
			};
			originalCommand.replace(cm, all);
		}
		function doConfirm(cm) {
			var wrapAround = false;
			var origPos = cm.getCursor();
			cm.openConfirm = function overrideConfirm(tmpl, callbacks, opt) {
				var ovrCallbacks = callbacks.map(function(callback) {
					return function() {
						makeSectionVisible(cm);
						cm.openConfirm = overrideConfirm;
						setTimeout(function() { cm.openConfirm = originalOpenConfirm; }, 0);

						var pos = cm.getCursor();
						callback();
						var cmp = CodeMirror.cmpPos(cm.getCursor(), pos);
						wrapAround |= cmp <= 0;

						var dlg = cm.getWrapperElement().querySelector(".CodeMirror-dialog");
						if (!dlg || cmp == 0 || wrapAround && CodeMirror.cmpPos(cm.getCursor(), origPos) >= 0) {
							if (dlg) {
								dlg.remove();
							}
							doReplace();
						}
					}
				});
				originalOpenConfirm.call(cm, template.replaceConfirm.innerHTML, ovrCallbacks, opt);
			};
		}
	}

	function replaceAll(cm) {
		replace(cm, true);
	}

	CodeMirror.commands.find = find;
	CodeMirror.commands.findNext = findNext;
	CodeMirror.commands.findPrev = findPrev;
	CodeMirror.commands.replace = replace;
	CodeMirror.commands.replaceAll = replaceAll;
}

function jumpToLine(cm) {
	var cur = cm.getCursor();
	refocusMinidialog(cm);
	cm.openDialog(template.jumpToLine.innerHTML, function(str) {
		var m = str.match(/^\s*(\d+)(?:\s*:\s*(\d+))?\s*$/);
		if (m) {
			cm.setCursor(m[1] - 1, m[2] ? m[2] - 1 : cur.ch);
		}
	}, {value: cur.line+1});
}

function refocusMinidialog(cm) {
	var section = cm.getSection();
	if (!section.querySelector(".CodeMirror-dialog")) {
		return;
	}
	// close the currently opened minidialog
	cm.focus();
	// make sure to focus the input in newly opened minidialog
	setTimeout(function() {
		section.querySelector(".CodeMirror-dialog").focus();
	}, 0);
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
		cm = getSectionForChild(nearbyElement).CodeMirror;
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
		var bounds = cm.getSection().getBoundingClientRect();
		if (bounds.top < 0) {
			return -bounds.top;
		} else if (bounds.top < window.innerHeight - cm.defaultTextHeight() * LINES_VISIBLE) {
			return 0;
		} else {
			return bounds.top - bounds.height;
		}
	}
}

function updateLintReport(cm, delay) {
	if (delay == 0) {
		// immediately show pending csslint messages in onbeforeunload and save
		update.call(cm);
		return;
	}
	if (delay > 0) {
		// give csslint some time to find the issues, e.g. 500 (1/10 of our default 5s)
		// by settings its internal delay to 1ms and restoring it back later
		var lintOpt = editors[0].state.lint.options;
		setTimeout((function(opt, delay) {
			opt.delay = delay == 1 ? opt.delay : delay; // options object is shared between editors
			update(this);
		}).bind(cm, lintOpt, lintOpt.delay), delay);
		lintOpt.delay = 1;
		return;
	}
	// user is editing right now: postpone updating the report for the new issues (default: 500ms lint + 4500ms)
	// or update it as soon as possible (default: 500ms lint + 100ms) in case an existing issue was just fixed
	var state = cm.state.lint;
	clearTimeout(state.reportTimeout);
	state.reportTimeout = setTimeout(update.bind(cm), state.options.delay + 100);
	state.postponeNewIssues = delay == undefined || delay == null;

	function update() { // this == cm
		var scope = this ? [this] : editors;
		var changed = false;
		var fixedOldIssues = false;
		scope.forEach(function(cm) {
			var state = cm.state.lint;
			var oldMarkers = state.markedLast || {};
			var newMarkers = {};
			var html = state.marked.length == 0 ? "" : "<tbody>" +
				state.marked.map(function(mark) {
					var info = mark.__annotation;
					var isActiveLine = info.from.line == cm.getCursor().line;
					var pos = isActiveLine ? "cursor" : (info.from.line + "," + info.from.ch);
					var message = escapeHtml(info.message.replace(/ at line \d.+$/, ""));
					if (message.length > 100) {
						message = message.substr(0, 100) + "...";
					}
					if (isActiveLine || oldMarkers[pos] == message) {
						delete oldMarkers[pos];
					}
					newMarkers[pos] = message;
					return "<tr class='" + info.severity + "'>" +
						"<td role='severity' class='CodeMirror-lint-marker-" + info.severity + "'>" +
							info.severity + "</td>" +
						"<td role='line'>" + (info.from.line+1) + "</td>" +
						"<td role='sep'>:</td>" +
						"<td role='col'>" + (info.from.ch+1) + "</td>" +
						"<td role='message'>" + message + "</td></tr>";
				}).join("") + "</tbody>";
			state.markedLast = newMarkers;
			fixedOldIssues |= state.reportDisplayed && Object.keys(oldMarkers).length > 0;
			if (state.html != html) {
				state.html = html;
				changed = true;
			}
		});
		if (changed) {
			clearTimeout(state ? state.renderTimeout : undefined);
			if (!state || !state.postponeNewIssues || fixedOldIssues) {
				renderLintReport(true);
			} else {
				state.renderTimeout = setTimeout(function() {
					renderLintReport(true);
				}, CodeMirror.defaults.lintReportDelay);
			}
		}
	}
	function escapeHtml(html) {
		var chars = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': '&quot;', "'": '&#39;', "/": '&#x2F;'};
		return html.replace(/[&<>"'\/]/g, function(char) { return chars[char] });
	}
}

function renderLintReport(someBlockChanged) {
	var container = document.getElementById("lint");
	var content = container.children[1];
	var label = t("sectionCode");
	var newContent = content.cloneNode(false);
	var issueCount = 0;
	editors.forEach(function(cm, index) {
		if (cm.state.lint.html) {
			var newBlock = newContent.appendChild(document.createElement("table"));
			var html = "<caption>" + label + " " + (index+1) + "</caption>" + cm.state.lint.html;
			newBlock.innerHTML = html;
			newBlock.cm = cm;
			issueCount += newBlock.rows.length;

			var block = content.children[newContent.children.length - 1];
			var blockChanged = !block || cm != block.cm || html != block.innerHTML;
			someBlockChanged |= blockChanged;
			cm.state.lint.reportDisplayed = blockChanged;
		}
	});
	if (someBlockChanged || newContent.children.length != content.children.length) {
		document.getElementById('issue-count').textContent = issueCount;
		container.replaceChild(newContent, content);
		container.style.display = newContent.children.length ? "block" : "none";
		resizeLintReport(null, newContent);
	}
}

function resizeLintReport(event, content) {
	content = content || document.getElementById("lint").children[1];
	if (content.children.length) {
		var bounds = content.getBoundingClientRect();
		var newMaxHeight = bounds.bottom <= innerHeight ? '' : (innerHeight - bounds.top) + "px";
		if (newMaxHeight != content.style.maxHeight) {
			content.style.maxHeight = newMaxHeight;
		}
	}
}

function gotoLintIssue(event) {
	var issue = event.target.closest("tr");
	if (!issue) {
		return;
	}
	var block = issue.closest("table");
	makeSectionVisible(block.cm);
	block.cm.focus();
	block.cm.setSelection({
		line: parseInt(issue.querySelector("td[role='line']").textContent) - 1,
		ch: parseInt(issue.querySelector("td[role='col']").textContent) - 1
	});
}

function toggleLintReport() {
	document.getElementById("lint").classList.toggle("collapsed");
}

function beautify(event) {
	if (exports.css_beautify) { // thanks to csslint's definition of 'exports'
		doBeautify();
	} else {
		var script = document.head.appendChild(document.createElement("script"));
		script.src = "beautify/beautify-css.js";
		script.onload = doBeautify;
	}
	function doBeautify() {
		var tabs = prefs.get("editor.indentWithTabs");
		var options = prefs.get("editor.beautify");
		options.indent_size = tabs ? 1 : prefs.get("editor.tabSize");
		options.indent_char = tabs ? "\t" : " ";

		var section = getSectionForChild(event.target);
		var scope = section ? [section.CodeMirror] : editors;

		showHelp(t("styleBeautify"), "<div class='beautify-options'>" +
			optionHtml(".selector1,", "selector_separator_newline") +
			optionHtml(".selector2,", "newline_before_open_brace") +
			optionHtml("{", "newline_after_open_brace") +
			optionHtml("border: none;", "newline_between_properties", true) +
			optionHtml("display: block;", "newline_before_close_brace", true) +
			optionHtml("}", "newline_between_rules") +
			"</div>" +
			"<div><button role='undo'></button></div>");

		var undoButton = document.querySelector("#help-popup button[role='undo']");
		undoButton.textContent = t(scope.length == 1 ? "undo" : "undoGlobal");
		undoButton.addEventListener("click", function() {
			var undoable = false;
			scope.forEach(function(cm) {
				if (cm.beautifyChange && cm.beautifyChange[cm.changeGeneration()]) {
					delete cm.beautifyChange[cm.changeGeneration()];
					cm.undo();
					undoable |= cm.beautifyChange[cm.changeGeneration()];
				}
			});
			undoButton.disabled = !undoable;
		});

		scope.forEach(function(cm) {
			setTimeout(function() {
				var text = cm.getValue();
				var newText = exports.css_beautify(text, options);
				if (newText != text) {
					if (!cm.beautifyChange || !cm.beautifyChange[cm.changeGeneration()]) {
						// clear the list if last change wasn't a css-beautify
						cm.beautifyChange = {};
					}
					cm.setValue(newText);
					cm.beautifyChange[cm.changeGeneration()] = true;
					undoButton.disabled = false;
				}
			}, 0);
		});

		document.querySelector(".beautify-options").addEventListener("change", function(event) {
			var value = event.target.selectedIndex > 0;
			options[event.target.dataset.option] = value;
			prefs.set("editor.beautify", options);
			event.target.parentNode.setAttribute("newline", value.toString());
			doBeautify();
		});

		function optionHtml(label, optionName, indent) {
			var value = options[optionName];
			return "<div newline='" + value.toString() + "'>" +
				"<span" + (indent ? " indent" : "") + ">" + label + "</span>" +
				"<select data-option='" + optionName + "'>" +
					"<option" + (value ? "" : " selected") + ">&nbsp;</option>" +
					"<option" + (value ? " selected" : "") + ">\\n</option>" +
				"</select></div>";
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
	tE("heading", "editStyleHeading", null, false);
	requestStyle();
	function requestStyle() {
		chrome.runtime.sendMessage({method: "getStyles", id: params.id}, function callback(styles) {
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
	document.getElementById("enabled").checked = style.enabled;
	document.getElementById("url").href = style.url;
	// if this was done in response to an update, we need to clear existing sections
	getSections().forEach(function(div) { div.remove(); });
	var queue = style.sections.length ? style.sections : [{code: ""}];
	var queueStart = new Date().getTime();
	// after 100ms the sections will be added asynchronously
	while (new Date().getTime() - queueStart <= 100 && queue.length) {
		add();
	}
	(function processQueue() {
		if (queue.length) {
			add();
			setTimeout(processQueue, 0);
		}
	})();
	initHooks();

	function add() {
		var sectionDiv = addSection(null, queue.shift());
		maximizeCodeHeight(sectionDiv, !queue.length);
		updateLintReport(sectionDiv.CodeMirror, prefs.get("editor.lintDelay"));
	}
}

function initHooks() {
	document.querySelectorAll("#header .style-contributor").forEach(function(node) {
		node.addEventListener("change", onChange);
		node.addEventListener("input", onChange);
	});
	document.getElementById("to-mozilla").addEventListener("click", showMozillaFormat, false);
	document.getElementById("to-mozilla-help").addEventListener("click", showToMozillaHelp, false);
	document.getElementById("from-mozilla").addEventListener("click", fromMozillaFormat);
	document.getElementById("beautify").addEventListener("click", beautify);
	document.getElementById("save-button").addEventListener("click", save, false);
	document.getElementById("sections-help").addEventListener("click", showSectionHelp, false);
	document.getElementById("keyMap-help").addEventListener("click", showKeyMapHelp, false);
	document.getElementById("cancel-button").addEventListener("click", goBackToManage);
	document.getElementById("lint-help").addEventListener("click", showLintHelp);
	document.getElementById("lint").addEventListener("click", gotoLintIssue);
	window.addEventListener("resize", resizeLintReport);

	// touch devices don't have onHover events so the element we'll be toggled via clicking (touching)
	if ("ontouchstart" in document.body) {
		document.querySelector("#lint h2").addEventListener("click", toggleLintReport);
	}

	setupGlobalSearch();
	setCleanGlobal();
	updateTitle();
}

function maximizeCodeHeight(sectionDiv, isLast) {
	var cm = sectionDiv.CodeMirror;
	var stats = maximizeCodeHeight.stats = maximizeCodeHeight.stats || {totalHeight: 0, deltas: []};
	if (!stats.cmActualHeight) {
		stats.cmActualHeight = getComputedHeight(cm.display.wrapper);
	}
	if (!stats.sectionMarginTop) {
		stats.sectionMarginTop = parseFloat(getComputedStyle(sectionDiv).marginTop);
	}
	var sectionTop = sectionDiv.getBoundingClientRect().top - stats.sectionMarginTop;
	if (!stats.firstSectionTop) {
		stats.firstSectionTop = sectionTop;
	}
	var extrasHeight = getComputedHeight(sectionDiv) - stats.cmActualHeight;
	var cmMaxHeight = window.innerHeight - extrasHeight - sectionTop - stats.sectionMarginTop;
	var cmDesiredHeight = cm.display.sizer.clientHeight + 2*cm.defaultTextHeight();
	var cmGrantableHeight = Math.max(stats.cmActualHeight, Math.min(cmMaxHeight, cmDesiredHeight));
	stats.deltas.push(cmGrantableHeight - stats.cmActualHeight);
	stats.totalHeight += cmGrantableHeight + extrasHeight;
	if (!isLast) {
		return;
	}
	stats.totalHeight += stats.firstSectionTop;
	if (stats.totalHeight <= window.innerHeight) {
		editors.forEach(function(cm, index) {
			cm.setSize(null, stats.deltas[index] + stats.cmActualHeight);
		});
		return;
	}
	// scale heights to fill the gap between last section and bottom edge of the window
	var sections = document.getElementById("sections");
	var available = window.innerHeight - sections.getBoundingClientRect().bottom -
		parseFloat(getComputedStyle(sections).marginBottom);
	if (available <= 0) {
		return;
	}
	var totalDelta = stats.deltas.reduce(function(sum, d) { return sum + d; }, 0);
	var q = available / totalDelta;
	var baseHeight = stats.cmActualHeight - stats.sectionMarginTop;
	stats.deltas.forEach(function(delta, index) {
		editors[index].setSize(null, baseHeight + Math.floor(q * delta));
	});
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
			if (li.className == template.appliesToEverything.className) {
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
	updateLintReport(null, 0);

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
		sections: getSectionsHashes()
	};
	chrome.runtime.sendMessage(request, saveComplete);
}

function getSectionsHashes() {
	var sections = [];
	getSections().forEach(function(div) {
		var meta = getMeta(div);
		var code = div.CodeMirror.getValue();
		if (/^\s*$/.test(code) && Object.keys(meta).length == 0) {
			return;
		}
		meta.code = code;
		sections.push(meta);
	});
	return sections;
}

function getMeta(e) {
	var meta = {urls: [], urlPrefixes: [], domains: [], regexps: []};
	e.querySelector(".applies-to-list").childNodes.forEach(function(li) {
		if (li.className == template.appliesToEverything.className) {
			return;
		}
		var type = li.querySelector("[name=applies-type]").value;
		var value = li.querySelector("[name=applies-value]").value;
		if (type && value) {
			var property = CssToProperty[type];
			meta[property].push(value);
		}
	});
	return meta;
}

function saveComplete(style) {
	styleId = style.id;
	setCleanGlobal();

	// Go from new style URL to edit style URL
	if (location.href.indexOf("id=") == -1) {
		history.replaceState({}, document.title, "edit.html?id=" + style.id);
		tE("heading", "editStyleHeading", null, false);
	}
	updateTitle();
}

function showMozillaFormat() {
	var popup = showCodeMirrorPopup(t("styleToMozillaFormatTitle"), "", {readOnly: true});
	popup.codebox.setValue(toMozillaFormat());
	popup.codebox.execCommand("selectAll");
}

function toMozillaFormat() {
	return getSectionsHashes().map(function(section) {
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

function fromMozillaFormat() {
	var popup = showCodeMirrorPopup(t("styleFromMozillaFormatPrompt"), tHTML("<div>\
		<button name='import-append' i18n-text='importAppendLabel' i18n-title='importAppendTooltip'></button>\
		<button name='import-replace' i18n-text='importReplaceLabel' i18n-title='importReplaceTooltip'></button>\
		</div>").innerHTML);

	var contents = popup.querySelector(".contents");
	contents.insertBefore(popup.codebox.display.wrapper, contents.firstElementChild);
	popup.codebox.focus();

	popup.querySelector("[name='import-append']").addEventListener("click", doImport);
	popup.querySelector("[name='import-replace']").addEventListener("click", doImport);

	popup.codebox.on("change", function() {
		clearTimeout(popup.mozillaTimeout);
		popup.mozillaTimeout = setTimeout(function() {
			popup.classList.toggle("ready", trimNewLines(popup.codebox.getValue()));
		}, 100);
	});

	function doImport() {
		var replaceOldStyle = this.name == "import-replace";
		popup.querySelector(".close-icon").click();
		var mozStyle = trimNewLines(popup.codebox.getValue());
		var parser = new exports.css.Parser(), lines = mozStyle.split("\n");
		var sectionStack = [{code: "", start: {line: 1, col: 1}}];
		var errors = "", oldSectionCount = editors.length;
		var firstAddedCM;

		parser.addListener("startdocument", function(e) {
			var outerText = getRange(sectionStack.last.start, (--e.col, e));
			var gapComment = outerText.match(/(\/\*[\s\S]*?\*\/)[\s\n]*$/);
			var section = {code: "", start: backtrackTo(this, exports.css.Tokens.LBRACE, "end")};
			// move last comment before @-moz-document inside the section
			if (gapComment && !gapComment[1].match(/\/\*\s*AGENT_SHEET\s*\*\//)) {
				section.code = gapComment[1] + "\n";
				outerText = trimNewLines(outerText.substring(0, gapComment.index));
			}
			if (outerText) {
				sectionStack.last.code = outerText;
				doAddSection(sectionStack.last);
				sectionStack.last.code = "";
			}
			e.functions.forEach(function(f) {
				var m = f.match(/^(url|url-prefix|domain|regexp)\((['"]?)(.+?)\2?\)$/);
				var aType = CssToProperty[m[1]];
				var aValue = aType != "regexps" ? m[3] : m[3].replace(/\\\\/g, "\\");
				(section[aType] = section[aType] || []).push(aValue);
			});
			sectionStack.push(section);
		});

		parser.addListener("enddocument", function(e) {
			var end = backtrackTo(this, exports.css.Tokens.RBRACE, "start");
			var section = sectionStack.pop();
			section.code += getRange(section.start, end);
			sectionStack.last.start = (++end.col, end);
			doAddSection(section);
		});

		parser.addListener("endstylesheet", function() {
			// add nonclosed outer sections (either broken or the last global one)
			var endOfText = {line: lines.length, col: lines.last.length + 1};
			sectionStack.last.code += getRange(sectionStack.last.start, endOfText);
			sectionStack.forEach(doAddSection);

			delete maximizeCodeHeight.stats;
			editors.forEach(function(cm) {
				maximizeCodeHeight(cm.getSection(), cm == editors.last);
			});

			makeSectionVisible(firstAddedCM);
			firstAddedCM.focus();

			if (errors) {
				showHelp(t("issues"), errors);
			}
		});

		parser.addListener("error", function(e) {
			errors += e.line + ":" + e.col + " " + e.message.replace(/ at line \d.+$/, "") + "<br>";
		});

		parser.parse(mozStyle);

		function getRange(start, end) {
			if (start.line == end.line) {
				return lines[start.line - 1].substr(start.col - 1, end.col - start.col + 1).trim();
			} else {
				return trimNewLines(lines[start.line - 1].substr(start.col - 1) + "\n" +
					lines.slice(start.line, end.line - 1).join("\n") +
					"\n" + lines[end.line - 1].substring(0, end.col - 1));
			}
		}
		function doAddSection(section) {
			if (!firstAddedCM) {
				if (!initFirstSection(section)) {
					return;
				}
			}
			// don't add empty sections
			if (!(section.code || section.urls || section.urlPrefixes || section.domains || section.regexps)) {
				return;
			}
			setCleanItem(addSection(null, section), false);
			firstAddedCM = firstAddedCM || editors.last;
		}
		// do onetime housekeeping as the imported text is confirmed to be a valid style
		function initFirstSection(section) {
			// skip adding the first global section when there's no code/comments
			if (!section.code.replace("@namespace url(http://www.w3.org/1999/xhtml);", "") /* ignore boilerplate NS */
					.replace(/[\s\n]/g, "")) { /* ignore all whitespace including new lines */
				return false;
			}
			if (replaceOldStyle) {
				editors.slice(0).reverse().forEach(function(cm) {
					removeSection({target: cm.getSection().firstElementChild});
				});
			} else if (!editors.last.getValue()) {
				// nuke the last blank section
				if (editors.last.getSection().querySelector(".applies-to-everything")) {
					removeSection({target: editors.last.getSection()});
				}
			}
			return true;
		}
	}
	function backtrackTo(parser, tokenType, startEnd) {
		var tokens = parser._tokenStream._lt;
		for (var i = tokens.length - 2; i >= 0; --i) {
			if (tokens[i].type == tokenType) {
				return {line: tokens[i][startEnd+"Line"], col: tokens[i][startEnd+"Col"]};
			}
		}
	}
	function trimNewLines(s) {
		return s.replace(/^[\s\n]+/, "").replace(/[\s\n]+$/, "");
	}
}

function showSectionHelp() {
	showHelp(t("styleSectionsTitle"), t("sectionHelp"));
}

function showAppliesToHelp() {
	showHelp(t("appliesLabel"), t("appliesHelp"));
}

function showToMozillaHelp() {
	showHelp(t("styleMozillaFormatHeading"), t("styleToMozillaFormatHelp"));
}

function showKeyMapHelp() {
	var keyMap = mergeKeyMaps({}, prefs.get("editor.keyMap"), CodeMirror.defaults.extraKeys);
	var keyMapSorted = Object.keys(keyMap)
		.map(function(key) { return {key: key, cmd: keyMap[key]} })
		.concat([{key: "Shift-Ctrl-Wheel", cmd: "scrollWindow"}])
		.sort(function(a, b) { return a.cmd < b.cmd || (a.cmd == b.cmd && a.key < b.key) ? -1 : 1 });
	showHelp(t("cm_keyMap") + ": " + prefs.get("editor.keyMap"),
		'<table class="keymap-list">' +
			'<thead><tr><th><input placeholder="' + t("helpKeyMapHotkey") + '" type="search"></th>' +
				'<th><input placeholder="' + t("helpKeyMapCommand") + '" type="search"></th></tr></thead>' +
			"<tbody>" + keyMapSorted.map(function(value) {
				return "<tr><td>" + value.key + "</td><td>" + value.cmd + "</td></tr>";
			}).join("") +
			"</tbody>" +
		"</table>");

	var table = document.querySelector("#help-popup table");
	table.addEventListener("input", filterTable);

	var inputs = table.querySelectorAll("input");
	inputs[0].addEventListener("keydown", hotkeyHandler);
	inputs[1].focus();

	function hotkeyHandler(event) {
		var keyName = CodeMirror.keyName(event);
		if (keyName == "Esc" || keyName == "Tab" || keyName == "Shift-Tab") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		// normalize order of modifiers,
		// for modifier-only keys ("Ctrl-Shift") a dummy main key has to be temporarily added
		var keyMap = {};
		keyMap[keyName.replace(/(Shift|Ctrl|Alt|Cmd)$/, "$&-dummy")] = "";
		var normalizedKey = Object.keys(CodeMirror.normalizeKeyMap(keyMap))[0];
		this.value = normalizedKey.replace("-dummy", "");
		filterTable(event);
	}
	function filterTable(event) {
		var input = event.target;
		var query = stringAsRegExp(input.value, "gi");
		var col = input.parentNode.cellIndex;
		inputs[1 - col].value = "";
		table.tBodies[0].childNodes.forEach(function(row) {
			var cell = row.children[col];
			cell.innerHTML = cell.textContent.replace(query, "<mark>$&</mark>");
			row.style.display = query.test(cell.textContent) ? "" : "none";
			// clear highlight from the other column
			cell = row.children[1 - col];
			cell.innerHTML = cell.textContent;
		});
	}
	function mergeKeyMaps(merged) {
		[].slice.call(arguments, 1).forEach(function(keyMap) {
			if (typeof keyMap == "string") {
				keyMap = CodeMirror.keyMap[keyMap];
			}
			Object.keys(keyMap).forEach(function(key) {
				var cmd = keyMap[key];
				// filter out '...', 'attach', etc. (hotkeys start with an uppercase letter)
				if (!merged[key] && !key.match(/^[a-z]/) && cmd != "...") {
					if (typeof cmd == "function") {
						// for 'emacs' keymap: provide at least something meaningful (hotkeys and the function body)
						// for 'vim*' keymaps: almost nothing as it doesn't rely on CM keymap mechanism
						cmd = cmd.toString().replace(/^function.*?\{[\s\r\n]*([\s\S]+?)[\s\r\n]*\}$/, "$1");
						merged[key] = cmd.length <= 200 ? cmd : cmd.substr(0, 200) + "...";
					} else {
						merged[key] = cmd;
					}
				}
			});
			if (keyMap.fallthrough) {
				merged = mergeKeyMaps(merged, keyMap.fallthrough);
			}
		});
		return merged;
	}
}

function showLintHelp() {
	showHelp(t("issues"), t("issuesHelp") + "<ul>" +
		CSSLint.getRules().map(function(rule) {
			return "<li><b>" + rule.name + "</b><br>" + rule.desc + "</li>";
		}).join("") + "</ul>"
	);
}

function showHelp(title, text) {
	var div = document.getElementById("help-popup");
	div.classList.remove("big");
	div.querySelector(".contents").innerHTML = text;
	div.querySelector(".title").innerHTML = title;

	if (getComputedStyle(div).display == "none") {
		document.addEventListener("keydown", closeHelp);
		div.querySelector(".close-icon").onclick = closeHelp; // avoid chaining on multiple showHelp() calls
	}

	div.style.display = "block";
	return div;

	function closeHelp(e) {
		if (e.type == "click" || (e.keyCode == 27 && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey)) {
			div.style.display = "";
			document.querySelector(".contents").innerHTML = "";
			document.removeEventListener("keydown", closeHelp);
		}
	}
}

function showCodeMirrorPopup(title, html, options) {
	var popup = showHelp(title, html);
	popup.classList.add("big");

	popup.codebox = CodeMirror(popup.querySelector(".contents"), shallowMerge({
		mode: "css",
		lineNumbers: true,
		lineWrapping: true,
		foldGutter: true,
		gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
		matchBrackets: true,
		lint: {getAnnotations: CodeMirror.lint.css, delay: 0},
		styleActiveLine: true,
		theme: prefs.get("editor.theme"),
		keyMap: prefs.get("editor.keyMap")
	}, options));
	popup.codebox.focus();
	popup.codebox.on("focus", function() { hotkeyRerouter.setState(false) });
	popup.codebox.on("blur", function() { hotkeyRerouter.setState(true) });
	return popup;
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

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
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

function stringAsRegExp(s, flags) {
	return new RegExp(s.replace(/[{}()\[\]\/\\.+?^$:=*!|]/g, "\\$&"), flags);
}

function getComputedHeight(el) {
	var compStyle = getComputedStyle(el);
	return el.getBoundingClientRect().height +
		parseFloat(compStyle.marginTop) + parseFloat(compStyle.marginBottom);
}
