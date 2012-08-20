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

function enableStyle(id, enabled) {
	getDatabase(function(db) {
		db.transaction(function (t) {
			t.executeSql("UPDATE styles SET enabled = ? WHERE id = ?;", [enabled, id]);
		}, reportError, function() {
			chrome.extension.sendMessage({method: "styleChanged"});
			chrome.extension.sendMessage({method: "getStyles", id: id}, function(styles) {
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
			chrome.extension.sendMessage({method: "styleChanged"});
			handleDelete(id);
			notifyAllTabs({name:"styleDeleted", id: id});
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
