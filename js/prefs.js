/* global promisifyChrome msg API */
/* global deepCopy debounce */ // not used in content scripts
'use strict';

// eslint-disable-next-line no-unused-expressions
window.INJECTED !== 1 && (() => {
  const STORAGE_KEY = 'settings';
  const clone = msg.isBg ? deepCopy : (val => JSON.parse(JSON.stringify(val)));
  const defaults = {
    'openEditInWindow': false,      // new editor opens in a own browser window
    'openEditInWindow.popup': false, // new editor opens in a simplified browser window without omnibox
    'windowPosition': {},           // detached window position
    'show-badge': true,             // display text on popup menu icon
    'disableAll': false,            // boss key
    'exposeIframes': false,         // Add 'stylus-iframe' attribute to HTML element in all iframes
    'newStyleAsUsercss': false,     // create new style in usercss format
    'styleViaXhr': false,           // early style injection to avoid FOUC

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
    'manage.actions.expanded': true,
    'manage.backup.expanded': true,
    'manage.filters.expanded': true,
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
    'editor.beautify.hotkey': '',
    'editor.lintDelay': 300,        // lint gutter marker update delay, ms
    'editor.linter': 'csslint',     // 'csslint' or 'stylelint' or ''
    'editor.lintReportDelay': 500,  // lint report update delay, ms
    'editor.matchHighlight': 'token', // token = token/word under cursor even if nothing is selected
                                      // selection = only when something is selected
                                      // '' (empty string) = disabled
    'editor.autoCloseBrackets': true,    // auto-add a closing pair when typing an opening one of ()[]{}''""
    'editor.autocompleteOnTyping': false, // show autocomplete dropdown on typing a word token
    // "Delete" item in context menu for browsers that don't have it
    'editor.contextDelete': null,
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
    'editor.colorpicker.maxHeight': 300,

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
  const values = clone(defaults);
  const onChange = {
    any: new Set(),
    specific: {},
  };
  if (msg.isBg) {
    promisifyChrome({
      'storage.sync': ['get', 'set'],
    });
  }
  const initializing = (
    msg.isBg
      ? browser.storage.sync.get(STORAGE_KEY).then(res => res[STORAGE_KEY])
      : API.getPrefs()
  ).then(setAll);

  chrome.storage.onChanged.addListener(async (changes, area) => {
    const data = area === 'sync' && changes[STORAGE_KEY];
    if (data) {
      await initializing;
      setAll(data.newValue);
    }
  });

  // This direct assignment allows IDEs to provide correct autocomplete for methods
  const prefs = window.prefs = {
    initializing,
    defaults,
    values,
    get(key) {
      return isKnown(key) && values[key];
    },
    set(key, value, isSynced) {
      if (!isKnown(key)) return;
      const oldValue = values[key];
      const type = typeof defaults[key];
      if (type !== typeof value) {
        if (type === 'string') value = String(value);
        if (type === 'number') value = Number(value) || 0;
        if (type === 'boolean') value = Boolean(value);
      }
      if (value !== oldValue && !simpleDeepEqual(value, oldValue)) {
        values[key] = value;
        emitChange(key, value, isSynced);
      }
    },
    reset(key) {
      prefs.set(key, clone(defaults[key]));
    },
    /**
     * @param {?string|string[]} keys - pref ids or a falsy value to subscribe to everything
     * @param {function(key:string, value:any)} fn
     * @param {Object} [opts]
     * @param {boolean} [opts.now] - when truthy, the listener is called immediately:
     *   1) if `keys` is an array of keys, each `key` will be fired separately with a real `value`
     *   2) if `keys` is falsy, no key/value will be provided
     */
    subscribe(keys, fn, {now} = {}) {
      if (keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (!isKnown(key)) continue;
          const listeners = onChange.specific[key] ||
            (onChange.specific[key] = new Set());
          listeners.add(fn);
          if (now) fn(key, values[key]);
        }
      } else {
        onChange.any.add(fn);
        if (now) fn();
      }
    },
    unsubscribe(keys, fn) {
      if (keys) {
        for (const key of keys) {
          const listeners = onChange.specific[key];
          if (listeners) {
            listeners.delete(fn);
            if (!listeners.size) {
              delete onChange.specific[key];
            }
          }
        }
      } else {
        onChange.all.remove(fn);
      }
    },
  };

  function isKnown(key) {
    const res = defaults.hasOwnProperty(key);
    if (!res) console.warn('Unknown preference "%s"', key);
    return res;
  }

  function setAll(settings) {
    for (const [key, value] of Object.entries(settings || {})) {
      prefs.set(key, value, true);
    }
  }

  function emitChange(key, value, isSynced) {
    for (const fn of onChange.specific[key] || []) {
      fn(key, value);
    }
    for (const fn of onChange.any) {
      fn(key, value);
    }
    if (!isSynced) {
      /* browser.storage is slow and can randomly lose values if the tab was closed immediately
       so we're sending the value to the background script which will save it to the storage;
       the extra bonus is that invokeAPI is immediate in extension tabs */
      if (msg.isBg) {
        debounce(updateStorage);
      } else {
        API.setPref(key, value);
      }
    }
  }

  function updateStorage() {
    return browser.storage.sync.set({[STORAGE_KEY]: values});
  }

  function simpleDeepEqual(a, b) {
    return !a || !b || typeof a !== 'object' || typeof b !== 'object' ? a === b :
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every(key => b.hasOwnProperty(key) && simpleDeepEqual(a[key], b[key]));
  }
})();
