/* global prefs: true, contextMenus */
'use strict';

// eslint-disable-next-line no-var
var prefs = new function Prefs() {
  const defaults = {
    'openEditInWindow': false,      // new editor opens in a own browser window
    'windowPosition': {},           // detached window position
    'show-badge': true,             // display text on popup menu icon
    'disableAll': false,            // boss key

    'popup.breadcrumbs': true,      // display 'New style' links as URL breadcrumbs
    'popup.breadcrumbs.usePath': false, // use URL path for 'this URL'
    'popup.enabledFirst': true,     // display enabled styles before disabled styles
    'popup.stylesFirst': true,      // display enabled styles before disabled styles

    'manage.onlyEnabled': false,    // display only enabled styles
    'manage.onlyEdited': false,     // display only styles created locally
    'manage.newUI': true,           // use the new compact layout
    'manage.newUI.favicons': false, // show favicons for the sites in applies-to
    'manage.newUI.faviconsGray': true, // gray out favicons
    'manage.newUI.targets': 3,      // max number of applies-to targets visible: 0 = none

    'editor.options': {},           // CodeMirror.defaults.*
    'editor.lineWrapping': true,    // word wrap
    'editor.smartIndent': true,     // 'smart' indent
    'editor.indentWithTabs': false, // smart indent with tabs
    'editor.tabSize': 4,            // tab width, in spaces
    'editor.keyMap': navigator.appVersion.indexOf('Windows') > 0 ? 'sublime' : 'default',
    'editor.theme': 'default',      // CSS theme
    'editor.beautify': {            // CSS beautifier
      selector_separator_newline: true,
      newline_before_open_brace: false,
      newline_after_open_brace: true,
      newline_between_properties: true,
      newline_before_close_brace: true,
      newline_between_rules: false,
      end_with_newline: false,
      space_around_selector_separator: true,
    },
    'editor.lintDelay': 500,        // lint gutter marker update delay, ms
    'editor.lintReportDelay': 4500, // lint report update delay, ms
    'editor.matchHighlight': 'token', // token = token/word under cursor even if nothing is selected
                                      // selection = only when something is selected
                                      // '' (empty string) = disabled

    'badgeDisabled': '#8B0000',     // badge background color when disabled
    'badgeNormal': '#006666',       // badge background color

    'popupWidth': 246,              // popup width in pixels

    'updateInterval': 0             // user-style automatic update interval, hour
  };
  const values = deepCopy(defaults);

  const affectsIcon = [
    'show-badge',
    'disableAll',
    'badgeDisabled',
    'badgeNormal',
  ];

  // coalesce multiple pref changes in broadcast
  let broadcastPrefs = {};

  Object.defineProperty(this, 'readOnlyValues', {value: {}});

  Object.assign(Prefs.prototype, {

    get(key, defaultValue) {
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
    },

    getAll() {
      return deepCopy(values);
    },

    set(key, value, {noBroadcast, noSync} = {}) {
      const oldValue = values[key];
      switch (typeof defaults[key]) {
        case typeof value:
          break;
        case 'string':
          value = String(value);
          break;
        case 'number':
          value |= 0;
          break;
        case 'boolean':
          value = value === true || value === 'true';
          break;
      }
      values[key] = value;
      defineReadonlyProperty(this.readOnlyValues, key, value);
      if (BG && BG != window) {
        BG.prefs.set(key, BG.deepCopy(value), {noBroadcast, noSync});
      } else {
        localStorage[key] = typeof defaults[key] == 'object'
          ? JSON.stringify(value)
          : value;
        if (!noBroadcast && !equal(value, oldValue)) {
          this.broadcast(key, value, {noSync});
        }
      }
    },

    remove: key => this.set(key, undefined),

    reset: key => this.set(key, deepCopy(defaults[key])),

    broadcast(key, value, {noSync} = {}) {
      broadcastPrefs[key] = value;
      debounce(doBroadcast);
      if (!noSync) {
        debounce(doSyncSet);
      }
    },
  });

  // Unlike sync, HTML5 localStorage is ready at browser startup
  // so we'll mirror the prefs to avoid using the wrong defaults
  // during the startup phase
  for (const key in defaults) {
    const defaultValue = defaults[key];
    let value = localStorage[key];
    if (typeof value == 'string') {
      switch (typeof defaultValue) {
        case 'boolean':
          value = value.toLowerCase() === 'true';
          break;
        case 'number':
          value |= 0;
          break;
        case 'object':
          value = tryJSONparse(value) || defaultValue;
          break;
      }
    } else {
      value = defaultValue;
    }
    if (BG == window) {
      // when in bg page, .set() will write to localStorage
      this.set(key, value, {noBroadcast: true, noSync: true});
    } else {
      values[key] = value;
      defineReadonlyProperty(this.readOnlyValues, key, value);
    }
  }

  // any access to chrome API takes time due to initialization of bindings
  let lazyInit = () => {
    window.removeEventListener('load', lazyInit);
    lazyInit = null;

    getSync().get('settings', ({settings: synced} = {}) => {
      if (synced) {
        for (const key in defaults) {
          if (key == 'popupWidth' && synced[key] != values.popupWidth) {
            // this is a fix for the period when popupWidth wasn't synced
            // TODO: remove it in a couple of months
            continue;
          }
          if (key in synced) {
            this.set(key, synced[key], {noSync: true});
          }
        }
      }
      if (typeof contextMenus !== 'undefined') {
        for (const id in contextMenus) {
          if (typeof values[id] == 'boolean') {
            this.broadcast(id, values[id], {noSync: true});
          }
        }
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area == 'sync' && 'settings' in changes) {
        const synced = changes.settings.newValue;
        if (synced) {
          for (const key in defaults) {
            if (key in synced) {
              this.set(key, synced[key], {noSync: true});
            }
          }
        } else {
          // user manually deleted our settings, we'll recreate them
          getSync().set({'settings': values});
        }
      }
    });

    chrome.runtime.onMessage.addListener(msg => {
      if (msg.prefs) {
        for (const id in msg.prefs) {
          this.set(id, msg.prefs[id], {noBroadcast: true, noSync: true});
        }
      }
    });
  };

  window.addEventListener('load', lazyInit);
  return;

  function doBroadcast() {
    const affects = {all: 'disableAll' in broadcastPrefs};
    if (!affects.all) {
      for (const key in broadcastPrefs) {
        affects.icon = affects.icon || affectsIcon.includes(key);
        affects.popup = affects.popup || key.startsWith('popup');
        affects.editor = affects.editor || key.startsWith('editor');
        affects.manager = affects.manager || key.startsWith('manage');
      }
    }
    notifyAllTabs({method: 'prefChanged', prefs: broadcastPrefs, affects});
    broadcastPrefs = {};
  }

  function doSyncSet() {
    getSync().set({'settings': values});
  }

  // Polyfill for Firefox < 53 https://bugzilla.mozilla.org/show_bug.cgi?id=1220494
  function getSync() {
    if ('sync' in chrome.storage) {
      return chrome.storage.sync;
    }
    const crappyStorage = {};
    return {
      get(key, callback) {
        callback(crappyStorage[key] || {});
      },
      set(source, callback) {
        for (const property in source) {
          if (source.hasOwnProperty(property)) {
            crappyStorage[property] = source[property];
          }
        }
        callback();
      }
    };
  }

  function defineReadonlyProperty(obj, key, value) {
    const copy = deepCopy(value);
    if (typeof copy == 'object') {
      Object.freeze(copy);
    }
    Object.defineProperty(obj, key, {value: copy, configurable: true});
  }

  function equal(a, b) {
    if (!a || !b || typeof a != 'object' || typeof b != 'object') {
      return a === b;
    }
    if (Object.keys(a).length != Object.keys(b).length) {
      return false;
    }
    for (const k in a) {
      if (typeof a[k] == 'object') {
        if (!equal(a[k], b[k])) {
          return false;
        }
      } else if (a[k] !== b[k]) {
        return false;
      }
    }
    return true;
  }
}();


// Accepts an array of pref names (values are fetched via prefs.get)
// and establishes a two-way connection between the document elements and the actual prefs
function setupLivePrefs(IDs) {
  const checkedProps = {};
  for (const id of IDs) {
    const element = document.getElementById(id);
    checkedProps[id] = element.type == 'checkbox' ? 'checked' : 'value';
    updateElement({id, element, force: true});
    element.addEventListener('change', onChange);
  }
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.prefs) {
      for (const id in msg.prefs) {
        if (id in checkedProps) {
          updateElement({id, value: msg.prefs[id]});
        }
      }
    }
  });
  function onChange() {
    const value = this[checkedProps[this.id]];
    if (prefs.get(this.id) != value) {
      prefs.set(this.id, value);
    }
  }
  function updateElement({
    id,
    value = prefs.get(id),
    element = document.getElementById(id),
    force,
  }) {
    const prop = checkedProps[id];
    if (force || element[prop] != value) {
      element[prop] = value;
      element.dispatchEvent(new Event('change', {bubbles: true, cancelable: true}));
    }
  }
}
