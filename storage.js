var stylishDb = null;
function getDatabase(ready, error) {
	if (stylishDb != null && stylishDb.version == "1.5") {
		ready(stylishDb);
		return;
	}
	try {
		stylishDb = openDatabase('stylish', '', 'Stylish Styles', 5*1024*1024);
	} catch (ex) {
		error();
		throw ex;
	}
	if (stylishDb.version == "1.0" || stylishDb.version == "") {
		dbV11(stylishDb, error, ready);
	} else if (stylishDb.version == "1.1") {
		dbV12(stylishDb, error, ready);
	} else if (stylishDb.version == "1.2") {
		dbV13(stylishDb, error, ready);
	} else if (stylishDb.version == "1.3") {
		dbV14(stylishDb, error, ready);
	} else if (stylishDb.version == "1.4") {
		dbV15(stylishDb, error, ready);
	} else {
		ready(stylishDb);
	}
}

function dbV11(d, error, done) {
	d.changeVersion(d.version, '1.1', function (t) {
		t.executeSql('CREATE TABLE styles (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, url TEXT, updateUrl TEXT, md5Url TEXT, name TEXT NOT NULL, code TEXT NOT NULL, enabled INTEGER NOT NULL, originalCode TEXT NULL);');
		t.executeSql('CREATE TABLE style_meta (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, style_id INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL);');
		t.executeSql('CREATE INDEX style_meta_style_id ON style_meta (style_id);');
	}, error, function() {dbV12(d, error, done)});
}

function dbV12(d, error, done) {
	d.changeVersion(d.version, '1.2', function (t) {
		// add section table
		t.executeSql('CREATE TABLE sections (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, style_id INTEGER NOT NULL, code TEXT NOT NULL);');
		t.executeSql('INSERT INTO sections (style_id, code) SELECT id, code FROM styles;');
		// switch meta to sections
		t.executeSql('DROP INDEX style_meta_style_id;');
		t.executeSql('CREATE TABLE section_meta (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL);');
		t.executeSql('INSERT INTO section_meta (section_id, name, value) SELECT s.id, sm.name, sm.value FROM sections s INNER JOIN style_meta sm ON sm.style_id = s.style_id;');
		t.executeSql('CREATE INDEX section_meta_section_id ON section_meta (section_id);');
		t.executeSql('DROP TABLE style_meta;');
		// drop extra fields from styles table
		t.executeSql('CREATE TABLE newstyles (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, url TEXT, updateUrl TEXT, md5Url TEXT, name TEXT NOT NULL, enabled INTEGER NOT NULL);');
		t.executeSql('INSERT INTO newstyles (id, url, updateUrl, md5Url, name, enabled) SELECT id, url, updateUrl, md5Url, name, enabled FROM styles;');
		t.executeSql('DROP TABLE styles;');
		t.executeSql('ALTER TABLE newstyles RENAME TO styles;');
	}, error, function() {dbV13(d, error, done)});
}

function dbV13(d, error, done) {
	d.changeVersion(d.version, '1.3', function (t) {
		// clear out orphans
		t.executeSql('DELETE FROM section_meta WHERE section_id IN (SELECT sections.id FROM sections LEFT JOIN styles ON styles.id = sections.style_id WHERE styles.id IS NULL);');
		t.executeSql('DELETE FROM sections WHERE id IN (SELECT sections.id FROM sections LEFT JOIN styles ON styles.id = sections.style_id WHERE styles.id IS NULL);');
	}, error, function() { dbV14(d, error, done)});
}

function dbV14(d, error, done) {
	d.changeVersion(d.version, '1.4', function (t) {
		t.executeSql('UPDATE styles SET url = null WHERE url = "undefined";');
	}, error, function() { dbV15(d, error, done)});
}

function dbV15(d, error, done) {
	d.changeVersion(d.version, '1.5', function (t) {
		t.executeSql('ALTER TABLE styles ADD COLUMN originalMd5 TEXT NULL;');
	}, error, function() { done(d); });
}

function enableStyle(id, enabled) {
	getDatabase(function(db) {
		db.transaction(function (t) {
			t.executeSql("UPDATE styles SET enabled = ? WHERE id = ?;", [enabled, id]);
		}, reportError, function() {
			chrome.runtime.sendMessage({method: "styleChanged"});
			chrome.runtime.sendMessage({method: "getStyles", id: id}, function(styles) {
				handleUpdate(styles[0]);
				notifyAllTabs({method: "styleUpdated", style: styles[0]});
			});
		});
	});
}

function deleteStyle(id) {
	getDatabase(function(db) {
		db.transaction(function (t) {
			t.executeSql('DELETE FROM section_meta WHERE section_id IN (SELECT id FROM sections WHERE style_id = ?);', [id]);
			t.executeSql('DELETE FROM sections WHERE style_id = ?;', [id]);
			t.executeSql("DELETE FROM styles WHERE id = ?;", [id]);
		}, reportError, function() {
			chrome.runtime.sendMessage({method: "styleChanged"});
			handleDelete(id);
			notifyAllTabs({method: "styleDeleted", id: id});
		});
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

function isCheckbox(el) {
	return el.nodeName.toLowerCase() == "input" && "checkbox" == el.type.toLowerCase();
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
	chrome.extension.onMessage.addListener(function(request) {
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
	Object.freeze(copy);
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
