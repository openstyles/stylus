/* global CodeMirror prefs loadScript editor $ template */

'use strict';

(function () {
  // CodeMirror miserably fails on keyMap='' so let's ensure it's not
  if (!prefs.get('editor.keyMap')) {
    prefs.reset('editor.keyMap');
  }

  const defaults = {
    autoCloseBrackets: prefs.get('editor.autoCloseBrackets'),
    mode: 'css',
    lineNumbers: true,
    lineWrapping: prefs.get('editor.lineWrapping'),
    foldGutter: true,
    gutters: [
      'CodeMirror-linenumbers',
      'CodeMirror-foldgutter',
      ...(prefs.get('editor.linter') ? ['CodeMirror-lint-markers'] : []),
    ],
    matchBrackets: true,
    hintOptions: {},
    lintReportDelay: prefs.get('editor.lintReportDelay'),
    styleActiveLine: true,
    theme: prefs.get('editor.theme'),
    keyMap: prefs.get('editor.keyMap'),
    extraKeys: Object.assign(CodeMirror.defaults.extraKeys || {}, {
      // independent of current keyMap
      'Alt-Enter': 'toggleStyle',
      'Alt-PageDown': 'nextEditor',
      'Alt-PageUp': 'prevEditor',
      'Ctrl-Pause': 'toggleEditorFocus',
    }),
    maxHighlightLength: 100e3,
  };

  Object.assign(CodeMirror.defaults, defaults, prefs.get('editor.options'));

  // 'basic' keymap only has basic keys by design, so we skip it

  const extraKeysCommands = {};
  Object.keys(CodeMirror.defaults.extraKeys).forEach(key => {
    extraKeysCommands[CodeMirror.defaults.extraKeys[key]] = true;
  });
  if (!extraKeysCommands.jumpToLine) {
    CodeMirror.keyMap.sublime['Ctrl-G'] = 'jumpToLine';
    CodeMirror.keyMap.emacsy['Ctrl-G'] = 'jumpToLine';
    CodeMirror.keyMap.pcDefault['Ctrl-J'] = 'jumpToLine';
    CodeMirror.keyMap.macDefault['Cmd-J'] = 'jumpToLine';
  }
  if (!extraKeysCommands.autocomplete) {
    // will be used by 'sublime' on PC via fallthrough
    CodeMirror.keyMap.pcDefault['Ctrl-Space'] = 'autocomplete';
    // OSX uses Ctrl-Space and Cmd-Space for something else
    CodeMirror.keyMap.macDefault['Alt-Space'] = 'autocomplete';
    // copied from 'emacs' keymap
    CodeMirror.keyMap.emacsy['Alt-/'] = 'autocomplete';
    // 'vim' and 'emacs' define their own autocomplete hotkeys
  }
  if (!extraKeysCommands.blockComment) {
    CodeMirror.keyMap.sublime['Shift-Ctrl-/'] = 'commentSelection';
  }

  if (navigator.appVersion.includes('Windows')) {
    // 'pcDefault' keymap on Windows should have F3/Shift-F3/Ctrl-R
    if (!extraKeysCommands.findNext) {
      CodeMirror.keyMap.pcDefault['F3'] = 'findNext';
    }
    if (!extraKeysCommands.findPrev) {
      CodeMirror.keyMap.pcDefault['Shift-F3'] = 'findPrev';
    }
    if (!extraKeysCommands.replace) {
      CodeMirror.keyMap.pcDefault['Ctrl-R'] = 'replace';
    }

    // try to remap non-interceptable Ctrl-(Shift-)N/T/W hotkeys
    ['N', 'T', 'W'].forEach(char => {
      [
        {from: 'Ctrl-', to: ['Alt-', 'Ctrl-Alt-']},
        // Note: modifier order in CodeMirror is S-C-A
        {from: 'Shift-Ctrl-', to: ['Ctrl-Alt-', 'Shift-Ctrl-Alt-']}
      ].forEach(remap => {
        const oldKey = remap.from + char;
        Object.keys(CodeMirror.keyMap).forEach(keyMapName => {
          const keyMap = CodeMirror.keyMap[keyMapName];
          const command = keyMap[oldKey];
          if (!command) {
            return;
          }
          remap.to.some(newMod => {
            const newKey = newMod + char;
            if (!(newKey in keyMap)) {
              delete keyMap[oldKey];
              keyMap[newKey] = command;
              return true;
            }
          });
        });
      });
    });
  }

  Object.assign(CodeMirror.mimeModes['text/css'].propertyKeywords, {
    // CSS Backgrounds and Borders Module L4
    'background-position-x': true,
    'background-position-y': true,

    // CSS Logical Properties and Values L1
    'block-size': true,
    'border-block-color': true,
    'border-block-end': true,
    'border-block-end-color': true,
    'border-block-end-style': true,
    'border-block-end-width': true,
    'border-block-start': true,
    'border-block-start-color': true,
    'border-block-start-style': true,
    'border-block-start-width': true,
    'border-block-style': true,
    'border-block-width': true,
    'border-inline-color': true,
    'border-inline-end': true,
    'border-inline-end-color': true,
    'border-inline-end-style': true,
    'border-inline-end-width': true,
    'border-inline-start': true,
    'border-inline-start-color': true,
    'border-inline-start-style': true,
    'border-inline-start-width': true,
    'border-inline-style': true,
    'border-inline-width': true,
    'inline-size': true,
    'inset': true,
    'inset-block': true,
    'inset-block-end': true,
    'inset-block-start': true,
    'inset-inline': true,
    'inset-inline-end': true,
    'inset-inline-start': true,
    'margin-block': true,
    'margin-block-end': true,
    'margin-block-start': true,
    'margin-inline': true,
    'margin-inline-end': true,
    'margin-inline-start': true,
    'max-block-size': true,
    'max-inline-size': true,
    'min-block-size': true,
    'min-inline-size': true,
    'padding-block': true,
    'padding-block-end': true,
    'padding-block-start': true,
    'padding-inline': true,
    'padding-inline-end': true,
    'padding-inline-start': true,
    'text-align-all': true,

    'contain': true,
    'mask-image': true,
    'mix-blend-mode': true,
    'rotate': true,
    'isolation': true,
    'zoom': true,

    // https://www.w3.org/TR/css-round-display-1/
    'border-boundary': true,
    'shape': true,
    'shape-inside': true,
    'viewport-fit': true,

    // nonstandard https://compat.spec.whatwg.org/
    'box-reflect': true,
    'text-fill-color': true,
    'text-stroke': true,
    'text-stroke-color': true,
    'text-stroke-width': true,
    // end
  });
  Object.assign(CodeMirror.mimeModes['text/css'].valueKeywords, {
    'isolate': true,
    'rect': true,
    'recto': true,
    'verso': true,
  });
  Object.assign(CodeMirror.mimeModes['text/css'].colorKeywords, {
    'darkgrey': true,
    'darkslategrey': true,
    'dimgrey': true,
    'grey': true,
    'lightgrey': true,
    'lightslategrey': true,
    'slategrey': true,
  });

  const MODE = {
    less: {
      family: 'css',
      value: 'text/x-less',
      isActive: cm =>
        cm.doc.mode &&
        cm.doc.mode.name === 'css' &&
        cm.doc.mode.helperType === 'less',
    },
    stylus: 'stylus',
    uso: 'css'
  };

  CodeMirror.defineExtension('setPreprocessor', function (preprocessor, force = false) {
    const mode = MODE[preprocessor] || 'css';
    const isActive = mode.isActive || (
      cm => cm.doc.mode === mode ||
            cm.doc.mode && (cm.doc.mode.name + (cm.doc.mode.helperType || '') === mode)
    );
    if (!force && isActive(this)) {
      return Promise.resolve();
    }
    if ((mode.family || mode) === 'css') {
      // css.js is always loaded via html
      this.setOption('mode', mode.value || mode);
      return Promise.resolve();
    }
    return loadScript(`/vendor/codemirror/mode/${mode}/${mode}.js`).then(() => {
      this.setOption('mode', mode);
    });
  });

  CodeMirror.defineExtension('isBlank', function () {
    // superfast checking as it runs only until the first non-blank line
    let isBlank = true;
    this.doc.eachLine(line => {
      if (line.text && line.text.trim()) {
        isBlank = false;
        return true;
      }
    });
    return isBlank;
  });

  // editor commands
  for (const name of ['save', 'toggleStyle', 'nextEditor', 'prevEditor']) {
    CodeMirror.commands[name] = (...args) => editor[name](...args);
  }

  // speedup: reuse the old folding marks
  // TODO: remove when https://github.com/codemirror/CodeMirror/pull/6010 is shipped in /vendor
  const {setGutterMarker} = CodeMirror.prototype;
  CodeMirror.prototype.setGutterMarker = function (line, gutterID, value) {
    const o = this.state.foldGutter.options;
    if (typeof o.indicatorOpen === 'string' ||
        typeof o.indicatorFolded === 'string') {
      const old = line.gutterMarkers && line.gutterMarkers[gutterID];
      // old className can contain other names set by CodeMirror so we'll use classList
      if (old && value && old.classList.contains(value.className) ||
          !old && !value) {
        return line;
      }
    }
    return setGutterMarker.apply(this, arguments);
  };

  // CodeMirror convenience commands
  Object.assign(CodeMirror.commands, {
    toggleEditorFocus,
    jumpToLine,
    commentSelection,
  });

  function jumpToLine(cm) {
    const cur = cm.getCursor();
    const oldDialog = $('.CodeMirror-dialog', cm.display.wrapper);
    if (oldDialog) {
      // close the currently opened minidialog
      cm.focus();
    }
    // make sure to focus the input in newly opened minidialog
    // setTimeout(() => {
      // $('.CodeMirror-dialog', section).focus();
    // });
    cm.openDialog(template.jumpToLine.cloneNode(true), str => {
      const m = str.match(/^\s*(\d+)(?:\s*:\s*(\d+))?\s*$/);
      if (m) {
        cm.setCursor(m[1] - 1, m[2] ? m[2] - 1 : cur.ch);
      }
    }, {value: cur.line + 1});
  }

  function commentSelection(cm) {
    cm.blockComment(cm.getCursor('from'), cm.getCursor('to'), {fullLines: false});
  }

  function toggleEditorFocus(cm) {
    if (!cm) return;
    if (cm.hasFocus()) {
      setTimeout(() => cm.display.input.blur());
    } else {
      cm.focus();
    }
  }
})();

// eslint-disable-next-line no-unused-expressions
CodeMirror.hint && (() => {
  const USO_VAR = 'uso-variable';
  const USO_VALID_VAR = 'variable-3 ' + USO_VAR;
  const USO_INVALID_VAR = 'error ' + USO_VAR;
  const RX_IMPORTANT = /(i(m(p(o(r(t(a(nt?)?)?)?)?)?)?)?)?(?=\b|\W|$)/iy;
  const RX_VAR_KEYWORD = /(^|[^-\w\u0080-\uFFFF])var\(/iy;
  const RX_END_OF_VAR = /[\s,)]|$/g;

  const originalHelper = CodeMirror.hint.css || (() => {});
  const helper = cm => {
    const pos = cm.getCursor();
    const {line, ch} = pos;
    const {styles, text} = cm.getLineHandle(line);
    if (!styles) return originalHelper(cm);
    const {style, index} = cm.getStyleAtPos({styles, pos: ch}) || {};
    if (style && (style.startsWith('comment') || style.startsWith('string'))) {
      return originalHelper(cm);
    }

    // !important
    if (text[ch - 1] === '!' && /i|\W|^$/i.test(text[ch] || '')) {
      RX_IMPORTANT.lastIndex = ch;
      return {
        list: ['important'],
        from: pos,
        to: {line, ch: ch + RX_IMPORTANT.exec(text)[0].length},
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
    const leftPart = text.slice(prev, ch);

    // --css-variables
    const startsWithDoubleDash = text[prev] === '-' && text[prev + 1] === '-';
    if (startsWithDoubleDash ||
        leftPart === '(' && testAt(RX_VAR_KEYWORD, Math.max(0, prev - 4), text)) {
      // simplified regex without CSS escapes
      const RX_CSS_VAR = new RegExp(
        '(?:^|[\\s/;{])(' +
        (leftPart.startsWith('--') ? leftPart : '--') +
        (leftPart.length <= 2 ? '[a-zA-Z_\u0080-\uFFFF]' : '') +
        '[-0-9a-zA-Z_\u0080-\uFFFF]*)',
        'gm');
      const cursor = cm.getSearchCursor(RX_CSS_VAR, null, {caseFold: false, multiline: false});
      const list = new Set();
      while (cursor.findNext()) {
        list.add(cursor.pos.match[1]);
      }
      if (!startsWithDoubleDash) {
        prev++;
      }
      RX_END_OF_VAR.lastIndex = prev;
      end = RX_END_OF_VAR.exec(text).index;
      return {
        list: [...list.keys()].sort(),
        from: {line, ch: prev},
        to: {line, ch: end},
      };
    }

    if (!editor || !style || !style.includes(USO_VAR)) {
      return originalHelper(cm);
    }

    // USO vars in usercss mode editor
    const vars = editor.getStyle().usercssData.vars;
    const list = vars ?
      Object.keys(vars).filter(name => name.startsWith(leftPart)) : [];
    return {
      list,
      from: {line, ch: prev},
      to: {line, ch: end},
    };
  };
  CodeMirror.registerHelper('hint', 'css', helper);
  CodeMirror.registerHelper('hint', 'stylus', helper);

  const hooks = CodeMirror.mimeModes['text/css'].tokenHooks;
  const originalCommentHook = hooks['/'];
  hooks['/'] = tokenizeUsoVariables;

  function tokenizeUsoVariables(stream) {
    const token = originalCommentHook.apply(this, arguments);
    if (token[1] !== 'comment') {
      return token;
    }
    const {string, start, pos} = stream;
    // /*[[install-key]]*/
    // 01234          43210
    if (string[start + 2] === '[' &&
        string[start + 3] === '[' &&
        string[pos - 3] === ']' &&
        string[pos - 4] === ']') {
      const vars = typeof editor !== 'undefined' && (editor.getStyle().usercssData || {}).vars;
      const name = vars && string.slice(start + 4, pos - 4);
      if (vars && Object.hasOwnProperty.call(vars, name.endsWith('-rgb') ? name.slice(0, -4) : name)) {
        token[0] = USO_VALID_VAR;
      } else {
        token[0] = USO_INVALID_VAR;
      }
    }
    return token;
  }

  function testAt(rx, index, text) {
    if (!rx) return false;
    rx.lastIndex = index;
    return rx.test(text);
  }
})();
