/* globals getStyles */
'use strict';

// TODO: refactor to make usable in manage::Updater
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
  md5Check: (style, callback, skipped) => {
    let req = new XMLHttpRequest();
    req.open('GET', style.md5Url, true);
    req.onload = () => {
      let md5 = req.responseText;
      if (md5 && md5 !== style.originalMd5) {
        callback(style);
      }
      else {
        skipped(`"${style.name}" style is up-to-date`);
      }
    };
    req.onerror = req.ontimeout = () => skipped('Error validating MD5 checksum');
    req.send();
  },
  list: (callback) => {
    getStyles({}, (styles) => callback(styles.filter(style => style.updateUrl)));
  },
  perform: (observe = function () {}) => {
    // TODO: use sectionsAreEqual
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
      observe('count', styles.length);
      styles.forEach(style => update.md5Check(style, style => update.fetch(style.updateUrl, response => {
        if (response) {
          let json = JSON.parse(response);

          if (json.sections.length === style.sections.length) {
            if (json.sections.every((section) => {
              return style.sections.some(installedSection => sectionsAreEqual(section, installedSection));
            })) {
              return observe('single-skipped', '2'); // everything is the same
            }
            json.method = 'saveStyle';
            json.id = style.id;

            saveStyle(json).then(style => {
              observe('single-updated', style.name);
            });
          }
          else {
            return observe('single-skipped', '3'); // style sections mismatch
          }
        }
      }), () => observe('single-skipped', '1')));
    });
  }
};
// automatically update all user-styles if "updateInterval" pref is set
window.setTimeout(function () {
  let id;
  function run () {
    update.perform(/*(cmd, value) => console.log(cmd, value)*/);
    reset();
  }
  function reset () {
    window.clearTimeout(id);
    let interval = prefs.get('updateInterval');
    // if interval === 0 => automatic update is disabled
    if (interval) {
      /* console.log('next update', interval); */
      id = window.setTimeout(run, interval * 60 * 60 * 1000);
    }
  }
  if (prefs.get('updateInterval')) {
    run();
  }
  chrome.runtime.onMessage.addListener(request => {
    // when user has changed the predefined time interval in the settings page
    if (request.method === 'prefChanged' && request.prefName === 'updateInterval') {
      reset();
    }
    // when user just manually checked for updates
    if (request.method === 'resetInterval') {
      reset();
    }
  });
}, 10000);
