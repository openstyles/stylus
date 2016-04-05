function getDatabase(ready, error) {
	var dbOpenRequest = window.indexedDB.open("stylish", 2);
	dbOpenRequest.onsuccess = function(e) {
		ready(e.target.result);
	};
	dbOpenRequest.onerror = function(event) {
		console.log(event.target.errorCode);
		if (error) {
			error(event);
		}
	};
	dbOpenRequest.onupgradeneeded = function(event) {
		if (event.oldVersion == 0) {
			var os = event.target.result.createObjectStore("styles", {keyPath: 'id', autoIncrement: true});
			webSqlStorage.migrate();
		}
	}
};

var cachedStyles = null;
function getStyles(options, callback) {
	if (cachedStyles != null) {
		callback(filterStyles(cachedStyles, options));
		return;
	}
	getDatabase(function(db) {
		var tx = db.transaction(["styles"], "readonly");
		var os = tx.objectStore("styles");
		var all = [];
		os.openCursor().onsuccess = function(event) {
			var cursor = event.target.result;
			if (cursor) {
				var s = cursor.value
				s.id = cursor.key
				all.push(cursor.value);
				cursor.continue();
			} else {
				cachedStyles = all;
				callback(filterStyles(all, options));
			}
		};
  }, null);
}

function invalidateCache(andNotify) {
	cachedStyles = null;
	if (andNotify) {
		chrome.runtime.sendMessage({method: "invalidateCache"});
	}
}

function filterStyles(styles, options) {
	var enabled = fixBoolean(options.enabled);
	var url = "url" in options ? options.url : null;
	var id = "id" in options ? Number(options.id) : null;
	var matchUrl = "matchUrl" in options ? options.matchUrl : null;

	if (enabled != null) {
		styles = styles.filter(function(style) {
			return style.enabled == enabled;
		});
	}
	if (url != null) {
		styles = styles.filter(function(style) {
			return style.url == url;
		});
	}
	if (id != null) {
		styles = styles.filter(function(style) {
			return style.id == id;
		});
	}
	if (matchUrl != null) {
		// Return as a hash from style to applicable sections? Can only be used with matchUrl.
		var asHash = "asHash" in options ? options.asHash : false;
		if (asHash) {
			var h = {disableAll: prefs.get("disableAll", false)};
			styles.forEach(function(style) {
				var applicableSections = getApplicableSections(style, matchUrl);
				if (applicableSections.length > 0) {
					h[style.id] = applicableSections;
				}
			});
			return h;
		}
		styles = styles.filter(function(style) {
			var applicableSections = getApplicableSections(style, matchUrl);
			return applicableSections.length > 0;
		});
	}
	return styles;
}

function saveStyle(o, callback) {
	getDatabase(function(db) {
		var tx = db.transaction(["styles"], "readwrite");
		var os = tx.objectStore("styles");

		// Update
		if (o.id) {
			var request = os.get(Number(o.id));
			request.onsuccess = function(event) {
				var style = request.result;
				for (var prop in o) {
					if (prop == "id") {
						continue;
					}
					style[prop] = o[prop];
				}
				request = os.put(style);
				request.onsuccess = function(event) {
					notifyAllTabs({method: "styleUpdated", style: style});
					invalidateCache(true);
					if (callback) {
						callback(style);
					}
				};
			};
			return;
		}

		// Create
		// Set optional things to null if they're undefined
		["updateUrl", "md5Url", "url", "originalMd5"].filter(function(att) {
			return !(att in o);
		}).forEach(function(att) {
			o[att] = null;
		});
		// Set other optional things to empty array if they're undefined
		o.sections.forEach(function(section) {
			["urls", "urlPrefixes", "domains", "regexps"].forEach(function(property) {
				if (!section[property]) {
					section[property] = [];
				}
			});
		});
		// Set to enabled if not set
		if (!("enabled" in o)) {
			o.enabled = true;
		}
		// Make sure it's not null - that makes indexeddb sad
		delete o["id"];
		var request = os.add(o);
		request.onsuccess = function(event) {
			invalidateCache(true);
			// Give it the ID that was generated
			o.id = event.target.result;
			notifyAllTabs({method: "styleAdded", style: o});
			if (callback) {
				callback(o);
			}
		};
	});
}

function enableStyle(id, enabled) {
	saveStyle({id: id, enabled: enabled}, function(style) {
		handleUpdate(style);
		notifyAllTabs({method: "styleUpdated", style: style});
	});
}

function deleteStyle(id) {
	getDatabase(function(db) {
		var tx = db.transaction(["styles"], "readwrite");
		var os = tx.objectStore("styles");
		var request = os.delete(Number(id));
		request.onsuccess = function(event) {
			handleDelete(id);
			invalidateCache(true);
			notifyAllTabs({method: "styleDeleted", id: id});
		};
	});
}

function reportError() {
	for (i in arguments) {
		if ("message" in arguments[i]) {
			//alert(arguments[i].message);
			console.log(arguments[i].message);
		}
	}
}

function fixBoolean(b) {
	if (typeof b != "undefined") {
		return b != "false";
	}
	return null;
}

function getDomains(url) {
	if (url.indexOf("file:") == 0) {
		return [];
	}
	var d = /.*?:\/*([^\/:]+)/.exec(url)[1];
	var domains = [d];
	while (d.indexOf(".") != -1) {
		d = d.substring(d.indexOf(".") + 1);
		domains.push(d);
	}
	return domains;
}

function getType(o) {
	if (typeof o == "undefined" || typeof o == "string") {
		return typeof o;
	}
	if (o instanceof Array) {
		return "array";
	}
	throw "Not supported - " + o;
}

var namespacePattern = /^\s*(@namespace[^;]+;\s*)+$/;
function getApplicableSections(style, url) {
	var sections = style.sections.filter(function(section) {
		return sectionAppliesToUrl(section, url);
	});
	// ignore if it's just namespaces
	if (sections.length == 1 && namespacePattern.test(sections[0].code)) {
		return [];
	}
	return sections;
}

function sectionAppliesToUrl(section, url) {
	// only http, https, file, and chrome-extension allowed
	if (url.indexOf("http") != 0 && url.indexOf("file") != 0 && url.indexOf("chrome-extension") != 0 && url.indexOf("ftp") != 0) {
		return false;
	}
	// other extensions can't be styled
	if (url.indexOf("chrome-extension") == 0 && url.indexOf(chrome.extension.getURL("")) != 0) {
		return false;
	}
	if (section.urls.length == 0 && section.domains.length == 0 && section.urlPrefixes.length == 0 && section.regexps.length == 0) {
		//console.log(section.id + " is global");
		return true;
	}
	if (section.urls.indexOf(url) != -1) {
		//console.log(section.id + " applies to " + url + " due to URL rules");
		return true;
	}
	if (section.urlPrefixes.some(function(prefix) {
		return url.indexOf(prefix) == 0;
	})) {
		//console.log(section.id + " applies to " + url + " due to URL prefix rules");
		return true;
	}
	if (section.domains.length > 0 && getDomains(url).some(function(domain) {
		return section.domains.indexOf(domain) != -1;
	})) {
		//console.log(section.id + " applies due to " + url + " due to domain rules");
		return true;
	}
	if (section.regexps.some(function(regexp) {
		// we want to match the full url, so add ^ and $ if not already present
		if (regexp[0] != "^") {
			regexp = "^" + regexp;
		}
		if (regexp[regexp.length - 1] != "$") {
			regexp += "$";
		}
		var re = runTryCatch(function() { return new RegExp(regexp) });
		if (re) {
			return (re).test(url);
		} else {
			console.log(section.id + "'s regexp '" + regexp + "' is not valid");
		}
	})) {
		//console.log(section.id + " applies to " + url + " due to regexp rules");
		return true;
	}
	//console.log(section.id + " does not apply due to " + url);
	return false;
}

function isCheckbox(el) {
	return el.nodeName.toLowerCase() == "input" && "checkbox" == el.type.toLowerCase();
}

// js engine can't optimize the entire function if it contains try-catch
// so we should keep it isolated from normal code in a minimal wrapper
function runTryCatch(func) {
	try { return func() }
	catch(e) {}
}

// Accepts an array of pref names (values are fetched via prefs.get)
// and establishes a two-way connection between the document elements and the actual prefs
function setupLivePrefs(IDs) {
	var localIDs = {};
	IDs.forEach(function(id) {
		localIDs[id] = true;
		updateElement(id).addEventListener("change", function() {
			prefs.set(this.id, isCheckbox(this) ? this.checked : this.value);
		});
	});
	chrome.runtime.onMessage.addListener(function(request) {
		if (request.prefName in localIDs) {
			updateElement(request.prefName);
		}
	});
	function updateElement(id) {
		var el = document.getElementById(id);
		el[isCheckbox(el) ? "checked" : "value"] = prefs.get(id);
		el.dispatchEvent(new Event("change", {bubbles: true, cancelable: true}));
		return el;
	}
}

var prefs = chrome.extension.getBackgroundPage().prefs || new function Prefs() {
	var me = this;

	var defaults = {
		"openEditInWindow": false,      // new editor opens in a own browser window
		"windowPosition": {},           // detached window position
		"show-badge": true,             // display text on popup menu icon
		"disableAll": false,            // boss key
		"analyticsEnabled": true,       // hit up GA on startup

		"popup.breadcrumbs": true,      // display "New style" links as URL breadcrumbs
		"popup.breadcrumbs.usePath": false, // use URL path for "this URL"
		"popup.enabledFirst": true,     // display enabled styles before disabled styles
		"popup.stylesFirst": true,      // display enabled styles before disabled styles

		"manage.onlyEnabled": false,    // display only enabled styles
		"manage.onlyEdited": false,     // display only styles created locally

		"editor.options": {},           // CodeMirror.defaults.*
		"editor.lineWrapping": true,    // word wrap
		"editor.smartIndent": true,     // "smart" indent
		"editor.indentWithTabs": false, // smart indent with tabs
		"editor.tabSize": 4,            // tab width, in spaces
		"editor.keyMap": navigator.appVersion.indexOf("Windows") > 0 ? "sublime" : "default",
		"editor.theme": "default",      // CSS theme
		"editor.beautify": {            // CSS beautifier
			selector_separator_newline: true,
			newline_before_open_brace: false,
			newline_after_open_brace: true,
			newline_between_properties: true,
			newline_before_close_brace: true,
			newline_between_rules: false,
			end_with_newline: false
		},
		"editor.lintDelay": 500,        // lint gutter marker update delay, ms
		"editor.lintReportDelay": 4500, // lint report update delay, ms
	};
	var values = deepCopy(defaults);

	var syncTimeout; // see broadcast() function below

	Object.defineProperty(this, "readOnlyValues", {value: {}});

	Prefs.prototype.get = function(key, defaultValue) {
		if (key in values) {
			return values[key];
		}
		if (defaultValue !== undefined) {
			return defaultValue;
		}
		if (key in defaults) {
			return defaults[key];
		}
		console.warn("No default preference for '%s'", key);
	};

	Prefs.prototype.getAll = function(key) {
		return deepCopy(values);
	};

	Prefs.prototype.set = function(key, value, options) {
		var oldValue = deepCopy(values[key]);
		values[key] = value;
		defineReadonlyProperty(this.readOnlyValues, key, value);
		if ((!options || !options.noBroadcast) && !equal(value, oldValue)) {
			me.broadcast(key, value, options);
		}
	};

	Prefs.prototype.remove = function(key) { me.set(key, undefined) };

	Prefs.prototype.broadcast = function(key, value, options) {
		var message = {method: "prefChanged", prefName: key, value: value};
		notifyAllTabs(message);
		chrome.runtime.sendMessage(message);
		if (key == "disableAll") {
			notifyAllTabs({method: "styleDisableAll", disableAll: value});
		}
		if (!options || !options.noSync) {
			clearTimeout(syncTimeout);
			syncTimeout = setTimeout(function() {
				getSync().set({"settings": values});
			}, 0);
		}
	};

	Object.keys(defaults).forEach(function(key) {
		me.set(key, defaults[key], {noBroadcast: true});
	});

	getSync().get("settings", function(result) {
		var synced = result.settings;
		for (var key in defaults) {
			if (synced && (key in synced)) {
				me.set(key, synced[key], {noSync: true});
			} else {
				var value = tryMigrating(key);
				if (value !== undefined) {
					me.set(key, value);
				}
			}
		}
	});

	chrome.storage.onChanged.addListener(function(changes, area) {
		if (area == "sync" && "settings" in changes) {
			var synced = changes.settings.newValue;
			if (synced) {
				for (key in defaults) {
					if (key in synced) {
						me.set(key, synced[key], {noSync: true});
					}
				}
			} else {
				// user manually deleted our settings, we'll recreate them
				getSync().set({"settings": values});
			}
		}
	});

	function tryMigrating(key) {
		if (!(key in localStorage)) {
			return undefined;
		}
		var value = localStorage[key];
		delete localStorage[key];
		localStorage["DEPRECATED: " + key] = value;
		switch (typeof defaults[key]) {
			case "boolean":
				return value.toLowerCase() === "true";
			case "number":
				return Number(value);
			case "object":
				try {
					return JSON.parse(value);
				} catch(e) {
					console.log("Cannot migrate from localStorage %s = '%s': %o", key, value, e);
					return undefined;
				}
		}
		return value;
	}
};

function getCodeMirrorThemes(callback) {
	chrome.runtime.getPackageDirectoryEntry(function(rootDir) {
		rootDir.getDirectory("codemirror/theme", {create: false}, function(themeDir) {
			themeDir.createReader().readEntries(function(entries) {
				var themes = [chrome.i18n.getMessage("defaultTheme")];
				entries
					.filter(function(entry) { return entry.isFile })
					.sort(function(a, b) { return a.name < b.name ? -1 : 1 })
					.forEach(function(entry) {
						themes.push(entry.name.replace(/\.css$/, ""));
					});
				if (callback) {
					callback(themes);
				}
			});
		});
	});
}

function sessionStorageHash(name) {
	var hash = {
		value: {},
		set: function(k, v) { this.value[k] = v; this.updateStorage(); },
		unset: function(k) { delete this.value[k]; this.updateStorage(); },
		updateStorage: function() {
			sessionStorage[this.name] = JSON.stringify(this.value);
		}
	};
	try { hash.value = JSON.parse(sessionStorage[name]); } catch(e) {}
	Object.defineProperty(hash, "name", {value: name});
	return hash;
}

function deepCopy(obj) {
	if (!obj || typeof obj != "object") {
		return obj;
	} else {
		var emptyCopy = Object.create(Object.getPrototypeOf(obj));
		return deepMerge(emptyCopy, obj);
	}
}

function deepMerge(target, obj1 /* plus any number of object arguments */) {
	for (var i = 1; i < arguments.length; i++) {
		var obj = arguments[i];
		for (var k in obj) {
			// hasOwnProperty checking is not needed for our non-OOP stuff
			var value = obj[k];
			if (!value || typeof value != "object") {
				target[k] = value;
			} else if (k in target) {
				deepMerge(target[k], value);
			} else {
				target[k] = deepCopy(value);
			}
		}
	}
	return target;
}

function shallowMerge(target, obj1 /* plus any number of object arguments */) {
	for (var i = 1; i < arguments.length; i++) {
		var obj = arguments[i];
		for (var k in obj) {
			target[k] = obj[k];
			// hasOwnProperty checking is not needed for our non-OOP stuff
		}
	}
	return target;
}

function equal(a, b) {
	if (!a || !b || typeof a != "object" || typeof b != "object") {
		return a === b;
	}
	if (Object.keys(a).length != Object.keys(b).length) {
		return false;
	}
	for (var k in a) {
		if (a[k] !== b[k]) {
			return false;
		}
	}
	return true;
}

function defineReadonlyProperty(obj, key, value) {
	var copy = deepCopy(value);
	// In ES6, freezing a literal is OK (it returns the same value), but in previous versions it's an exception.
	if (typeof copy == "object") {
		Object.freeze(copy);
	}
	Object.defineProperty(obj, key, {value: copy, configurable: true})
}

// Polyfill, can be removed when Firefox gets this - https://bugzilla.mozilla.org/show_bug.cgi?id=1220494
function getSync() {
	if ("sync" in chrome.storage) {
		return chrome.storage.sync;
	}
	crappyStorage = {};
	return {
		get: function(key, callback) {
			callback(crappyStorage[key] || {});
		},
		set: function(source, callback) {
			for (var property in source) {
					if (source.hasOwnProperty(property)) {
							crappyStorage[property] = source[property];
					}
			}
			callback();
		}
	}
}
