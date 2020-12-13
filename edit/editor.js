'use strict';

define(require => {
  const {
    deepEqual,
    sessionStore,
    tryJSONparse,
  } = require('/js/toolbox');
  const {$, $create} = require('/js/dom');
  const t = require('/js/localization');
  const {clipString} = require('./util');

  const dirty = DirtyReporter();
  let style;
  let wasDirty = false;
  const toc = [];

  /**
   * @mixes SectionsEditor
   * @mixes SourceEditor
   */
  const editor = {
    dirty,
    isUsercss: false,
    isWindowed: false,
    isWindowSimple: false,
    /** @type {'customName'|'name'} */
    nameTarget: 'name',
    previewDelay: 200, // Chrome devtools uses 200
    scrollInfo: null,

    get style() {
      return style;
    },
    set style(val) {
      style = val;
      editor.scrollInfo = style.id && tryJSONparse(sessionStore['editorScrollInfo' + style.id]);
    },

    applyScrollInfo(cm, si = ((editor.scrollInfo || {}).cms || [])[0]) {
      if (si && si.sel) {
        cm.operation(() => {
          cm.setSelections(...si.sel, {scroll: false});
          cm.scrollIntoView(cm.getCursor(), si.parentHeight / 2);
        });
      }
    },

    toggleStyle() {
      $('#enabled').checked = !style.enabled;
      editor.updateEnabledness(!style.enabled);
    },

    updateDirty() {
      const isDirty = dirty.isDirty();
      if (wasDirty !== isDirty) {
        wasDirty = isDirty;
        document.body.classList.toggle('dirty', isDirty);
        $('#save-button').disabled = !isDirty;
      }
      editor.updateTitle();
    },

    updateEnabledness(enabled) {
      dirty.modify('enabled', style.enabled, enabled);
      style.enabled = enabled;
      editor.updateLivePreview();
    },

    updateName(isUserInput) {
      if (!editor) return;
      if (isUserInput) {
        const {value} = $('#name');
        dirty.modify('name', style[editor.nameTarget] || style.name, value);
        style[editor.nameTarget] = value;
      }
      editor.updateTitle();
    },

    updateTitle(isDirty = dirty.isDirty()) {
      document.title = `${
        isDirty ? '* ' : ''
      }${
        style.customName || style.name || t('styleMissingName')
      } - Stylus`; // the suffix enables external utilities to process our windows e.g. pin on top
    },

    updateToc(added = editor.sections) {
      const elToc = $('#toc');
      const {sections} = editor;
      const first = sections.indexOf(added[0]);
      const elFirst = elToc.children[first];
      if (first >= 0 && (!added.focus || !elFirst)) {
        for (let el = elFirst, i = first; i < sections.length; i++) {
          const entry = sections[i].tocEntry;
          if (!deepEqual(entry, toc[i])) {
            if (!el) el = elToc.appendChild($create('li', {tabIndex: 0}));
            el.tabIndex = entry.removed ? -1 : 0;
            toc[i] = Object.assign({}, entry);
            const s = el.textContent = clipString(entry.label) || (
              entry.target == null
                ? t('appliesToEverything')
                : clipString(entry.target) + (entry.numTargets > 1 ? ', ...' : ''));
            if (s.length > 30) el.title = s;
          }
          el = el.nextElementSibling;
        }
      }
      while (toc.length > sections.length) {
        elToc.lastElementChild.remove();
        toc.length--;
      }
      if (added.focus) {
        const cls = 'current';
        const old = $('.' + cls, elToc);
        const el = elFirst || elToc.children[first];
        if (old && old !== el) old.classList.remove(cls);
        el.classList.add(cls);
      }
    },
  };

  /** @returns DirtyReporter */
  function DirtyReporter() {
    const data = new Map();
    const listeners = new Set();
    const notifyChange = wasDirty => {
      if (wasDirty !== (data.size > 0)) {
        listeners.forEach(cb => cb());
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
        }
        notifyChange(wasDirty);
      },
      clear(obj) {
        const wasDirty = data.size > 0;
        if (obj === undefined) {
          data.clear();
        } else {
          data.delete(obj);
        }
        notifyChange(wasDirty);
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
          }
        } else if (saved.type === 'modify') {
          if (saved.savedValue === newValue) {
            data.delete(obj);
          } else {
            saved.newValue = newValue;
          }
        } else if (saved.type === 'add') {
          saved.newValue = newValue;
        }
        notifyChange(wasDirty);
      },
      onChange(cb, add = true) {
        listeners[add ? 'add' : 'delete'](cb);
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
        }
        notifyChange(wasDirty);
      },
    };
  }

  return editor;
});
