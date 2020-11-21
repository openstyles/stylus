/* global
  $
  CodeMirror
  debounce
  editor
  loadScript
  prefs
  rerouteHotkeys
*/
'use strict';

//#region cmFactory
(() => {
  /*
  All cm instances created by this module are collected so we can broadcast prefs
  settings to them. You should `cmFactory.destroy(cm)` to unregister the listener
  when the instance is not used anymore.
  */
  const cms = new Set();
  let lazyOpt;

  const cmFactory = window.cmFactory = {
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
  };

  const handledPrefs = {
    // handled in colorpicker-helper.js
    'editor.colorpicker'() {},
    /** @returns {?Promise<void>} */
    'editor.theme'(key, value) {
      const elt = $('#cm-theme');
      if (value === 'default') {
        elt.href = '';
      } else {
        const url = chrome.runtime.getURL(`vendor/codemirror/theme/${value}.css`);
        if (url !== elt.href) {
          // avoid flicker: wait for the second stylesheet to load, then apply the theme
          return loadScript(url, true).then(([newElt]) => {
            cmFactory.globalSetOption('theme', value);
            elt.remove();
            newElt.id = elt.id;
          });
        }
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
})();
//#endregion

//#region Commands
(() => {
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
})();
//#endregion

//#region CM option handlers
(() => {
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
})();
//#endregion

//#region Autocomplete
(() => {
  const USO_VAR = 'uso-variable';
  const USO_VALID_VAR = 'variable-3 ' + USO_VAR;
  const USO_INVALID_VAR = 'error ' + USO_VAR;
  const RX_IMPORTANT = /(i(m(p(o(r(t(a(nt?)?)?)?)?)?)?)?)?(?=\b|\W|$)/iy;
  const RX_VAR_KEYWORD = /(^|[^-\w\u0080-\uFFFF])var\(/iy;
  const RX_END_OF_VAR = /[\s,)]|$/g;
  const RX_CONSUME_PROP = /[-\w]*\s*:\s?|$/y;
  const originalHelper = CodeMirror.hint.css || (() => {});
  CodeMirror.registerHelper('hint', 'css', helper);
  CodeMirror.registerHelper('hint', 'stylus', helper);
  const hooks = CodeMirror.mimeModes['text/css'].tokenHooks;
  const originalCommentHook = hooks['/'];
  hooks['/'] = tokenizeUsoVariables;

  function helper(cm) {
    const pos = cm.getCursor();
    const {line, ch} = pos;
    const {styles, text} = cm.getLineHandle(line);
    if (!styles) {
      return originalHelper(cm);
    }
    const {style, index} = cm.getStyleAtPos({styles, pos: ch}) || {};
    if (/^(comment|string)/.test(style)) {
      return originalHelper(cm);
    }
    // !important
    if (text[ch - 1] === '!' && testAt(/i|\W|$/iy, ch, text)) {
      return {
        list: ['important'],
        from: pos,
        to: {line, ch: ch + execAt(RX_IMPORTANT, ch, text)[0].length},
      };
    }
    let prev = index > 2 ? styles[index - 2] : 0;
    let end = styles[index];
    // #hex colors
    if (text[prev] === '#') {
      return {list: [], from: pos, to: pos};
    }
    // adjust cursor position for /*[[ and ]]*/
    const adjust = text[prev] === '/' ? 4 : 0;
    prev += adjust;
    end -= adjust;
    // --css-variables
    const leftPart = text.slice(prev, ch);
    const startsWithDoubleDash = testAt(/--/y, prev, text);
    if (startsWithDoubleDash ||
        leftPart === '(' && testAt(RX_VAR_KEYWORD, Math.max(0, prev - 4), text)) {
      return {
        list: findAllCssVars(cm, leftPart),
        from: {line, ch: prev + !startsWithDoubleDash},
        to: {line, ch: execAt(RX_END_OF_VAR, prev, text).index},
      };
    }
    if (!editor || !style || !style.includes(USO_VAR)) {
      const res = originalHelper(cm);
      // add ":" after a property name
      const state = res && cm.getTokenAt(pos).state.state;
      if (state === 'block' || state === 'maybeprop') {
        res.list = res.list.map(str => str + ': ');
        res.to.ch += execAt(RX_CONSUME_PROP, res.to.ch, text)[0].length;
      }
      return res;
    }
    // USO vars in usercss mode editor
    const vars = editor.style.usercssData.vars;
    return {
      list: vars ? Object.keys(vars).filter(v => v.startsWith(leftPart)) : [],
      from: {line, ch: prev},
      to: {line, ch: end},
    };
  }

  function findAllCssVars(cm, leftPart) {
    // simplified regex without CSS escapes
    const RX_CSS_VAR = new RegExp(
      '(?:^|[\\s/;{])(' +
      (leftPart.startsWith('--') ? leftPart : '--') +
      (leftPart.length <= 2 ? '[a-zA-Z_\u0080-\uFFFF]' : '') +
      '[-0-9a-zA-Z_\u0080-\uFFFF]*)',
      'g');
    const list = new Set();
    cm.eachLine(({text}) => {
      for (let m; (m = RX_CSS_VAR.exec(text));) {
        list.add(m[1]);
      }
    });
    return [...list].sort();
  }

  function tokenizeUsoVariables(stream) {
    const token = originalCommentHook.apply(this, arguments);
    if (token[1] === 'comment') {
      const {string, start, pos} = stream;
      if (testAt(/\/\*\[\[/y, start, string) &&
        testAt(/]]\*\//y, pos - 4, string)) {
        const vars = (editor.style.usercssData || {}).vars;
        token[0] =
          vars && vars.hasOwnProperty(string.slice(start + 4, pos - 4).replace(/-rgb$/, ''))
            ? USO_VALID_VAR
            : USO_INVALID_VAR;
      }
    }
    return token;
  }

  function execAt(rx, index, text) {
    rx.lastIndex = index;
    return rx.exec(text);
  }

  function testAt(rx, index, text) {
    rx.lastIndex = index;
    return rx.test(text);
  }
})();
//#endregion

//#region Bookmarks
(() => {
  const CLS = 'gutter-bookmark';
  const BRAND = 'sublimeBookmark';
  const CLICK_AREA = 'CodeMirror-linenumbers';
  const {markText} = CodeMirror.prototype;
  CodeMirror.defineInitHook(cm => {
    cm.on('gutterClick', onGutterClick);
    cm.on('gutterContextMenu', onGutterContextMenu);
  });
  // TODO: reimplement bookmarking so next/prev order is decided solely by the line numbers
  Object.assign(CodeMirror.prototype, {
    markText() {
      const marker = markText.apply(this, arguments);
      if (marker[BRAND]) {
        this.doc.addLineClass(marker.lines[0], 'gutter', CLS);
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
    if (!spans || spans.some(span => span.marker[BRAND])) {
      this.doc.removeLineClass(line, 'gutter', CLS);
    }
  }
  function onGutterClick(cm, line, name, e) {
    switch (name === CLICK_AREA && e.button) {
      case 0: {
        // main button: toggle
        const [mark] = cm.findMarks({line, ch: 0}, {line, ch: 1e9}, m => m[BRAND]);
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
    if (name === CLICK_AREA) {
      cm.setSelection = cm.jumpToPos;
      cm.execCommand(e.ctrlKey ? 'prevBookmark' : 'nextBookmark');
      delete cm.setSelection;
      e.preventDefault();
    }
  }
})();
//#endregion
