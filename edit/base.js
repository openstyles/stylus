/* global $$ $ messageBoxProxy setInputValue setupLivePrefs */// dom.js
/* global API */// msg.js
/* global CODEMIRROR_THEMES */
/* global CodeMirror */
/* global MozDocMapper */// sections-util.js
/* global chromeSync */// storage-util.js
/* global initBeautifyButton */// beautify.js
/* global prefs */
/* global t */// localization.js
/* global FIREFOX clipString getOwnTab sessionStore tryJSONparse tryURL */// toolbox.js
'use strict';

/**
 * @type Editor
 * @namespace Editor
 */
const editor = {
  style: null,
  dirty: DirtyReporter(),
  isUsercss: false,
  isWindowed: false,
  livePreview: LivePreview(),
  /** @type {'customName'|'name'} */
  nameTarget: 'name',
  previewDelay: 200, // Chrome devtools uses 200
  saving: false,
  scrollInfo: null,

  cancel: () => location.assign('/manage.html'),

  updateClass() {
    $.rootCL.toggle('is-new-style', !editor.style.id);
  },

  updateTheme(name) {
    if (!CODEMIRROR_THEMES[name]) {
      name = 'default';
      prefs.set('editor.theme', name);
    }
    $('#cm-theme').dataset.theme = name;
    $('#cm-theme').textContent = CODEMIRROR_THEMES[name] || '';
  },

  updateTitle(isDirty = editor.dirty.isDirty()) {
    const {customName, name} = editor.style;
    document.title = `${
      isDirty ? '* ' : ''
    }${
      customName || name || t('styleMissingName')
    } - Stylus`; // the suffix enables external utilities to process our windows e.g. pin on top
  },
};

//#region pre-init

(() => {
  const mqCompact = matchMedia('(max-width: 850px)');
  const toggleCompact = mq => $.rootCL.toggle('compact-layout', mq.matches);
  mqCompact.on('change', toggleCompact);
  toggleCompact(mqCompact);
  Object.assign(editor, /** @namespace Editor */ {
    mqCompact,
    styleReady: prefs.ready.then(loadStyle),
  });

  async function loadStyle() {
    const params = new URLSearchParams(location.search);
    let id = Number(params.get('id'));
    const style = id && await API.styles.get(id) || {
      id: id = null, // resetting the non-existent id
      name: makeName(params),
      enabled: true,
      sections: [
        MozDocMapper.toSection([...params], {code: ''}),
      ],
    };
    // switching the mode here to show the correct page ASAP, usually before DOMContentLoaded
    const isUC = Boolean(style.usercssData || !id && prefs.get('newStyleAsUsercss'));
    Object.assign(editor, /** @namespace Editor */ {
      style,
      isUsercss: isUC,
      template: isUC && !id && chromeSync.getLZValue(chromeSync.LZ_KEY.usercssTemplate), // promise
    });
    editor.updateClass();
    editor.updateTheme(prefs.get('editor.theme'));
    editor.updateTitle(false);
    $.rootCL.add(isUC ? 'usercss' : 'sectioned');
    sessionStore.justEditedStyleId = id || '';
    // no such style so let's clear the invalid URL parameters
    if (id === null) {
      params.delete('id');
      history.replaceState({}, '', location.pathname + (params.size ? '?' : '') + params);
    }
  }

  function makeName(params) {
    const prefix = tryURL(params.get('url-prefix'));
    const {pathname: p = '', hostname: host} = prefix;
    const path = p === '/' ? '' : clipString(p.replace(/\.(html?|aspx?|cgi|php)$/, ''));
    const name = params.get('name') || host;
    return (name ? name + path : params.get('domain') || '?') +
      ` - ${new Date().toLocaleDateString([], {year: 'numeric', month: 'short'})}`;
  }
})();

//#endregion
//#region init header

/* exported EditorHeader */
function EditorHeader() {
  initBeautifyButton($('#beautify'));
  initNameArea();
  setupLivePrefs();
  // move the theme after built-in CSS so that its same-specificity selectors win
  document.head.appendChild($('#cm-theme'));
  window.on('load', () => {
    prefs.subscribe('editor.keyMap', showHotkeyInTooltip, true);
    window.on('showHotkeyInTooltip', showHotkeyInTooltip);
  }, {once: true});

  function findKeyForCommand(command, map) {
    if (typeof map === 'string') map = CodeMirror.keyMap[map];
    let key = Object.keys(map).find(k => map[k] === command);
    if (key) {
      return key;
    }
    for (const ft of Array.isArray(map.fallthrough) ? map.fallthrough : [map.fallthrough]) {
      key = ft && findKeyForCommand(command, ft);
      if (key) {
        return key;
      }
    }
    return '';
  }

  function initNameArea() {
    const nameEl = $('#name');
    const resetEl = $('#reset-name');
    const isCustomName = editor.style.updateUrl || editor.isUsercss;
    editor.nameTarget = isCustomName ? 'customName' : 'name';
    nameEl.placeholder = t(editor.isUsercss ? 'usercssEditorNamePlaceholder' : 'styleMissingName');
    nameEl.title = isCustomName ? t('customNameHint') : '';
    nameEl.on('input', () => {
      editor.updateName(true);
      resetEl.hidden = !editor.style.customName;
    });
    resetEl.hidden = !editor.style.customName;
    resetEl.onclick = () => {
      setInputValue(nameEl, editor.style.name);
      editor.style.customName = null; // to delete it from db
      resetEl.hidden = true;
    };
    const enabledEl = $('#enabled');
    enabledEl.onchange = () => editor.updateEnabledness(enabledEl.checked);
  }

  function showHotkeyInTooltip(_, mapName = prefs.get('editor.keyMap')) {
    const extraKeys = CodeMirror.defaults.extraKeys;
    for (const el of $$('[data-hotkey-tooltip]')) {
      if (el._hotkeyTooltipKeyMap !== mapName) {
        el._hotkeyTooltipKeyMap = mapName;
        const title = el._hotkeyTooltipTitle = el._hotkeyTooltipTitle || el.title;
        const cmd = el.dataset.hotkeyTooltip;
        const key = cmd[0] === '=' ? cmd.slice(1) :
          findKeyForCommand(cmd, mapName) ||
          extraKeys && findKeyForCommand(cmd, extraKeys);
        const newTitle = title + (title && key ? '\n' : '') + (key || '');
        if (el.title !== newTitle) el.title = newTitle;
      }
    }
  }
}

//#endregion
//#region init windowed mode

(() => {
  let ownTabId;
  if (chrome.windows) {
    initWindowedMode();
    const pos = tryJSONparse(sessionStore.windowPos);
    delete sessionStore.windowPos;
    // resize the window on 'undo close'
    if (pos && pos.left != null) {
      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, pos);
    }
  }

  getOwnTab().then(tab => {
    ownTabId = tab.id;
    if (sessionStore['manageStylesHistory' + ownTabId] === location.href) {
      editor.cancel = () => history.back();
    }
  });

  async function initWindowedMode() {
    chrome.tabs.onAttached.addListener(onTabAttached);
    // Chrome 96+ bug: the type is 'app' for a window that was restored via Ctrl-Shift-T
    const isSimple = ['app', 'popup'].includes((await browser.windows.getCurrent()).type);
    if (isSimple) require(['/edit/embedded-popup']);
    editor.isWindowed = isSimple || (
      history.length === 1 &&
      await prefs.ready && prefs.get('openEditInWindow') &&
      (await browser.windows.getAll()).length > 1 &&
      (await browser.tabs.query({currentWindow: true})).length === 1
    );
  }

  async function onTabAttached(tabId, info) {
    if (tabId !== ownTabId) {
      return;
    }
    if (info.newPosition !== 0) {
      prefs.set('openEditInWindow', false);
      return;
    }
    const win = await browser.windows.get(info.newWindowId, {populate: true});
    // If there's only one tab in this window, it's been dragged to new window
    const openEditInWindow = win.tabs.length === 1;
    // FF-only because Chrome retardedly resets the size during dragging
    if (openEditInWindow && FIREFOX) {
      chrome.windows.update(info.newWindowId, prefs.get('windowPosition'));
    }
    prefs.set('openEditInWindow', openEditInWindow);
  }
})();

//#endregion
//#region internals

/** @returns DirtyReporter */
function DirtyReporter() {
  const data = new Map();
  const listeners = new Set();
  const dataListeners = new Set();
  const notifyChange = wasDirty => {
    const isDirty = data.size > 0;
    const flipped = isDirty !== wasDirty;
    if (flipped) {
      listeners.forEach(cb => cb(isDirty));
    }
    if (flipped || isDirty) {
      dataListeners.forEach(cb => cb(isDirty));
    }
  };
  /** @namespace DirtyReporter */
  return {
    add(obj, value) {
      const wasDirty = data.size > 0;
      const saved = data.get(obj);
      if (!saved) {
        data.set(obj, {type: 'add', newValue: value});
      } else if (saved.type === 'remove') {
        if (saved.savedValue === value) {
          data.delete(obj);
        } else {
          saved.newValue = value;
          saved.type = 'modify';
        }
      } else {
        return;
      }
      notifyChange(wasDirty);
    },
    clear(...objs) {
      if (data.size && (
        objs.length
          ? objs.map(data.delete, data).includes(true)
          : (data.clear(), true)
      )) {
        notifyChange(true);
      }
    },
    has(key) {
      return data.has(key);
    },
    isDirty() {
      return data.size > 0;
    },
    modify(obj, oldValue, newValue) {
      const wasDirty = data.size > 0;
      const saved = data.get(obj);
      if (!saved) {
        if (oldValue !== newValue) {
          data.set(obj, {type: 'modify', savedValue: oldValue, newValue});
        } else {
          return;
        }
      } else if (saved.type === 'modify') {
        if (saved.savedValue === newValue) {
          data.delete(obj);
        } else {
          saved.newValue = newValue;
        }
      } else if (saved.type === 'add') {
        saved.newValue = newValue;
      } else {
        return;
      }
      notifyChange(wasDirty);
    },
    onChange(cb, add = true) {
      listeners[add ? 'add' : 'delete'](cb);
    },
    onDataChange(cb, add = true) {
      dataListeners[add ? 'add' : 'delete'](cb);
    },
    remove(obj, value) {
      const wasDirty = data.size > 0;
      const saved = data.get(obj);
      if (!saved) {
        data.set(obj, {type: 'remove', savedValue: value});
      } else if (saved.type === 'add') {
        data.delete(obj);
      } else if (saved.type === 'modify') {
        saved.type = 'remove';
      } else {
        return;
      }
      notifyChange(wasDirty);
    },
  };
}

function LivePreview() {
  let el;
  let data;
  let port;
  let preprocess;
  let enabled = prefs.get('editor.livePreview');

  prefs.subscribe('editor.livePreview', (key, value) => {
    if (!value) {
      if (port) {
        port.disconnect();
        port = null;
      }
    } else if (data && data.id && (data.enabled || editor.dirty.has('enabled'))) {
      createPreviewer();
      updatePreviewer(data);
    }
    enabled = value;
  });

  return {

    /**
     * @param {Function} [fn] - preprocessor
     */
    init(fn) {
      preprocess = fn;
    },

    update(newData) {
      if (!port) {
        if (!enabled
        || !newData.id // not saved
        || !newData.enabled && data && !data.enabled // disabled both before and now
        || !editor.dirty.isDirty()) {
          return;
        }
        createPreviewer();
      }
      data = newData;
      updatePreviewer(data);
    },
  };

  function createPreviewer() {
    port = chrome.runtime.connect({name: 'livePreview:' + editor.style.id});
    port.onDisconnect.addListener(() => (port = null));
    el = $('#preview-errors');
    el.onclick = () => messageBoxProxy.alert(el.title, 'pre');
  }

  async function updatePreviewer(data) {
    try {
      API.styles.preview(preprocess ? await preprocess(data) : data);
      el.hidden = true;
    } catch (err) {
      if (Array.isArray(err)) {
        err = err.map((e, a, b) => !(a = e.message) ? e : ((b = e.context)) ? `${a} in ${b}` : a).join('\n');
      } else if (err && err.index != null) {
        // FIXME: this would fail if editors[0].getValue() !== data.sourceCode
        const pos = editor.getEditors()[0].posFromIndex(err.index);
        err.message = `${pos.line}:${pos.ch} ${err.message || err}`;
      }
      el.title = err.message || `${err}`;
      el.hidden = false;
    }
  }
}

//#endregion
