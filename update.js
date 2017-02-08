/* globals getStyles, saveStyle */
'use strict';

var update = {
  fetch: (resource, callback) => {
    let req = new XMLHttpRequest();
    let [url, data] = resource.split('?');
    req.open('POST', url, true);
    req.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    req.onload = () => callback(req.responseText);
    req.onerror = req.ontimeout = () => callback();
    req.send(data);
  },
  md5Check: (style, callback) => {
    let req = new XMLHttpRequest();
    req.open('GET', style.md5Url, true);
    req.onload = () => {
      let md5 = req.responseText;
      if (md5 && md5 !== style.originalMd5) {
        callback(style);
      }
      else {
        console.log(`"${style.name}" style is up-to-date`);
      }
    };
    req.onerror = req.ontimeout = () => console.log('Error validating MD5 checksum');
    req.send();
  },
  list: (callback) => {
    getStyles({}, (styles) => callback(styles.filter(style => style.updateUrl)));
  },
  perform: () => {
    // from install.js
    function arraysAreEqual (a, b) {
      // treat empty array and undefined as equivalent
      if (typeof a === 'undefined') {
        return (typeof b === 'undefined') || (b.length === 0);
      }
      if (typeof b === 'undefined') {
        return (typeof a === 'undefined') || (a.length === 0);
      }
      if (a.length !== b.length) {
        return false;
      }
      return a.every(function (entry) {
        return b.indexOf(entry) !== -1;
      });
    }
    // from install.js
    function sectionsAreEqual(a, b) {
      if (a.code !== b.code) {
        return false;
      }
      return ['urls', 'urlPrefixes', 'domains', 'regexps'].every(function (attribute) {
        return arraysAreEqual(a[attribute], b[attribute]);
      });
    }

    update.list(styles => {
      styles.forEach(style => update.md5Check(style, style => update.fetch(style.updateUrl, response => {
        if (response) {
          let json = JSON.parse(response);

          if (json.sections.length === style.sections.length) {
            if (json.sections.every((section) => {
              return style.sections.some(installedSection => sectionsAreEqual(section, installedSection));
            })) {
              return console.log('everything is the same');
            }
            json.method = 'saveStyle';
            json.id = style.id;

            saveStyle(json, function () {
              console.log(`"${style.name}" style is updated`);
            });
          }
          else {
            console.log('style sections mismatch');
          }
        }
      })));
    });
  }
};
