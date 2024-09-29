import {$, $create} from '/js/dom';
import {t} from '/js/localization';
import * as prefs from '/js/prefs';
import {clipString, debounce, deepEqual, fetchText, mapObj, sessionStore} from '/js/toolbox';
import CODEMIRROR_THEMES from './codemirror-themes';
import DirtyReporter from './dirty-reporter';

const dirty = DirtyReporter();
const mqCompact = matchMedia('(max-width: 850px)');
/** @type {Set<HTMLInputElement>} */
const regexps = new Set();
const toc = [];

let style;
let wasDirty = false;

/**
 * @type Editor
 * @namespace Editor
 */
const editor = {
  dirty,
  isUsercss: false,
  isWindowed: false,
  livePreviewLazy: cb => debounce(cb, prefs.get('editor.livePreview.delay') * 1000),
  mqCompact,
  /** @type {'customName'|'name'} */
  nameTarget: 'name',
  ppDemo: {
    stylus: 'https://stylus-lang.com/try.html',
    less: 'https://lesscss.org/less-preview/',
  },
  regexps,
  saving: false,
  scrollInfo: {},
  get style() {
    return style;
  },
  set style(val) {
    style = val;
  },

  applyScrollInfo(cm, si = (editor.scrollInfo.cms || [])[0]) {
    if (si && si.sel) {
      const bmOpts = {sublimeBookmark: true, clearWhenEmpty: false}; // copied from sublime.js
      const bms = cm.state.sublimeBookmarks = [];
      for (const b of si.bookmarks) bms.push(cm.markText(b.from, b.to, bmOpts));
      cm.setSelections(...si.sel, {scroll: false});
      Object.assign(cm.display.scroller, si.scroll); // for source editor
      Object.assign(cm.doc, si.scroll); // for sectioned editor
    }
  },

  cancel: () => location.assign('/manage.html'),

  makeScrollInfo() {
    return {
      scrollY: window.scrollY,
      cms: editor.getEditors().map(cm => /** @namespace EditorScrollInfo */({
        bookmarks: (cm.state.sublimeBookmarks || []).map(b => b.find()),
        focus: cm.hasFocus(),
        height: cm.display.wrapper.style.height.replace('100vh', ''),
        parentHeight: cm.display.wrapper.parentElement.offsetHeight,
        scroll: mapObj(cm.doc, null, ['scrollLeft', 'scrollTop']),
        sel: [cm.doc.sel.ranges, cm.doc.sel.primIndex],
      })),
    };
  },

  async save() {
    if (dirty.isDirty()) {
      editor.saving = true;
      await editor.saveImpl();
    }
  },

  toggleRegexp(el, type) {
    let hide;
    if (type === 'regexp') {
      el.on('input', validateRegexp);
      if (regexps.add(el).size === 1) hide = false;
    } else {
      el.setCustomValidity('');
      el.off('input', validateRegexp);
      if (regexps.delete(el) && !regexps.size) hide = true;
    }
    if (hide != null) $('#testRE').hidden = hide;
  },

  toggleStyle(enabled = !style.enabled) {
    $('#enabled').checked = enabled;
    editor.updateEnabledness(enabled);
  },

  updateClass() {
    $.rootCL.toggle('is-new-style', !editor.style.id);
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

  async updateTheme(name) {
    let css;
    if (!CODEMIRROR_THEMES.includes[name]) {
      css = '';
      name = 'default';
      prefs.set('editor.theme', name);
    } else {
      css = await fetchText(`/vendor/codemirror/theme/${name}.css`);
    }
    $('#cm-theme').dataset.theme = name;
    $('#cm-theme').textContent = css;
  },

  updateTitle(isDirty = editor.dirty.isDirty()) {
    const {customName, name} = editor.style;
    document.title = `${
      isDirty ? '* ' : ''
    }${
      customName || name || t('styleMissingName')
    } - Stylus`; // the suffix enables external utilities to process our windows e.g. pin on top
  },

  updateToc(added) {
    const {sections} = editor;
    if (!toc.el) {
      toc.el = $('#toc');
      toc.elDetails = toc.el.closest('details');
      toc.title = $('#toc-title').dataset;
    }
    let num = 0;
    for (const sec of sections) num += !sec.removed;
    if ((+toc.title.num || 1) !== num) {
      if (num > 1) {
        toc.title.num = num;
      } else {
        delete toc.title.num;
      }
    }
    if (!toc.elDetails.open) return;
    if (!added) added = sections;
    const first = sections.indexOf(added[0]);
    const elFirst = toc.el.children[first];
    if (first >= 0 && (!added.focus || !elFirst)) {
      for (let el = elFirst, i = first; i < sections.length; i++) {
        const entry = sections[i].tocEntry;
        if (!deepEqual(entry, toc[i])) {
          if (!el) el = toc.el.appendChild($create('li', {tabIndex: 0}));
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
      toc.el.lastElementChild.remove();
      toc.length--;
    }
    if (added.focus) {
      const cls = 'current';
      const old = $('.' + cls, toc.el);
      const el = elFirst || toc.el.children[first];
      if (old && old !== el) old.classList.remove(cls);
      el.classList.add(cls);
    }
  },

  useSavedStyle(newStyle) {
    if (style.id !== newStyle.id) {
      history.replaceState({}, '', `?id=${newStyle.id}`);
    }
    sessionStore.justEditedStyleId = newStyle.id;
    Object.assign(style, newStyle);
    editor.updateClass();
    editor.updateMeta();
  },
};

function toggleCompact(mq) {
  $.rootCL.toggle('compact-layout', mq.matches);
}

export function failRegexp(r) {
  try {
    new RegExp(r);
    r = '';
  } catch (err) {
    r = err.message.split('/:').pop().trim();
  }
  return r;
}

function validateRegexp({target: el}) {
  let err = failRegexp(el.value);
  if (err) err = t('styleBadRegexp') + '\n' + err;
  if (el.title !== err) {
    el.title = err;
    el.setCustomValidity(err);
  }
}

mqCompact.on('change', toggleCompact);
toggleCompact(mqCompact);

export default editor;
