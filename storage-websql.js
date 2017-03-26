/* global getDatabase, reportError */
'use strict';

const webSqlStorage = {

  migrate() {
    if (typeof openDatabase == 'undefined') {
      // No WebSQL - no migration!
      return;
    }
    webSqlStorage.getStyles(styles => {
      getDatabase(db => {
        const tx = db.transaction(['styles'], 'readwrite');
        const os = tx.objectStore('styles');
        styles.forEach(s => {
          webSqlStorage.cleanStyle(s);
          os.add(s);
        });
        // While this was running, the styles were loaded from the (empty) indexed db
        setTimeout(() => invalidateCache(true), 500);
      });
    }, null);
  },

  cleanStyle(s) {
    delete s.id;
    s.sections.forEach(section => {
      delete section.id;
      ['urls', 'urlPrefixes', 'domains', 'regexps'].forEach(property => {
        if (!section[property]) {
          section[property] = [];
        }
      });
    });
  },

  getStyles(callback) {
    webSqlStorage.getDatabase(db => {
      if (!db) {
        callback([]);
        return;
      }
      db.readTransaction(t => {
        const where = '';
        const params = [];

        t.executeSql(
          'SELECT DISTINCT ' +
          's.*, se.id section_id, se.code, sm.name metaName, sm.value metaValue ' +
          'FROM styles s ' +
          'LEFT JOIN sections se ON se.style_id = s.id ' +
          'LEFT JOIN section_meta sm ON sm.section_id = se.id ' +
          'WHERE 1' + where + ' ' +
          'ORDER BY s.id, se.id, sm.id',
          params,
          (t, r) => {
            const styles = [];
            let currentStyle = null;
            let currentSection = null;
            for (let i = 0; i < r.rows.length; i++) {
              const values = r.rows.item(i);
              let metaName = null;
              switch (values.metaName) {
                case null:
                  break;
                case 'url':
                  metaName = 'urls';
                  break;
                case 'url-prefix':
                  metaName = 'urlPrefixes';
                  break;
                case 'domain':
                  metaName = 'domains';
                  break;
                case 'regexps':
                  metaName = 'regexps';
                  break;
                default:
                  metaName = values.metaName + 's';
              }
              const metaValue = values.metaValue;
              if (currentStyle === null || currentStyle.id != values.id) {
                currentStyle = {
                  id: values.id,
                  url: values.url,
                  updateUrl: values.updateUrl,
                  md5Url: values.md5Url,
                  name: values.name,
                  enabled: values.enabled == 'true',
                  originalMd5: values.originalMd5,
                  sections: []
                };
                styles.push(currentStyle);
              }
              if (values.section_id !== null) {
                if (currentSection === null || currentSection.id != values.section_id) {
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
            }
            callback(styles);
          }, reportError);
      }, reportError);
    }, reportError);
  },

  getDatabase(ready, error) {
    let stylishDb;
    try {
      stylishDb = openDatabase('stylish', '', 'Stylish Styles', 5 * 1024 * 1024);
    } catch (ex) {
      error();
      throw ex;
    }
    if (stylishDb.version == '') {
      // It didn't already exist, we have nothing to migrate.
      ready(null);
      return;
    }
    switch (stylishDb.version) {
      case '1.0': return webSqlStorage.dbV11(stylishDb, error, ready);
      case '1.1': return webSqlStorage.dbV12(stylishDb, error, ready);
      case '1.2': return webSqlStorage.dbV13(stylishDb, error, ready);
      case '1.3': return webSqlStorage.dbV14(stylishDb, error, ready);
      case '1.4': return webSqlStorage.dbV15(stylishDb, error, ready);
      default:    ready(stylishDb);
    }
  },

  dbV11(d, error, done) {
    d.changeVersion(d.version, '1.1', t => {
      t.executeSql(
        'CREATE TABLE styles (' +
        'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, ' +
        'url TEXT, ' +
        'updateUrl TEXT, ' +
        'md5Url TEXT, ' +
        'name TEXT NOT NULL, ' +
        'code TEXT NOT NULL, ' +
        'enabled INTEGER NOT NULL, ' +
        'originalCode TEXT NULL);');
      t.executeSql(
        'CREATE TABLE style_meta (' +
        'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, ' +
        'style_id INTEGER NOT NULL, ' +
        'name TEXT NOT NULL, ' +
        'value TEXT NOT NULL);');
      t.executeSql('CREATE INDEX style_meta_style_id ON style_meta (style_id);');
    }, error, () => webSqlStorage.dbV12(d, error, done));
  },

  dbV12(d, error, done) {
    d.changeVersion(d.version, '1.2', t => {
      // add section table
      t.executeSql(
        'CREATE TABLE sections (' +
        'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, ' +
        'style_id INTEGER NOT NULL, ' +
        'code TEXT NOT NULL);');
      t.executeSql(
        'INSERT INTO sections (style_id, code) SELECT id, code FROM styles;');
      // switch meta to sections
      t.executeSql(
        'DROP INDEX style_meta_style_id;');
      t.executeSql(
        'CREATE TABLE section_meta (' +
        'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, ' +
        'section_id INTEGER NOT NULL, ' +
        'name TEXT NOT NULL, ' +
        'value TEXT NOT NULL);');
      t.executeSql(
        'INSERT INTO section_meta (section_id, name, value) ' +
        'SELECT s.id, sm.name, sm.value FROM sections s ' +
        'INNER JOIN style_meta sm ON sm.style_id = s.style_id;');
      t.executeSql(
        'CREATE INDEX section_meta_section_id ON section_meta (section_id);');
      t.executeSql(
        'DROP TABLE style_meta;');
      // drop extra fields from styles table
      t.executeSql(
        'CREATE TABLE newstyles (' +
        'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, ' +
        'url TEXT, ' +
        'updateUrl TEXT, ' +
        'md5Url TEXT, ' +
        'name TEXT NOT NULL, ' +
        'enabled INTEGER NOT NULL);');
      t.executeSql(
        'INSERT INTO newstyles (id, url, updateUrl, md5Url, name, enabled) ' +
        'SELECT id, url, updateUrl, md5Url, name, enabled FROM styles;');
      t.executeSql(
        'DROP TABLE styles;');
      t.executeSql(
        'ALTER TABLE newstyles ' +
        'RENAME TO styles;');
    }, error, () => webSqlStorage.dbV13(d, error, done));
  },

  dbV13(d, error, done) {
    d.changeVersion(d.version, '1.3', t => {
      // clear out orphans
      t.executeSql(
        'DELETE FROM section_meta ' +
        'WHERE section_id IN (' +
          'SELECT sections.id FROM sections ' +
          'LEFT JOIN styles ON styles.id = sections.style_id ' +
          'WHERE styles.id IS NULL' +
        ');');
      t.executeSql(
        'DELETE FROM sections ' +
        'WHERE id IN (' +
          'SELECT sections.id FROM sections ' +
          'LEFT JOIN styles ON styles.id = sections.style_id ' +
          'WHERE styles.id IS NULL);');
    }, error, () => webSqlStorage.dbV14(d, error, done));
  },

  dbV14(d, error, done) {
    d.changeVersion(d.version, '1.4', t => {
      t.executeSql(
        'UPDATE styles SET url = null ' +
        'WHERE url = "undefined";');
    }, error, () => webSqlStorage.dbV15(d, error, done));
  },

  dbV15(d, error, done) {
    d.changeVersion(d.version, '1.5', t => {
      t.executeSql(
        'ALTER TABLE styles ' +
        'ADD COLUMN originalMd5 TEXT NULL;');
    }, error, () => done(d));
  }
};
