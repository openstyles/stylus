chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.method) {
		case "getStyles":
			getStyles(request, function(r) {
				sendResponse(r);
				if (request.updateBadge) {
					var t = getBadgeText(r);
					console.log("Tab " + sender.tab.id + " (" + sender.tab.url + ") badge text set to '" + t + "'.");
					chrome.browserAction.setBadgeText({text: t, tabId: sender.tab.id});
				} else {
					console.log("Tab " + sender.tab.id + " (" + sender.tab.url + ") doesn't get badge text.");
				}
			});
			return true;
		case "getStyleApplies":
			sendResponse(getApplicableSections(request.style, request.url));
			return true;
		case "saveStyle":
			saveStyle(request, sendResponse);
			return true;
		case "styleChanged":
			cachedStyles = null;
			break;
	}
});

function getStyles(options, callback) {

	var enabled = fixBoolean(options.enabled);
	var url = "url" in options ? options.url : null;
	var id = "id" in options ? options.id : null;
	var matchUrl = "matchUrl" in options ? options.matchUrl : null;

	var callCallback = function() {
		callback(cachedStyles.filter(function(style) {
			if (enabled != null && fixBoolean(style.enabled) != enabled) {
				return false;
			}
			if (url != null && style.url != url) {
				return false;
			}
			if (id != null && style.id != id) {
				return false;
			}
			if (matchUrl != null && getApplicableSections(style, matchUrl) == 0) {
				return false;
			}
			return true;
		}));
	}

	if (cachedStyles) {
		callCallback();
		return;
	}

	getDatabase(function(db) {
		db.readTransaction(function (t) {
			var where = "";
			var params = [];

			t.executeSql('SELECT DISTINCT s.*, se.id section_id, se.code, sm.name metaName, sm.value metaValue FROM styles s LEFT JOIN sections se ON se.style_id = s.id LEFT JOIN section_meta sm ON sm.section_id = se.id WHERE 1' + where + ' ORDER BY s.id, se.id, sm.id', params, function (t, r) {
				cachedStyles = [];
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
						cachedStyles.push(currentStyle);
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
				callCallback();
			}, reportError);
		}, reportError);
	}, reportError);
}

function fixBoolean(b) {
	if (typeof b != "undefined") {
		return b != "false";
	}
	return null;
}

const namespacePattern = /^\s*@namespace\s+([a-zA-Z]+\s+)?url\(\"?http:\/\/www.w3.org\/1999\/xhtml\"?\);?\s*$/;
function getApplicableSections(style, url) {
	var sections = style.sections.filter(function(section) {
		return sectionAppliesToUrl(section, url);
	});
	// ignore if it's just a namespace
	if (sections.length == 1 && namespacePattern.test(sections[0].code)) {
		return [];
	}
	return sections;
}

function sectionAppliesToUrl(section, url) {
	// only http and https allowed
	if (url.indexOf("http") != 0) {
		return false;
	}
	if (!section.urls && !section.domains && !section.urlPrefixes && !section.regexps) {
		console.log(section.id + " is global");
		return true;
	}
	if (section.urls && section.urls.indexOf(url) != -1) {
		console.log(section.id + " applies to " + url + " due to URL rules");
		return true;
	}
	if (section.urlPrefixes && section.urlPrefixes.some(function(prefix) {
		return url.indexOf(prefix) == 0;
	})) {
		console.log(section.id + " applies to " + url + " due to URL prefix rules");
		return true;
	}
	if (section.domains && getDomains(url).some(function(domain) {
		return section.domains.indexOf(domain) != -1;
	})) {
		console.log(section.id + " applies due to " + url + " due to domain rules");
		return true;
	}
	if (section.regexps && section.regexps.some(function(regexp) {
		// we want to match the full url, so add ^ and $ if not already present
		if (regexp[0] != "^") {
			regexp = "^" + regexp;
		}
		if (regexp[regexp.length - 1] != "$") {
			regexp += "$";
		}
		try {
			var re = new RegExp(regexp);
		} catch (ex) {
			console.log(section.id + "'s regexp '" + regexp + "' is not valid");
			return false;
		}
		return (re).test(url);
	})) {
		console.log(section.id + " applies to " + url + " due to regexp rules");
		return true;
	}
	console.log(section.id + " does not apply due to " + url);
	return false;
}

var cachedStyles = null;

function saveStyle(o, callback) {
	getDatabase(function(db) {
		db.transaction(function(t) {
			if (o.id) {
				// update whatever's been passed
				if ("name" in o) {
					t.executeSql('UPDATE styles SET name = ? WHERE id = ?;', [o.name, o.id]);
				}
				if ("enabled" in o) {
					t.executeSql('UPDATE styles SET enabled = ? WHERE id = ?;', [o.enabled, o.id]);
				}
				if ("url" in o) {
					t.executeSql('UPDATE styles SET url = ? WHERE id = ?;', [o.url, o.id]);
				}
				if ("updateUrl" in o) {
					t.executeSql('UPDATE styles SET updateUrl = ? WHERE id = ?;', [o.updateUrl, o.id]);
				}
				if ("md5Url" in o) {
					t.executeSql('UPDATE styles SET md5Url = ? WHERE id = ?;', [o.md5Url, o.id]);
				}
			} else {
				// create a new record
				if (!("updateUrl" in o)) {
					o.updateUrl = null;
				}
				if (!("md5Url" in o)) {
					o.md5Url = null;
				}
				t.executeSql('INSERT INTO styles (name, enabled, url, updateUrl, md5Url) VALUES (?, ?, ?, ?, ?);', [o.name, true, o.url, o.updateUrl, o.md5Url]);
			}

			if ("sections" in o) {
				if (o.id) {
					// clear existing records
					t.executeSql('DELETE FROM section_meta WHERE section_id IN (SELECT id FROM sections WHERE style_id = ?);', [o.id]);
					t.executeSql('DELETE FROM sections WHERE style_id = ?;', [o.id]);
				}

				o.sections.forEach(function(section) {
					if (o.id) {
						t.executeSql('INSERT INTO sections (style_id, code) VALUES (?, ?);', [o.id, section.code]);
					} else {
						t.executeSql('INSERT INTO sections (style_id, code) SELECT id, ? FROM styles ORDER BY id DESC LIMIT 1;', [section.code]);
					}
					if (section.urls) {
						section.urls.forEach(function(u) {
							t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, 'url', ? FROM sections ORDER BY id DESC LIMIT 1;", [u]);
						});
					}
					if (section.urlPrefixes) {
						section.urlPrefixes.forEach(function(u) {
							t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, 'url-prefix', ? FROM sections ORDER BY id DESC LIMIT 1;", [u]);
						});
					}
					if (section.domains) {
						section.domains.forEach(function(u) {
							t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, 'domain', ? FROM sections ORDER BY id DESC LIMIT 1;", [u]);
						});
					}
					if (section.regexps) {
						section.regexps.forEach(function(u) {
							t.executeSql("INSERT INTO section_meta (section_id, name, value) SELECT id, 'regexp', ? FROM sections ORDER BY id DESC LIMIT 1;", [u]);
						});
					}
				});
			}
		}, reportError, function() {saveFromJSONComplete(o.id, callback)});
	}, reportError);
}

function saveFromJSONComplete(id, callback) {
	cachedStyles = null;

	if (id) {
		getStyles({method: "getStyles", id: id}, function(styles) {
			saveFromJSONStyleReloaded("styleUpdated", styles[0], callback);
		});
		return;
	}

	// we need to load the id for new ones
	getDatabase(function(db) {
		db.readTransaction(function (t) {
			t.executeSql('SELECT id FROM styles ORDER BY id DESC LIMIT 1', [], function(t, r) {
				var id = r.rows.item(0).id;
				getStyles({method: "getStyles", id: id}, function(styles) {
					saveFromJSONStyleReloaded("styleAdded", styles[0], callback);
				});
			}, reportError)
		}, reportError)
	});

}

function saveFromJSONStyleReloaded(updateType, style, callback) {
	notifyAllTabs({name:updateType, style: style});
	if (callback) {
		callback(style);
	}
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

