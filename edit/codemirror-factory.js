/* global $ */// dom.js
/* global CodeMirror */
/* global editor */
/* global prefs */
/* global rerouteHotkeys */// util.js
'use strict';

/*
  All cm instances created by this module are collected so we can broadcast prefs
  settings to them. You should `cmFactory.destroy(cm)` to unregister the listener
  when the instance is not used anymore.
*/

(() => {
  //#region Factory

  const cms = new Set();
  let lazyOpt;

  const cmFactory = window.cmFactory = {

    create(place, options) {
      const cm = CodeMirror(place, options);
      cm.lastActive = 0;
      cms.add(cm);
      return cm;
    },

    destroy(cm) {
      cms.delete(cm);
    },

    globalSetOption(key, value) {
      CodeMirror.defaults[key] = value;
      if (cms.size > 4 && lazyOpt && lazyOpt.names.includes(key)) {
        lazyOpt.set(key, value);
      } else {
        cms.forEach(cm => cm.setOption(key, value));
      }
    },
  };

  // focus and blur

  const onCmFocus = cm => {
    rerouteHotkeys.toggle(false);
    cm.display.wrapper.classList.add('CodeMirror-active');
    cm.lastActive = Date.now();
  };
  const onCmBlur = cm => {
    rerouteHotkeys.toggle(true);
    setTimeout(() => {
      const {wrapper} = cm.display;
      wrapper.classList.toggle('CodeMirror-active', wrapper.contains(document.activeElement));
    });
  };
  CodeMirror.defineInitHook(cm => {
    cm.on('focus', onCmFocus);
    cm.on('blur', onCmBlur);
  });

  // propagated preferences

  const prefToCmOpt = k =>
    k.startsWith('editor.') &&
    k.slice('editor.'.length);
  const prefKeys = prefs.knownKeys.filter(k =>
    k !== 'editor.colorpicker' && // handled in colorpicker-helper.js
    prefToCmOpt(k) in CodeMirror.defaults);
  const {insertTab, insertSoftTab} = CodeMirror.commands;

  for (const [key, fn] of Object.entries({
    'editor.tabSize'(cm, value) {
      cm.setOption('indentUnit', Number(value));
    },
    'editor.indentWithTabs'(cm, value) {
      CodeMirror.commands.insertTab = value ? insertTab : insertSoftTab;
    },
    'editor.matchHighlight'(cm, value) {
      const showToken = value === 'token' && /[#.\-\w]/;
      const opt = (showToken || value === 'selection') && {
        showToken,
        annotateScrollbar: true,
        onUpdate: updateMatchHighlightCount,
      };
      cm.setOption('highlightSelectionMatches', opt || null);
    },
    'editor.selectByTokens'(cm, value) {
      cm.setOption('configureMouse', value ? configureMouseFn : null);
    },
  })) {
    CodeMirror.defineOption(prefToCmOpt(key), prefs.get(key), fn);
    prefKeys.push(key);
  }

  prefs.subscribe(prefKeys, (key, val) => {
    const name = prefToCmOpt(key);
    if (name === 'theme') {
      loadCmTheme(val);
    } else {
      cmFactory.globalSetOption(name, val);
    }
  });

  // lazy propagation

  lazyOpt = window.IntersectionObserver && {
    names: ['theme', 'lineWrapping'],
    set(key, value) {
      const {observer, queue} = lazyOpt;
      for (const cm of cms) {
        let opts = queue.get(cm);
        if (!opts) queue.set(cm, opts = {});
        opts[key] = value;
        observer.observe(cm.display.wrapper);
      }
    },
    setNow({cm, data}) {
      cm.operation(() => data.forEach(kv => cm.setOption(...kv)));
    },
    onView(entries) {
      const {queue, observer} = lazyOpt;
      const delayed = [];
      for (const e of entries) {
        const r = e.isIntersecting && e.intersectionRect;
        if (!r) continue;
        const cm = e.target.CodeMirror;
        const data = Object.entries(queue.get(cm) || {});
        queue.delete(cm);
        observer.unobserve(e.target);
        if (!data.every(([key, val]) => cm.getOption(key) === val)) {
          if (r.bottom > 0 && r.top < window.innerHeight) {
            lazyOpt.setNow({cm, data});
          } else {
            delayed.push({cm, data});
          }
        }
      }
      if (delayed.length) {
        setTimeout(() => delayed.forEach(lazyOpt.setNow));
      }
    },
    get observer() {
      if (!lazyOpt._observer) {
        // must exceed refreshOnView's 100%
        lazyOpt._observer = new IntersectionObserver(lazyOpt.onView, {rootMargin: '150%'});
        lazyOpt.queue = new WeakMap();
      }
      return lazyOpt._observer;
    },
  };

  //#endregion
  //#region Commands

  Object.assign(CodeMirror.commands, {
    commentSelection(cm) {
      cm.blockComment(cm.getCursor('from'), cm.getCursor('to'), {fullLines: false});
    },
    toggleEditorFocus(cm) {
      if (!cm) return;
      if (cm.hasFocus()) {
        setTimeout(() => cm.display.input.blur());
      } else {
        cm.focus();
      }
    },
  });
  for (const cmd of [
    'nextEditor',
    'prevEditor',
    'save',
    'toggleStyle',
  ]) {
    CodeMirror.commands[cmd] = (...args) => editor[cmd](...args);
  }

  //#endregion
  //#region CM option handlers

  async function loadCmTheme(name) {
    let el2;
    const el = $('#cm-theme');
    if (name === 'default') {
      el.href = '';
    } else {
      const path = `/vendor/codemirror/theme/${name}.css`;
      if (el.href !== location.origin + path) {
        // avoid flicker: wait for the second stylesheet to load, then apply the theme
        el2 = await require([path]);
      }
    }
    cmFactory.globalSetOption('theme', name);
    if (el2) {
      el.remove();
      el2.id = el.id;
    }
  }

  function updateMatchHighlightCount(cm, state) {
    cm.display.wrapper.dataset.matchHighlightCount = state.matchesonscroll.matches.length;
  }

  function configureMouseFn(cm, repeat) {
    return repeat === 'double' ?
      {unit: selectTokenOnDoubleclick} :
      {};
  }

  function selectTokenOnDoubleclick(cm, pos) {
    let {ch} = pos;
    const {line, sticky} = pos;
    const {text, styles} = cm.getLineHandle(line);

    const execAt = (rx, i) => (rx.lastIndex = i) && null || rx.exec(text);
    const at = (rx, i) => (rx.lastIndex = i) && null || rx.test(text);
    const atWord = ch => at(/\w/y, ch);
    const atSpace = ch => at(/\s/y, ch);

    const atTokenEnd = styles.indexOf(ch, 1);
    ch += atTokenEnd < 0 ? 0 : sticky === 'before' && atWord(ch - 1) ? 0 : atSpace(ch + 1) ? 0 : 1;
    ch = Math.min(text.length, ch);
    const type = cm.getTokenTypeAt({line, ch: ch + (sticky === 'after' ? 1 : 0)});
    if (atTokenEnd > 0) ch--;

    const isCss = type && !/^(comment|string)/.test(type);
    const isNumber = type === 'number';
    const isSpace = atSpace(ch);
    let wordChars =
      isNumber ? /[-+\w.%]/y :
      isCss ? /[-\w@]/y :
      isSpace ? /\s/y :
      atWord(ch) ? /\w/y : /[^\w\s]/y;

    let a = ch;
    while (a && at(wordChars, a)) a--;
    a += !a && at(wordChars, a) || isCss && at(/[.!#@]/y, a) ? 0 : at(wordChars, a + 1);

    let b, found;

    if (isNumber) {
      b = a + execAt(/[+-]?[\d.]+(e\d+)?|$/yi, a)[0].length;
      found = b >= ch;
      if (!found) {
        a = b;
        ch = a;
      }
    }

    if (!found) {
      wordChars = isCss ? /[-\w]*/y : new RegExp(wordChars.source + '*', 'uy');
      b = ch + execAt(wordChars, ch)[0].length;
    }

    return {
      from: {line, ch: a},
      to: {line, ch: b},
    };
  }

  //#endregion
  //#region Bookmarks

  const BM_CLS = 'gutter-bookmark';
  const BM_BRAND = 'sublimeBookmark';
  const BM_CLICKER = 'CodeMirror-linenumbers';
  const BM_DATA = Symbol('data');
  // TODO: revisit when https://github.com/codemirror/CodeMirror/issues/6716 is fixed
  const tmProto = CodeMirror.TextMarker.prototype;
  const tmProtoOvr = {};
  for (const k of ['clear', 'attachLine', 'detachLine']) {
    tmProtoOvr[k] = function (line) {
      const {cm} = this.doc;
      const withOp = !cm.curOp;
      if (withOp) cm.startOperation();
      tmProto[k].apply(this, arguments);
      cm.curOp.ownsGroup.delayedCallbacks.push(toggleMark.bind(this, this.lines[0], line));
      if (withOp) cm.endOperation();
    };
  }
  for (const name of ['prevBookmark', 'nextBookmark']) {
    const cmdFn = CodeMirror.commands[name];
    CodeMirror.commands[name] = cm => {
      cm.setSelection = cm.jumpToPos;
      cmdFn(cm);
      delete cm.setSelection;
    };
  }
  CodeMirror.defineInitHook(cm => {
    cm.on('gutterClick', onGutterClick);
    cm.on('gutterContextMenu', onGutterContextMenu);
    cm.on('markerAdded', onMarkAdded);
  });
  // TODO: reimplement bookmarking so next/prev order is decided solely by the line numbers
  function onGutterClick(cm, line, name, e) {
    switch (name === BM_CLICKER && e.button) {
      case 0: {
        // main button: toggle
        const [mark] = cm.findMarks({line, ch: 0}, {line, ch: 1e9}, m => m[BM_BRAND]);
        cm.setCursor(mark ? mark.find(-1) : {line, ch: 0});
        cm.execCommand('toggleBookmark');
        break;
      }
      case 1:
        // middle button: select all marks
        cm.execCommand('selectBookmarks');
        break;
    }
  }
  function onGutterContextMenu(cm, line, name, e) {
    if (name === BM_CLICKER) {
      cm.execCommand(e.ctrlKey ? 'prevBookmark' : 'nextBookmark');
      e.preventDefault();
    }
  }
  function onMarkAdded(cm, mark) {
    if (mark[BM_BRAND]) {
      // CM bug workaround to keep the mark at line start when the above line is removed
      mark.inclusiveRight = true;
      Object.assign(mark, tmProtoOvr);
      toggleMark.call(mark, true, mark[BM_DATA] = mark.lines[0]);
    }
  }
  function toggleMark(state, line = this[BM_DATA]) {
    this.doc[state ? 'addLineClass' : 'removeLineClass'](line, 'gutter', BM_CLS);
    if (state) {
      const bms = this.doc.cm.state.sublimeBookmarks;
      if (!bms.includes(this)) bms.push(this);
    }
  }

  //#endregion
})();
