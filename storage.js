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
			chrome.extension.sendMessage({method: "styleChanged"});
			chrome.extension.sendMessage({method: "getStyles", id: id}, function(styles) {
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
			chrome.extension.sendMessage({method: "styleChanged"});
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

function changePref(event) {
	var el = event.target;
	prefs.setPref(el.id, isCheckbox(el) ? el.checked : el.value);
}

// Accepts a hash of pref name to default value
function loadPrefs(prefs) {
	for (var id in prefs) {
		var value = this.prefs.getPref(id, prefs[id]);
		var el = document.getElementById(id);
		if (isCheckbox(el)) {
			el.checked = value;
		} else {
			el.value = value;
		}
		el.dispatchEvent(new Event("change", {bubbles: true, cancelable: true}));
		el.addEventListener("change", changePref);
	}
}

var prefs = {
// NB: localStorage["not_key"] is undefined, localStorage.getItem("not_key") is null

	// defaults
	"openEditInWindow": false, // new editor opens in a own browser window
	"windowPosition": {},      // detached window position
	"show-badge": true,        // display text on popup menu icon
	"disableAll": false,       // boss key

	"popup.breadcrumbs": true, // display "New style" links as URL breadcrumbs
	"popup.breadcrumbs.usePath": false, // use URL path for "this URL"
	"popup.enabledFirst": true,  // display enabled styles before disabled styles
	"popup.stylesFirst": true,  // display enabled styles before disabled styles

	"manage.onlyEnabled": false, // display only enabled styles
	"manage.onlyEdited": false,  // display only styles created locally

	"editor.options": {},          // CodeMirror.defaults.*
	"editor.lineWrapping": true,   // word wrap
	"editor.smartIndent": true,    // "smart" indent
	"editor.indentWithTabs": false,// smart indent with tabs
	"editor.tabSize": 4,           // tab width, in spaces
	"editor.keyMap": navigator.appVersion.indexOf("Windows") > 0 ? "sublime" : "default",
	"editor.theme": "default",     // CSS theme
	"editor.beautify": {           // CSS beautifier
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

	NO_DEFAULT_PREFERENCE: "No default preference for '%s'",
	UNHANDLED_DATA_TYPE: "Default '%s' is of type '%s' - what should be done with it?",

	getPref: function(key, defaultValue) {
	// Returns localStorage[key], defaultValue, this[key], or undefined
	//   as type of defaultValue, this[key], or localStorage[key]
		var value = localStorage[key];
		if (value === undefined) {
			return defaultValue === undefined ? shallowCopy(this[key]) : defaultValue;
		}
		switch (typeof (defaultValue === undefined ? this[key] : defaultValue)) {
			case "boolean": return value.toLowerCase() === "true";
			case "number": return Number(value);
			case "object": return JSON.parse(value);
			case "string": break;
			case "undefined":  console.warn(this.NO_DEFAULT_PREFERENCE, key); break;
			default: console.error(UNHANDLED_DATA_TYPE, key, typeof defaultValue);
		}
		return value;
	},
	setPref: function(key, value) {
		var oldValue = localStorage[key];
		if (value === undefined || equal(value, this[key])) {
			delete localStorage[key];
		} else {
			localStorage[key] = typeof value == "string" ? value : JSON.stringify(value);
		}
		if (!equal(value, oldValue === undefined ? this[key] : oldValue)) {
			var message = {method: "prefChanged", prefName: key, value: value};
			notifyAllTabs(message);
			chrome.extension.sendMessage(message);
		}
	},
	removePref: function(key) { setPref(key, undefined) }
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

function shallowCopy(obj) {
	return typeof obj == "object" ? shallowMerge(obj, {}) : obj;
}

function shallowMerge(from, to) {
	if (typeof from == "object" && typeof to == "object") {
		for (var k in from) {
			to[k] = from[k];
		}
	}
	return to;
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
