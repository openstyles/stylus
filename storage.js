var namespacePattern = /^\s*@namespace\s+([a-zA-Z]+\s+)?url\(\"?http:\/\/www.w3.org\/1999\/xhtml\"?\);?\s*$/;

var stylishDb = null;
function getDatabase(ready, error) {
	if (stylishDb != null) {
		ready(stylishDb);
		return;
	}
	stylishDb = openDatabase('stylish', '', 'Stylish Styles', 5*1024*1024);
	if (stylishDb.version == "1.0" || stylishDb.version == "") {
		dbV11(stylishDb, error, ready);
	} else if (stylishDb.version == "1.1") {
		dbV12(stylishDb, error, ready);
	} else if (stylishDb.version == "1.2") {
		dbV13(stylishDb, error, ready);
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
	}, error, function() { done(d)});
}

function getStyles(options, callback) {
	getDatabase(function(db) {
		db.readTransaction(function (t) {
			if ("matchUrl" in options) {
				// get a list of style ids that apply to the url. we need to do this separately because we need all the metas for the styles, not just the matching ones
				// find site-specific ones
				var sql = "SELECT DISTINCT s.style_id FROM sections s INNER JOIN section_meta sm ON sm.section_id = s.id WHERE (sm.name = 'url' and sm.value = ?) OR (sm.name = 'url-prefix' AND ? LIKE (sm.value || '%')) OR (sm.name = 'regexp' AND ? REGEXP sm.value)";
				var matchParams = [];
				var domains = getDomains(options.matchUrl);
				matchParams = matchParams.concat([options.matchUrl, options.matchUrl, options.matchUrl]).concat(domains);
				var domainClause = "";
				if (domains.length == 1) {
					sql += " OR (sm.name = 'domain' AND sm.value = ?)";
				} else if (domains.length > 1) {
					sql += " OR (sm.name = 'domain' AND sm.value IN (";
					sql += domains.map(function(d) { return "?";}).join(",");
					sql += '))';
				}
				t.executeSql(sql, matchParams, function (t, r) {
					var style_ids = [];
					if (options.id) {
						style_ids.push(options.id);
					}
					for (var i = 0; i < r.rows.length; i++) {
						var values = r.rows.item(i);
						style_ids.push(values.style_id);
					}
					// now add in global ones
					getGlobalStyleIds(function(ids) {
						style_ids = uniqueArray(style_ids.concat(ids));
						loadStyles(style_ids, options.enabled, options.url, callback);
					});
				});
			} else {
				loadStyles(options.id ? [options.id] : null, options.enabled, options.url, callback);
			}
		}, reportError);
	}, reportError);
}

function uniqueArray(ar) {
	return ar.filter(function(s, i, a){
		return i === a.lastIndexOf(s);
	});
}

function getCache(callback) {
	if (isBackground()) {
		callback(cachedStyles);
		return;
	}
	chrome.extension.sendRequest({name: "getCachedStyles"}, callback);
}

function fixBoolean(b) {
	if (typeof b != "undefined") {
		return b != "false";
	}
	return null;
}

function loadStyles(styleIds, enabled, url, callback) {
	// clean up the parameters
	enabled = fixBoolean(enabled);
	if (typeof url == "undefined") {
		url = null;
	}
	// grab what we can from the cache
	if (styleIds) {
		getCache(function(cache) {
			var styles = [];
			var styleIdsNeeded = [];
			styleIds.forEach(function(id) {
				if (cache[id]) {
					if (checkStyle(cache[id], enabled, url)) {
						styles.push(cache[id]);
					}
				} else {
					styleIdsNeeded.push(id);
				}
			});
			styleIds = styleIdsNeeded;
			// do we have everything we need?
			if (styleIds.length == 0) {
				callback(styles);
				return;
			}
			loadStylesFromDB(styles, styleIds, enabled, url, callback);
		});
		return;
	}
	loadStylesFromDB([], styleIds, enabled, url, callback);
}

function checkStyle(style, enabled, url) {
	return (enabled == null || enabled == fixBoolean(style.enabled)) && (url == null || url == style.url);
}

function loadStylesFromDB(styles, styleIds, enabled, url, callback) {
	// load from the db for the rest
	getDatabase(function(db) {
		db.readTransaction(function (t) {
			var where = "";
			var params = [];
			if (styleIds) {
				if (styleIds.size == 0) {
					callback([]);
					return;
				}

				where += " AND s.id IN ("
				var firstStyleId = true;
				styleIds.forEach(function(styleId) {
					where += firstStyleId ? "?" : ",?";
					firstStyleId = false;
					params.push(styleId);
				});
				where += ")";
			}
			/*if (enabled != null) {
				where += ' AND enabled = ?';
				params.push(enabled);
			}
			if (url != null) {
				where += ' AND s.url = ?';
				params.push(url);
			}*/
			t.executeSql('SELECT DISTINCT s.*, se.id section_id, se.code, sm.name metaName, sm.value metaValue FROM styles s LEFT JOIN sections se ON se.style_id = s.id LEFT JOIN section_meta sm ON sm.section_id = se.id WHERE 1' + where + ' ORDER BY s.id, se.id, sm.id', params, function (t, r) {
				var currentStyle = null;
				var currentSection = null;
				for (var i = 0; i < r.rows.length; i++) {
					var values = r.rows.item(i);
					var metaName = null;
					switch (values.metaName) {
						case null:
							break;
						case "url":
							metaName = "urls";
							break;
						case "url-prefix":
							metaName = "urlPrefixes";
							break;
						case "domain":
							var metaName = "domains";
							break;
						case "regexps":
							var metaName = "regexps";
							break;
						default:
							var metaName = values.metaName + "s";
					}
					var metaValue = values.metaValue;
					if (currentStyle == null || currentStyle.id != values.id) {
						currentStyle = {id: values.id, url: values.url, updateUrl: values.updateUrl, md5Url: values.md5Url, name: values.name, enabled: values.enabled, sections: []};
						styles.push(currentStyle);
					}
					if (currentSection == null || currentSection.id != values.section_id) {
						currentSection = {id: values.section_id, code: values.code};
						currentStyle.sections.push(currentSection);
					}
					if (metaName && metaValue) {
						if (currentSection[metaName]) {
							currentSection[metaName].push(metaValue);
						} else {
							currentSection[metaName] = [metaValue];
						}
					}
				}
				if (isBackground()) {
					styles.forEach(function(style) {
						cachedStyles[style.id] = style;

					});
				} else {
					chrome.extension.sendRequest({name: "cacheStyles", styles: styles});
				}
				callback(styles.filter(function(style) {
					return checkStyle(style, enabled, url);
				}));
			}, reportError);
		}, reportError);
	}, reportError);
}

function getGlobalStyleIds(callback) {
	if (isBackground() && cachedGlobalStyleIds != null) {
		callback(cachedGlobalStyleIds);
		return;
	}
	getDatabase(function(db) {
		db.readTransaction(function (t) {
			t.executeSql("SELECT DISTINCT s.style_id, s.code FROM sections s LEFT JOIN section_meta sm ON sm.section_id = s.id INNER JOIN styles st ON st.id = s.style_id GROUP BY s.id HAVING COUNT(sm.id) = 0", [], function (t, r) {
				var style_ids = [];
				for (var i = 0; i < r.rows.length; i++) {
					var values = r.rows.item(i);
					// ignore namespace only sections
					if (!namespacePattern.test(values.code) && style_ids.indexOf(values.style_id) == -1) {
						style_ids.push(values.style_id);
					}
				}
				if (isBackground()) {
					cachedGlobalStyleIds = style_ids;
				}
				callback(style_ids);
			}, reportError);
		}, reportError);
	}, reportError);
}


function saveFromJSON(o, callback) {
	getDatabase(function(db) {
		db.transaction(function (t) {
			if (o.id) {
				t.executeSql('DELETE FROM section_meta WHERE section_id IN (SELECT id FROM sections WHERE style_id = ?);', [o.id]);
				t.executeSql('DELETE FROM sections WHERE style_id = ?;', [o.id]);
			} else {
				t.executeSql('INSERT INTO styles (name, enabled, url, updateUrl) VALUES (?, ?, ?, ?);', [o.name, true, o.url, o.updateUrl]);
			}
			o.sections.forEach(function(section) {
				if (o.id) {
					t.executeSql('INSERT INTO sections (style_id, code) VALUES (?, ?);', [o.id, section.code]);
				} else {
					t.executeSql('INSERT INTO sections (style_id, code) SELECT id, ? FROM styles ORDER BY id DESC LIMIT 1;', [section.code]);
				}
				section.urls.forEach(function(u) {
					t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, 'url', ? FROM sections ORDER BY id DESC LIMIT 1;", [u]);
				});
				section.urlPrefixes.forEach(function(u) {
					t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, 'url-prefix', ? FROM sections ORDER BY id DESC LIMIT 1;", [u]);
				});
				section.domains.forEach(function(u) {
					t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, 'domain', ? FROM sections ORDER BY id DESC LIMIT 1;", [u]);
				});
				section.regexps.forEach(function(u) {
					t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, 'regexp', ? FROM sections ORDER BY id DESC LIMIT 1;", [u]);
				});
			});
		}, reportError, function() {saveFromJSONComplete(o.id, callback)});
	}, reportError);
}

function saveFromJSONComplete(id, callback) {
	chrome.extension.sendRequest({name: "styleChanged"});
	if (id) {
		notifyAllTabs({name:"styleUpdated", style: id});
		if (callback) {
			callback(id);
		}
		return;
	}
	// Load the style id
	getDatabase(function(db) {
		db.readTransaction(function (t) {
			t.executeSql('SELECT id FROM styles ORDER BY id DESC LIMIT 1', [], function(t, r) {
				var styleId = r.rows.item(0).id;
				getStyles({id: styleId}, function(styles) {
					notifyAllTabs({name:"styleAdded", style: styles[0]});
				});
				if (callback) {
					callback(styleId);
				}
			}, reportError)
		}, reportError)
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

function isBackground() {
	return typeof background != "undefined" && background;
}

function getDomains(url) {
	var d = /.*?:\/*([^\/]+)/.exec(url)[1];
	var domains = [d];
	while (d.indexOf(".") != -1) {
		d = d.substring(d.indexOf(".") + 1);
		domains.push(d);
	}
	return domains;
}

function enableStyle(id, enabled) {
	getDatabase(function(db) {
		db.transaction(function (t) {
			t.executeSql("UPDATE styles SET enabled = ? WHERE id = ?;", [enabled, id]);
		}, reportError, function() {
			chrome.extension.sendRequest({name: "styleChanged"});
			getStyles({id: id}, function(styles) {
				handleUpdate(styles[0]);
				notifyAllTabs({name:"styleUpdated", style: styles[0]});
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
			chrome.extension.sendRequest({name: "styleChanged"});
			handleDelete(id);
			notifyAllTabs({name:"styleDeleted", id: id});
		});
	});
}
