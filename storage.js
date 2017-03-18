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


// Let manage/popup/edit reuse background page variables
// Note, only "var"-declared variables are visible from another extension page
var cachedStyles = ((bg) => bg && bg.cachedStyles || {
	bg,
	list: null,
	noCode: null,
	byId: new Map(),
	filters: new Map(),
	mutex: {
		inProgress: false,
		onDone: [],
	},
})(chrome.extension.getBackgroundPage());


// in case Chrome haven't yet loaded the bg page and displays our page like edit/manage
function getStylesSafe(options) {
	return new Promise(resolve => {
		if (cachedStyles.bg) {
			getStyles(options, resolve);
			return;
		}
		chrome.runtime.sendMessage(Object.assign({method: 'getStyles'}, options), styles => {
			if (!styles) {
				resolve(getStylesSafe(options));
			} else {
				cachedStyles = chrome.extension.getBackgroundPage().cachedStyles;
				resolve(styles);
			}
		});
	});
}


function getStyles(options, callback) {
	if (cachedStyles.list) {
		callback(filterStyles(options));
		return;
	}
	if (cachedStyles.mutex.inProgress) {
		cachedStyles.mutex.onDone.push({options, callback});
		return;
	}
	cachedStyles.mutex.inProgress = true;

	const t0 = performance.now()
	getDatabase(db => {
		const tx = db.transaction(['styles'], 'readonly');
		const os = tx.objectStore('styles');
		os.getAll().onsuccess = event => {
			cachedStyles.list = event.target.result || [];
			cachedStyles.noCode = [];
			cachedStyles.byId.clear();
			for (let style of cachedStyles.list) {
				const noCode = getStyleWithNoCode(style);
				cachedStyles.noCode.push(noCode);
				cachedStyles.byId.set(style.id, {style, noCode});
			}
			//console.log('%s getStyles %s, invoking cached callbacks: %o', (performance.now() - t0).toFixed(1), JSON.stringify(options), cachedStyles.mutex.onDone.map(e => JSON.stringify(e.options)))
			try{
				callback(filterStyles(options));
			} catch(e){
				// no error in console, it works
			}

			cachedStyles.mutex.inProgress = false;
			for (let {options, callback} of cachedStyles.mutex.onDone) {
				callback(filterStyles(options));
			}
			cachedStyles.mutex.onDone = [];
		};
	}, null);
}


function getStyleWithNoCode(style) {
	const stripped = Object.assign({}, style, {sections: []});
	for (let section of style.sections) {
		stripped.sections.push(Object.assign({}, section, {code: null}));
	}
	return stripped;
}


function invalidateCache(andNotify, {added, updated, deletedId} = {}) {
	// prevent double-add on echoed invalidation
	const cached = added && cachedStyles.byId.get(added.id);
	if (cached) {
		return;
	}
	if (andNotify) {
		chrome.runtime.sendMessage({method: 'invalidateCache', added, updated, deletedId});
	}
	if (!cachedStyles.list) {
		return;
	}
	if (updated) {
		const cached = cachedStyles.byId.get(updated.id);
		if (cached) {
			Object.assign(cached.style, updated);
			Object.assign(cached.noCode, getStyleWithNoCode(updated));
			//console.log('cache: updated', updated);
		}
		cachedStyles.filters.clear();
		return;
	}
	if (added) {
		const noCode = getStyleWithNoCode(added);
		cachedStyles.list.push(added);
		cachedStyles.noCode.push(noCode);
		cachedStyles.byId.set(added.id, {style: added, noCode});
		//console.log('cache: added', added);
		cachedStyles.filters.clear();
		return;
	}
	if (deletedId != undefined) {
		const deletedStyle = (cachedStyles.byId.get(deletedId) || {}).style;
		if (deletedStyle) {
			const cachedIndex = cachedStyles.list.indexOf(deletedStyle);
			cachedStyles.list.splice(cachedIndex, 1);
			cachedStyles.noCode.splice(cachedIndex, 1);
			cachedStyles.byId.delete(deletedId);
			//console.log('cache: deleted', deletedStyle);
			cachedStyles.filters.clear();
			return;
		}
	}
	cachedStyles.list = null;
	cachedStyles.noCode = null;
	//console.log('cache cleared');
	cachedStyles.filters.clear();
}


function filterStyles(options = {}) {
	const t0 = performance.now()
	const enabled = fixBoolean(options.enabled);
	const url = 'url' in options ? options.url : null;
	const id = 'id' in options ? Number(options.id) : null;
	const matchUrl = 'matchUrl' in options ? options.matchUrl : null;
	const code = 'code' in options ? options.code : true;
	const asHash = 'asHash' in options ? options.asHash : false;

	if (enabled == null
		&& url == null
		&& id == null
		&& matchUrl == null
		&& asHash != true) {
		//console.log('%c%s filterStyles SKIPPED LOOP %s', 'color:gray', (performance.now() - t0).toFixed(1), JSON.stringify(options))
		return code ? cachedStyles.list : cachedStyles.noCode;
	}

	// add \t after url to prevent collisions (not sure it can actually happen though)
	const cacheKey = '' + enabled + url + '\t' + id + matchUrl + '\t' + code + asHash;
	const cached = cachedStyles.filters.get(cacheKey);
	if (cached) {
		//console.log('%c%s filterStyles REUSED RESPONSE %s', 'color:gray', (performance.now() - t0).toFixed(1), JSON.stringify(options))
		cached.hits++;
		cached.lastHit = Date.now();
		return asHash
			? Object.assign({disableAll: prefs.get('disableAll', false)}, cached.styles)
			: cached.styles;
	}

	const styles = id == null
		? (code ? cachedStyles.list : cachedStyles.noCode)
		: [(cachedStyles.byId.get(id) || {})[code ? 'style' : 'noCode']];
	const filtered = asHash ? {} : [];
	if (!styles) {
		// may happen when users [accidentally] reopen an old URL
		// of edit.html with a non-existent style id parameter
		return filtered;
	}
	for (let i = 0, style; (style = styles[i]); i++) {
		if ((enabled == null || style.enabled == enabled)
			&& (url == null || style.url == url)
			&& (id == null || style.id == id)) {
			const sections = (asHash || matchUrl != null) && getApplicableSections(style, matchUrl);
			if (asHash) {
				if (sections.length) {
					filtered[style.id] = sections;
				}
			} else if (matchUrl == null || sections.length) {
				filtered.push(style);
			}
		}
	}
	//console.log('%s filterStyles %s', (performance.now() - t0).toFixed(1), JSON.stringify(options))
	cachedStyles.filters.set(cacheKey, {
		styles: filtered,
		lastHit: Date.now(),
		hits: 1,
	});
	if (cachedStyles.filters.size > 10000) {
		cleanupCachedFilters();
	}
	return asHash
		? Object.assign({disableAll: prefs.get('disableAll', false)}, filtered)
		: filtered;
}


function cleanupCachedFilters({force = false} = {}) {
	if (!force) {
		// sliding timer for 1 second
		clearTimeout(cleanupCachedFilters.timeout);
		cleanupCachedFilters.timeout = setTimeout(cleanupCachedFilters, 1000, {force: true});
		return;
	}
	const size = cachedStyles.filters.size;
	const oldestHit = cachedStyles.filters.values().next().value.lastHit;
	const now = Date.now();
	const timeSpan = now - oldestHit;
	const recencyWeight = 5 / size;
	const hitWeight = 1 / 4; // we make ~4 hits per URL
	const lastHitWeight = 10;
	// delete the oldest 10%
	const sorted = [...cachedStyles.filters.entries()]
		.map(([id, v], index) => ({
			id,
			weight:
				index * recencyWeight +
				v.hits * hitWeight +
				(v.lastHit - oldestHit) / timeSpan * lastHitWeight,
		}))
		.sort((a, b) => a.weight - b.weight)
		.slice(0, size / 10 + 1)
		.forEach(({id}) => cachedStyles.filters.delete(id));
	cleanupCachedFilters.timeout = 0;
}


function saveStyle(style, {notify = true} = {}) {
	return new Promise(resolve => {
		getDatabase(db => {
			const tx = db.transaction(['styles'], 'readwrite');
			const os = tx.objectStore('styles');

			const reason = style.reason;
			delete style.method;
			delete style.reason;

			// Update
			if (style.id) {
				style.id = Number(style.id);
				os.get(style.id).onsuccess = eventGet => {
					const oldStyle = Object.assign({}, eventGet.target.result);
					const codeIsUpdated = 'sections' in style && !styleSectionsEqual(style, oldStyle);
					style = Object.assign(oldStyle, style);
					addMissingStyleTargets(style);
					os.put(style).onsuccess = eventPut => {
						style.id = style.id || eventPut.target.result;
						invalidateCache(notify, {updated: style});
						if (notify) {
							notifyAllTabs({method: 'styleUpdated', style, codeIsUpdated, reason});
						}
						resolve(style);
					};
				};
				return;
			}

			// Create
			delete style.id;
			style = Object.assign({
				// Set optional things if they're undefined
				enabled: true,
				updateUrl: null,
				md5Url: null,
				url: null,
				originalMd5: null,
			}, style);
			addMissingStyleTargets(style);
			os.add(style).onsuccess = event => {
				// Give it the ID that was generated
				style.id = event.target.result;
				invalidateCache(true, {added: style});
				notifyAllTabs({method: 'styleAdded', style, reason});
				resolve(style);
			};
		});
	});
}


function addMissingStyleTargets(style) {
	style.sections = (style.sections || []).map(section =>
		Object.assign({
			urls: [],
			urlPrefixes: [],
			domains: [],
			regexps: [],
		}, section)
	);
}


function enableStyle(id, enabled) {
	return saveStyle({id, enabled});
}


function deleteStyle(id) {
  return new Promise(resolve =>
    getDatabase(db => {
      const tx = db.transaction(['styles'], 'readwrite');
      const os = tx.objectStore('styles');
      os.delete(Number(id)).onsuccess = event => {
        invalidateCache(true, {deletedId: id});
        notifyAllTabs({method: 'styleDeleted', id});
        resolve(id);
      };
    }));
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

const namespacePattern = /^\s*(@namespace[^;]+;\s*)+$/;

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

		"badgeDisabled": "#8B0000",     // badge background color when disabled
		"badgeNormal": "#006666",       // badge background color

		"popupWidth": 240,              // popup width in pixels

		"updateInterval": 0             // user-style automatic update interval, hour
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
		if (typeof contextMenus !== 'undefined') {
			for (let id in contextMenus) {
				if (typeof values[id] == 'boolean') {
					me.broadcast(id, values[id], {noSync: true});
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

// Polyfill for Firefox < 53 https://bugzilla.mozilla.org/show_bug.cgi?id=1220494
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


function styleSectionsEqual(styleA, styleB) {
	if (!styleA.sections || !styleB.sections) {
		return undefined;
	}
	if (styleA.sections.length != styleB.sections.length) {
		return false;
	}
	const properties = ['code', 'urlPrefixes', 'urls', 'domains', 'regexps'];
	return styleA.sections.every(sectionA =>
		styleB.sections.some(sectionB =>
			properties.every(property => sectionEquals(sectionA, sectionB, property))
		)
	);

	function sectionEquals(a, b, property) {
		const aProp = a[property], typeA = getType(aProp);
		const bProp = b[property], typeB = getType(bProp);
		if (typeA != typeB) {
			// consider empty arrays equivalent to lack of property
			return ((typeA == 'undefined' || (typeA == 'array' && aProp.length == 0)) &&
				(typeB == 'undefined' || (typeB == 'array' && bProp.length == 0)));
		}
		if (typeA == 'undefined') {
			return true;
		}
		if (typeA == 'array') {
			return aProp.length == bProp.length && aProp.every(item => bProp.includes(item));
		}
		if (typeA == 'string') {
			return aProp == bProp;
		}
	}
}
