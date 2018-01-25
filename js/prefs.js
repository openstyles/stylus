/* global prefs: true, contextMenus, FIREFOX_NO_DOM_STORAGE */
'use strict';

// eslint-disable-next-line no-var
var prefs = new function Prefs() {
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
    'editor.exclusions.expanded': false, // UI element state: expanded/collapsed
    'editor.lint.expanded': true,   // UI element state: expanded/collapsed
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

    'iconset': 0,                   // 0 = dark-themed icon
                                    // 1 = light-themed icon

    'badgeDisabled': '#8B0000',     // badge background color when disabled
    'badgeNormal': '#006666',       // badge background color

    'popupWidth': 246,              // popup width in pixels

    'updateInterval': 24,           // user-style automatic update interval, hours (0 = disable)
  };
  const values = deepCopy(defaults);

  const affectsIcon = [
    'show-badge',
    'disableAll',
    'badgeDisabled',
    'badgeNormal',
    'iconset',
  ];

  const onChange = {
    any: new Set(),
    specific: new Map(),
  };

  // coalesce multiple pref changes in broadcast
  let broadcastPrefs = {};

  Object.defineProperties(this, {
    defaults: {value: deepCopy(defaults)},
    readOnlyValues: {value: {}},
  });

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

    set(key, value, {broadcast = true, sync = true, fromBroadcast} = {}) {
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
      const hasChanged = !equal(value, oldValue);
      if (!fromBroadcast || FIREFOX_NO_DOM_STORAGE) {
        localStorage[key] = typeof defaults[key] === 'object'
          ? JSON.stringify(value)
          : value;
      }
      if (!fromBroadcast && broadcast && hasChanged) {
        this.broadcast(key, value, {sync});
      }
      if (hasChanged) {
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
    },

    reset: key => this.set(key, deepCopy(defaults[key])),

    broadcast(key, value, {sync = true} = {}) {
      broadcastPrefs[key] = value;
      debounce(doBroadcast);
      if (sync) {
        debounce(doSyncSet);
      }
    },

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
  });

  {
    const importFromBG = () =>
      API.getPrefs().then(prefs => {
        const props = {};
        for (const id in prefs) {
          const value = prefs[id];
          values[id] = value;
          props[id] = {value: deepCopy(value)};
        }
        Object.defineProperties(this.readOnlyValues, props);
      });
    // Unlike chrome.storage or messaging, HTML5 localStorage is synchronous and always ready,
    // so we'll mirror the prefs to avoid using the wrong defaults during the startup phase
    const importFromLocalStorage = () => {
      forgetOutdatedDefaults(localStorage);
      for (const key in defaults) {
        const defaultValue = defaults[key];
        let value = localStorage[key];
        if (typeof value === 'string') {
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
        } else if (FIREFOX_NO_DOM_STORAGE && BG) {
          value = BG.localStorage[key];
          value = value === undefined ? defaultValue : value;
          localStorage[key] = value;
        } else {
          value = defaultValue;
        }
        if (BG === window) {
          // when in bg page, .set() will write to localStorage
          this.set(key, value, {broadcast: false, sync: false});
        } else {
          values[key] = value;
          defineReadonlyProperty(this.readOnlyValues, key, value);
        }
      }
      return Promise.resolve();
    };
    (FIREFOX_NO_DOM_STORAGE && !BG ? importFromBG() : importFromLocalStorage()).then(() => {
      if (BG && BG !== window) return;
      if (BG === window) {
        affectsIcon.forEach(key => this.broadcast(key, values[key], {sync: false}));
        chromeSync.getValue('settings').then(settings => importFromSync.call(this, settings));
      }
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && 'settings' in changes) {
          importFromSync.call(this, changes.settings.newValue);
        }
      });
    });
  }

  // any access to chrome API takes time due to initialization of bindings
  window.addEventListener('load', function _() {
    window.removeEventListener('load', _);
    chrome.runtime.onMessage.addListener(msg => {
      if (msg.prefs) {
        for (const id in msg.prefs) {
          prefs.set(id, msg.prefs[id], {fromBroadcast: true});
        }
      }
    });
  });

  // register hotkeys
  if (FIREFOX && (browser.commands || {}).update) {
    const hotkeyPrefs = Object.keys(values).filter(k => k.startsWith('hotkey.'));
    this.subscribe(hotkeyPrefs, (name, value) => {
      try {
        name = name.split('.')[1];
        if (value.trim()) {
          browser.commands.update({name, shortcut: value}).catch(ignoreChromeError);
        } else {
          browser.commands.reset(name).catch(ignoreChromeError);
        }
      } catch (e) {}
    });
  }

  return;

  function doBroadcast() {
    if (BG && BG === window && !BG.dbExec.initialized) {
      window.addEventListener('storageReady', function _() {
        window.removeEventListener('storageReady', _);
        doBroadcast();
      });
      return;
    }
    const affects = {
      all: 'disableAll' in broadcastPrefs
        || 'exposeIframes' in broadcastPrefs,
    };
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
    chromeSync.setValue('settings', values);
  }

  function importFromSync(synced = {}) {
    forgetOutdatedDefaults(synced);
    for (const key in defaults) {
      if (key in synced) {
        this.set(key, synced[key], {sync: false});
      }
    }
  }

  function forgetOutdatedDefaults(storage) {
    // our linter runs as a worker so we can reduce the delay and forget the old default values
    if (Number(storage['editor.lintDelay']) === 500) delete storage['editor.lintDelay'];
    if (Number(storage['editor.lintReportDelay']) === 4500) delete storage['editor.lintReportDelay'];
  }

  function defineReadonlyProperty(obj, key, value) {
    const copy = deepCopy(value);
    if (typeof copy === 'object') {
      Object.freeze(copy);
    }
    Object.defineProperty(obj, key, {value: copy, configurable: true});
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
    return CHROME && (
      // detect browsers without Delete by looking at the end of UA string
      /Vivaldi\/[\d.]+$/.test(navigator.userAgent) ||
      // Chrome and co.
      /Safari\/[\d.]+$/.test(navigator.userAgent) &&
      // skip forks with Flash as those are likely to have the menu e.g. CentBrowser
      !Array.from(navigator.plugins).some(p => p.name === 'Shockwave Flash')
    );
  }
}();


// Accepts an array of pref names (values are fetched via prefs.get)
// and establishes a two-way connection between the document elements and the actual prefs
function setupLivePrefs(
  IDs = Object.getOwnPropertyNames(prefs.readOnlyValues)
    .filter(id => $('#' + id))
) {
  const checkedProps = {};
  for (const id of IDs) {
    const element = $('#' + id);
    checkedProps[id] = element.type === 'checkbox' ? 'checked' : 'value';
    updateElement({id, element, force: true});
    element.addEventListener('change', onChange);
  }
  prefs.subscribe(IDs, (id, value) => updateElement({id, value}));

  function onChange() {
    const value = this[checkedProps[this.id]];
    if (prefs.get(this.id) !== value) {
      prefs.set(this.id, value);
    }
  }
  function updateElement({
    id,
    value = prefs.get(id),
    element = $('#' + id),
    force,
  }) {
    if (!element) {
      prefs.unsubscribe(IDs, updateElement);
      return;
    }
    const prop = checkedProps[id];
    if (force || element[prop] !== value) {
      element[prop] = value;
      element.dispatchEvent(new Event('change', {bubbles: true, cancelable: true}));
    }
  }
}
