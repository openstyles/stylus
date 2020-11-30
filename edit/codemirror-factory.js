'use strict';

/*
  All cm instances created by this module are collected so we can broadcast prefs
  settings to them. You should `cmFactory.destroy(cm)` to unregister the listener
  when the instance is not used anymore.
*/

define(require => {
  const {debounce} = require('/js/toolbox');
  const {$} = require('/js/dom');
  const prefs = require('/js/prefs');
  const editor = require('./editor');
  const {rerouteHotkeys} = require('./util');
  const CodeMirror = require('/vendor/codemirror/lib/codemirror');

  require('./util').CodeMirror = CodeMirror;

  //#region Factory

  const cms = new Set();
  let lazyOpt;

  const cmFactory = {

    CodeMirror,

    create(place, options) {
      const cm = CodeMirror(place, options);
      const {wrapper} = cm.display;
      cm.lastActive = 0;
      cm.on('blur', () => {
        rerouteHotkeys(true);
        setTimeout(() => {
          wrapper.classList.toggle('CodeMirror-active', wrapper.contains(document.activeElement));
        });
      });
      cm.on('focus', () => {
        rerouteHotkeys(false);
        wrapper.classList.add('CodeMirror-active');
        cm.lastActive = Date.now();
      });
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

    initBeautifyButton(el, scope) {
      el.on('click', e => require(['./beautify'], _ => _.beautifyOnClick(e, false, scope)));
      el.on('contextmenu', e => require(['./beautify'], _ => _.beautifyOnClick(e, true, scope)));
    },
  };

  const handledPrefs = {
    'editor.colorpicker'() {}, // handled in colorpicker-helper.js
    async 'editor.theme'(key, value) {
      let el2;
      const el = $('#cm-theme');
      if (value === 'default') {
        el.href = '';
      } else {
        const path = `/vendor/codemirror/theme/${value}.css`;
        if (el.href !== location.origin + path) {
          // avoid flicker: wait for the second stylesheet to load, then apply the theme
          el2 = await require([path]);
        }
      }
      cmFactory.globalSetOption('theme', value);
      if (el2) {
        el.remove();
        el2.id = el.id;
      }
    },
  };
  const pref2opt = k => k.slice('editor.'.length);
  const mirroredPrefs = Object.keys(prefs.defaults).filter(k =>
    !handledPrefs[k] &&
    k.startsWith('editor.') &&
    Object.hasOwnProperty.call(CodeMirror.defaults, pref2opt(k)));
  prefs.subscribe(mirroredPrefs, (k, val) => cmFactory.globalSetOption(pref2opt(k), val));
  prefs.subscribeMany(handledPrefs);

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
    toggleEditorFocus(cm) {
      if (!cm) return;
      if (cm.hasFocus()) {
        setTimeout(() => cm.display.input.blur());
      } else {
        cm.focus();
      }
    },
    commentSelection(cm) {
      cm.blockComment(cm.getCursor('from'), cm.getCursor('to'), {fullLines: false});
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

  const {insertTab, insertSoftTab} = CodeMirror.commands;
  Object.entries({
    tabSize(cm, value) {
      cm.setOption('indentUnit', Number(value));
    },
    indentWithTabs(cm, value) {
      CodeMirror.commands.insertTab = value ? insertTab : insertSoftTab;
    },
    autocompleteOnTyping(cm, value) {
      const onOff = value ? 'on' : 'off';
      cm[onOff]('changes', autocompleteOnTyping);
      cm[onOff]('pick', autocompletePicked);
    },
    matchHighlight(cm, value) {
      const showToken = value === 'token' && /[#.\-\w]/;
      const opt = (showToken || value === 'selection') && {
        showToken,
        annotateScrollbar: true,
        onUpdate: updateMatchHighlightCount,
      };
      cm.setOption('highlightSelectionMatches', opt || null);
    },
    selectByTokens(cm, value) {
      cm.setOption('configureMouse', value ? configureMouseFn : null);
    },
  }).forEach(([name, fn]) => {
    CodeMirror.defineOption(name, prefs.get('editor.' + name), fn);
  });

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

  function autocompleteOnTyping(cm, [info], debounced) {
    const lastLine = info.text[info.text.length - 1];
    if (
      cm.state.completionActive ||
      info.origin && !info.origin.includes('input') ||
      !lastLine
    ) {
      return;
    }
    if (cm.state.autocompletePicked) {
      cm.state.autocompletePicked = false;
      return;
    }
    if (!debounced) {
      debounce(autocompleteOnTyping, 100, cm, [info], true);
      return;
    }
    if (lastLine.match(/[-a-z!]+$/i)) {
      cm.state.autocompletePicked = false;
      cm.options.hintOptions.completeSingle = false;
      cm.execCommand('autocomplete');
      setTimeout(() => {
        cm.options.hintOptions.completeSingle = true;
      });
    }
  }

  function autocompletePicked(cm) {
    cm.state.autocompletePicked = true;
  }

  //#endregion
  //#region Bookmarks

  const BM_CLS = 'gutter-bookmark';
  const BM_BRAND = 'sublimeBookmark';
  const BM_CLICKER = 'CodeMirror-linenumbers';
  const {markText} = CodeMirror.prototype;
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
  });
  // TODO: reimplement bookmarking so next/prev order is decided solely by the line numbers
  Object.assign(CodeMirror.prototype, {
    markText() {
      const marker = markText.apply(this, arguments);
      if (marker[BM_BRAND]) {
        this.doc.addLineClass(marker.lines[0], 'gutter', BM_CLS);
        marker.clear = clearMarker;
      }
      return marker;
    },
  });

  function clearMarker() {
    const line = this.lines[0];
    const spans = line.markedSpans;
    delete this.clear; // removing our patch from the instance...
    this.clear(); // ...and using the original prototype
    if (!spans || spans.some(span => span.marker[BM_BRAND])) {
      this.doc.removeLineClass(line, 'gutter', BM_CLS);
    }
  }

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

  //#endregion

  return cmFactory;
});
