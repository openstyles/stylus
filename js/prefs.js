/* global promisify */
'use strict';

self.prefs = self.INJECTED === 1 ? self.prefs : (() => {
  const defaults = {
    'openEditInWindow': false,      // new editor opens in a own browser window
    'windowPosition': {},           // detached window position
    'show-badge': true,             // display text on popup menu icon
    'disableAll': false,            // boss key
    'exposeIframes': false,         // Add 'stylus-iframe' attribute to HTML element in all iframes
    'newStyleAsUsercss': false,     // create new style in usercss format

    // checkbox in style config dialog
    'config.autosave': true,

    'popup.breadcrumbs': true,      // display 'New style' links as URL breadcrumbs
    'popup.breadcrumbs.usePath': false, // use URL path for 'this URL'
    'popup.enabledFirst': true,     // display enabled styles before disabled styles
    'popup.stylesFirst': true,      // display enabled styles before disabled styles
    'popup.autoResort': false,      // auto resort styles after toggling
    'popup.borders': false,         // add white borders on the sides
    'popup.findStylesInline': true, // use the inline style search

    'manage.onlyEnabled': false,    // display only enabled styles
    'manage.onlyLocal': false,      // display only styles created locally
    'manage.onlyUsercss': false,    // display only usercss styles
    'manage.onlyEnabled.invert': false, // display only disabled styles
    'manage.onlyLocal.invert': false,   // display only externally installed styles
    'manage.onlyUsercss.invert': false, // display only non-usercss (standard) styles
    // UI element state: expanded/collapsed
    'manage.backup.expanded': true,
    'manage.filters.expanded': true,
    'manage.options.expanded': true,
    // the new compact layout doesn't look good on Android yet
    'manage.newUI': !navigator.appVersion.includes('Android'),
    'manage.newUI.favicons': false, // show favicons for the sites in applies-to
    'manage.newUI.faviconsGray': true, // gray out favicons
    'manage.newUI.targets': 3,      // max number of applies-to targets visible: 0 = none
    'manage.newUI.sort': 'title,asc',

    'editor.options': {},           // CodeMirror.defaults.*
    'editor.options.expanded': true, // UI element state: expanded/collapsed
    'editor.lint.expanded': true,   // UI element state: expanded/collapsed
    'editor.lineWrapping': true,    // word wrap
    'editor.smartIndent': true,     // 'smart' indent
    'editor.indentWithTabs': false, // smart indent with tabs
    'editor.tabSize': 4,            // tab width, in spaces
    'editor.keyMap': navigator.appVersion.indexOf('Windows') > 0 ? 'sublime' : 'default',
    'editor.theme': 'default',      // CSS theme
    // CSS beautifier
    'editor.beautify': {
      selector_separator_newline: true,
      newline_before_open_brace: false,
      newline_after_open_brace: true,
      newline_between_properties: true,
      newline_before_close_brace: true,
      newline_between_rules: false,
      preserve_newlines: true,
      end_with_newline: false,
      indent_conditional: true,
    },
    'editor.lintDelay': 300,        // lint gutter marker update delay, ms
    'editor.linter': 'csslint',     // 'csslint' or 'stylelint' or ''
    'editor.lintReportDelay': 500,  // lint report update delay, ms
    'editor.matchHighlight': 'token', // token = token/word under cursor even if nothing is selected
                                      // selection = only when something is selected
                                      // '' (empty string) = disabled
    'editor.autoCloseBrackets': true,    // auto-add a closing pair when typing an opening one of ()[]{}''""
    'editor.autocompleteOnTyping': false, // show autocomplete dropdown on typing a word token
    'editor.contextDelete': contextDeleteMissing(), // "Delete" item in context menu
    'editor.selectByTokens': true,

    'editor.appliesToLineWidget': true, // show applies-to line widget on the editor
    'editor.livePreview': true,

    // show CSS colors as clickable colored rectangles
    'editor.colorpicker': true,
    // #DEAD or #beef
    'editor.colorpicker.hexUppercase': false,
    // default hotkey
    'editor.colorpicker.hotkey': '',
    // last color
    'editor.colorpicker.color': '',

    // Firefox-only chrome.commands.update
    'hotkey._execute_browser_action': '',
    'hotkey.openManage': '',
    'hotkey.styleDisableAll': '',

    'sync.enabled': 'none',

    'iconset': 0,                   // 0 = dark-themed icon
                                    // 1 = light-themed icon

    'badgeDisabled': '#8B0000',     // badge background color when disabled
    'badgeNormal': '#006666',       // badge background color

    'popupWidth': 246,              // popup width in pixels

    'updateInterval': 24,           // user-style automatic update interval, hours (0 = disable)
  };
  const values = deepCopy(defaults);

  const onChange = {
    any: new Set(),
    specific: new Map(),
  };

  const syncSet = promisify(chrome.storage.sync.set.bind(chrome.storage.sync));
  const syncGet = promisify(chrome.storage.sync.get.bind(chrome.storage.sync));

  const initializing = syncGet('settings')
    .then(result => {
      if (result.settings) {
        setAll(result.settings, true);
      }
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings || !changes.settings.newValue) {
      return;
    }
    initializing.then(() => setAll(changes.settings.newValue, true));
  });

  let timer;

  // coalesce multiple pref changes in broadcast
  // let changes = {};

  return {
    initializing,
    defaults,
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
    set,
    reset: key => set(key, deepCopy(defaults[key])),
    subscribe(keys, listener) {
      // keys:     string[] ids
      //           or a falsy value to subscribe to everything
      // listener: function (key, value)
      if (keys) {
        for (const key of keys) {
          const existing = onChange.specific.get(key);
          if (!existing) {
            onChange.specific.set(key, listener);
          } else if (existing instanceof Set) {
            existing.add(listener);
          } else {
            onChange.specific.set(key, new Set([existing, listener]));
          }
        }
      } else {
        onChange.any.add(listener);
      }
    },
    unsubscribe(keys, listener) {
      if (keys) {
        for (const key of keys) {
          const existing = onChange.specific.get(key);
          if (existing instanceof Set) {
            existing.delete(listener);
            if (!existing.size) {
              onChange.specific.delete(key);
            }
          } else if (existing) {
            onChange.specific.delete(key);
          }
        }
      } else {
        onChange.all.remove(listener);
      }
    },
  };

  function setAll(settings, synced) {
    for (const [key, value] of Object.entries(settings)) {
      set(key, value, synced);
    }
  }

  function set(key, value, synced = false) {
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
    if (equal(value, oldValue)) {
      return;
    }
    values[key] = value;
    emitChange(key, value);
    if (!synced && !timer) {
      timer = syncPrefsLater();
    }
    return timer;
  }

  function emitChange(key, value) {
    const specific = onChange.specific.get(key);
    if (typeof specific === 'function') {
      specific(key, value);
    } else if (specific instanceof Set) {
      for (const listener of specific.values()) {
        listener(key, value);
      }
    }
    for (const listener of onChange.any.values()) {
      listener(key, value);
    }
  }

  function syncPrefsLater() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        timer = null;
        syncSet({settings: values})
          .then(resolve, reject);
      });
    });
  }

  function equal(a, b) {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
      return a === b;
    }
    if (Object.keys(a).length !== Object.keys(b).length) {
      return false;
    }
    for (const k in a) {
      if (typeof a[k] === 'object') {
        if (!equal(a[k], b[k])) {
          return false;
        }
      } else if (a[k] !== b[k]) {
        return false;
      }
    }
    return true;
  }

  function contextDeleteMissing() {
    return /Chrome\/\d+/.test(navigator.userAgent) && (
      // detect browsers without Delete by looking at the end of UA string
      /Vivaldi\/[\d.]+$/.test(navigator.userAgent) ||
      // Chrome and co.
      /Safari\/[\d.]+$/.test(navigator.userAgent) &&
      // skip forks with Flash as those are likely to have the menu e.g. CentBrowser
      !Array.from(navigator.plugins).some(p => p.name === 'Shockwave Flash')
    );
  }

  function deepCopy(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(deepCopy);
    }
    return Object.keys(obj).reduce((output, key) => {
      output[key] = deepCopy(obj[key]);
      return output;
    }, {});
  }
})();
