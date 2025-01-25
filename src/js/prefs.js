/** Don't use this file in content script context! */
import {k_busy} from '@/js/consts';
import {API} from './msg-api';
import {deepCopy, deepEqual, isCssDarkScheme, makePropertyPopProxy} from './util';
import {onStorageChanged} from './util-webext';
import './msg-init'; // installs direct `API` handler

let busy, ready, setReady;
let toUpload;

/** @type {StylusClientData & {then: (cb: (data: StylusClientData) => ?) => Promise}} */
export const clientData = !__.IS_BG && (
  __.MV3
    ? global[__.CLIENT_DATA]
    : API.setClientData({url: location.href, dark: isCssDarkScheme()}).then(data => {
      data = makePropertyPopProxy(data);
      setAll(data.prefs);
      return data;
    })
);

const defaults = {
  __proto__: null,
  // TODO: sort everything aphabetically
  'disableAll': false,            // boss key
  'exposeIframes': false,         // Add 'stylus-iframe' attribute to HTML element in all iframes
  'exposeStyleName': false,       // Add style name to the style for better devtools experience
  'keepAlive': 0,                 // in minutes
  'keepAliveIdle': false,         // keep alive an idle browser
  'newStyleAsUsercss': false,     // create new style in usercss format
  'openEditInWindow': false,      // new editor opens in a own browser window
  'openEditInWindow.popup': false, // new editor opens in a simplified browser window without omnibox
  'patchCsp': false,              // add data: and popular image hosting sites to strict CSP
  'show-badge': true,             // display text on popup menu icon
  'styleViaASS': false,           // document.adoptedStyleSheets
  'styleViaXhr': false,           // early style injection to avoid FOUC
  'urlInstaller': true,           // auto-open installer page for supported .user.css urls
  'windowPosition': {},           // detached window position
  'compactWidth': 850,

  // checkbox in style config dialog
  'config.autosave': true,

  'schemeSwitcher.enabled': 'system',
  'schemeSwitcher.nightStart': '18:00',
  'schemeSwitcher.nightEnd': '06:00',

  'popup.enabledFirst': true,     // display enabled styles before disabled styles
  'popup.stylesFirst': true,      // display enabled styles before disabled styles
  'popup.autoResort': false,      // auto re-sort styles after toggling
  'popup.borders': false,         // add white borders on the sides
  /** @type {'n' | 'u' | 't' | 'w' | 'r'} see IndexEntry */
  'popup.findSort': 'w',          // the inline style search sort order

  'manage.onlyEnabled': false,    // display only enabled styles
  'manage.onlyLocal': false,      // display only styles created locally
  'manage.onlyUsercss': false,    // display only usercss styles
  'manage.onlyEnabled.invert': false, // display only disabled styles
  'manage.onlyLocal.invert': false,   // display only externally installed styles
  'manage.onlyUsercss.invert': false, // display only non-usercss (standard) styles
  // UI element state: expanded/collapsed
  'manage.actions.expanded': false,
  'manage.backup.expanded': true,
  'manage.filters.expanded': true,
  'manage.links.expanded': true,
  'manage.minColumnWidth': 750,
  // the new compact layout doesn't look good on Android yet
  'manage.newUI': true,
  'manage.newUI.favicons': true, // show favicons for the sites in applies-to
  'manage.newUI.faviconsGray': false, // gray out favicons
  'manage.newUI.targets': 3,      // max number of applies-to targets visible: 0 = none
  'manage.newUI.sort': 'title,asc',
  'manage.searchMode': 'meta',

  'editor.options': {},           // CodeMirror.defaults.*
  'editor.toc.expanded': true,    // UI element state: expanded/collapsed
  'editor.options.expanded': true, // UI element state: expanded/collapsed
  'editor.options.style.expanded': true, // UI element state: expanded/collapsed
  'editor.lint.expanded': true,   // UI element state: expanded/collapsed
  'editor.publish.expanded': true, // UI element state expanded/collapsed
  'editor.lineWrapping': true,    // word wrap
  'editor.smartIndent': true,     // 'smart' indent
  'editor.indentWithTabs': false, // smart indent with tabs
  'editor.tabSize': 4,            // tab width, in spaces
  'editor.keyMap': 'default',
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
    indent_mozdoc: true,
    space_around_combinator: true,
    space_around_cmp: false,
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
  'editor.contextDelete': false,
  'editor.selectByTokens': true,
  'editor.arrowKeysTraverse': true,
  'editor.appliesToLineWidget': true, // show applies-to line widget on the editor
  'editor.autosaveDraft': 10, // seconds
  'editor.livePreview': true,
  'editor.livePreview.delay': .2, // seconds (Chrome devtools uses 200ms)
  'editor.targetsFirst': true,

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

  'iconset': -1,                  // 0 = dark-themed icon
                                  // 1 = light-themed icon
                                  // -1 = match dark/light mode
  'badgeDisabled': '#8B0000',     // badge background color when disabled
  'badgeNormal': '#006666',       // badge background color

  /* Using separate values instead of a single {} to ensure type control.
   * Sub-key is the first word in the html's file name. */
  'headerWidth.edit': 280,
  'headerWidth.install': 280,
  'headerWidth.manage': 280,

  'popup.search.globals': false,

  'popupWidth': 246,              // popup width in pixels
  'popupWidthMax': 280,           // popup width in pixels

  'updateInterval': 24,           // user-style automatic update interval, hours (0 = disable)
  'updateOnlyEnabled': false,
};
const warnUnknown = console.warn.bind(console, 'Unknown preference "%s"');
const values = deepCopy(defaults);
/** @type {Record<string, Set<function>>} */
const onChange = {};

export const STORAGE_KEY = 'settings';
/** @type {typeof defaults} */
const defaultsClone = new Proxy({}, {
  get: (_, key) => deepCopy(defaults[key]),
});
export const knownKeys = Object.keys(defaults);

export const get = key => {
  const {[key]: res = warnUnknown(key)} = values;
  return res && typeof res === 'object' ? deepCopy(res) : res;
};

export const set = (key, val, isSynced) => {
  const old = values[key];
  const def = defaults[key];
  const type = typeof def;
  if (!type) return warnUnknown(key);
  if (type !== typeof val) {
    val = type === 'string' ? `${val}` :
      type === 'number' ? +val || 0 :
        type === 'boolean' ? val === 'true' || val !== 'false' && !!val :
          null;
  }
  if (val === old || type === 'object' && deepEqual(val, old)) return;
  values[key] = val;
  if (!global[k_busy] || !__.IS_BG) onChange[key]?.forEach(fn => fn(key, val));
  if (!isSynced && !__.IS_BG) (toUpload ??= Promise.resolve().then(upload) && {})[key] = val;
  /* browser.storage is slow and can randomly lose values if the tab was closed immediately,
   so we're sending the value to the background script which will save it to the storage;
   the extra bonus is that invokeAPI is immediate in extension tabs. */
  return __.IS_BG ? set._bgSet(key, val) : true;
};

export const reset = key => {
  set(key, deepCopy(defaults[key]));
};

/**
 * @param {?string|string[]} keys - pref ids or a falsy value to subscribe to everything
 * @param {function(key:string?, value:any?)} fn
 * @param {boolean} [runNow] - when truthy, the listener is called immediately:
 *   1) if `keys` is an array of keys, each `key` will be fired separately with a real `value`
 *   2) if `keys` is falsy, no key/value will be provided
 */
export const subscribe = (keys, fn, runNow) => {
  if (!fn) return;
  let toRun;
  for (const key of Array.isArray(keys) ? new Set(keys) : [keys]) {
    if (!(key in defaults)) { warnUnknown(key); continue; }
    (onChange[key] ??= new Set()).add(fn);
    if (runNow) {
      if (!busy) fn(key, values[key], true);
      else (toRun ??= []).push(key);
    }
  }
  if (toRun) {
    return busy.then(() => {
      for (const key of toRun) fn(key, values[key], true);
    });
  }
};

export const unsubscribe = (keys, fn) => {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const fns = onChange[key];
    if (fns) {
      fns.delete(fn);
      if (!fns.size) delete onChange[key];
    }
  }
};

function upload() {
  API.setPrefs(toUpload);
  toUpload = null;
}

function setAll(data, fromStorage) {
  busy = false;
  if (!fromStorage) {
    Object.assign(values, data);
    return;
  }
  // checking default values that were deleted from current storage
  for (const key in fromStorage) {
    if (!(key in data) && key in defaults) set(key, defaults[key], true);
  }
  // setting current value + deleting from the source if it's unchanged (for prefs-api.js)
  for (const key in data || (data = {})) {
    if (!set(key, data[key], true)) if (__.IS_BG) delete data[key];
  }
}

if (__.IS_BG) {
  busy = ready = new Promise(cb => (setReady = cb));
  busy.set = (...args) => setReady(setAll(...args));
} else if (__.MV3) {
  setAll(clientData.prefs);
  ready = Promise.resolve();
  ready.then = fn => fn(); // run synchronously in the same microtick because the data is ready
} else {
  busy = ready = clientData;
}

onStorageChanged.addListener((changes, area) => {
  if (busy) return;
  const data = (!area || area === 'sync') && changes[STORAGE_KEY];
  if (data) setAll(data.newValue, data.oldValue);
});

export {
  ready,
  defaultsClone as defaults,
  defaults as __defaults, // direct reference, be careful!
  values as __values, // direct reference, be careful!
};
