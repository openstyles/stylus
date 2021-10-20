/* global CodeMirror */
/* global cmFactory */
/* global debounce */// toolbox.js
/* global editor */
/* global linterMan */
/* global prefs */
'use strict';

/* Registers 'hint' helper and 'autocompleteOnTyping' option in CodeMirror */

(() => {
  const USO_VAR = 'uso-variable';
  const USO_VALID_VAR = 'variable-3 ' + USO_VAR;
  const USO_INVALID_VAR = 'error ' + USO_VAR;
  const rxPROP = /^(prop(erty)?|variable-2)\b/;
  const rxVAR = /(^|[^-.\w\u0080-\uFFFF])var\(/iyu;
  const rxCONSUME = /([-\w]*\s*:\s?)?/yu;
  const cssMime = CodeMirror.mimeModes['text/css'];
  const docFuncs = addSuffix(cssMime.documentTypes, '(');
  const {tokenHooks} = cssMime;
  const originalCommentHook = tokenHooks['/'];
  const originalHelper = CodeMirror.hint.css || (() => {});
  let cssMedia, cssProps, cssValues;

  const AOT_ID = 'autocompleteOnTyping';
  const AOT_PREF_ID = 'editor.' + AOT_ID;
  const aot = prefs.get(AOT_PREF_ID);
  CodeMirror.defineOption(AOT_ID, aot, (cm, value) => {
    cm[value ? 'on' : 'off']('changes', autocompleteOnTyping);
    cm[value ? 'on' : 'off']('pick', autocompletePicked);
  });
  prefs.subscribe(AOT_PREF_ID, (key, val) => cmFactory.globalSetOption(AOT_ID, val), {runNow: aot});

  CodeMirror.registerHelper('hint', 'css', helper);
  CodeMirror.registerHelper('hint', 'stylus', helper);

  tokenHooks['/'] = tokenizeUsoVariables;

  async function helper(cm) {
    const pos = cm.getCursor();
    const {line, ch} = pos;
    const {styles, text} = cm.getLineHandle(line);
    const {style, index} = cm.getStyleAtPos({styles, pos: ch}) || {};
    const isStylusLang = cm.doc.mode.name === 'stylus';
    const type = style && style.split(' ', 1)[0] || 'prop?';
    if (!type || type === 'comment' || type === 'string') {
      return originalHelper(cm);
    }
    // not using getTokenAt until the need is unavoidable because it reparses text
    // and runs a whole lot of complex calc inside which is slow on long lines
    // especially if autocomplete is auto-shown on each keystroke
    let prev, end, state;
    let i = index;
    while (
      (prev == null || `${styles[i - 1]}`.startsWith(type)) &&
      (prev = i > 2 ? styles[i - 2] : 0) &&
      isSameToken(text, style, prev)
    ) i -= 2;
    i = index;
    while (
      (end == null || `${styles[i + 1]}`.startsWith(type)) &&
      (end = styles[i]) &&
      isSameToken(text, style, end)
    ) i += 2;
    const getTokenState = () => state || (state = cm.getTokenAt(pos, true).state.state);
    const str = text.slice(prev, end);
    const left = text.slice(prev, ch).trim();
    let leftLC = left.toLowerCase();
    let list;
    switch (leftLC[0]) {

      case '!':
        list = '!important'.startsWith(leftLC) ? ['!important'] : [];
        break;

      case '@':
        list = [
          '@-moz-document',
          '@charset',
          '@font-face',
          '@import',
          '@keyframes',
          '@media',
          '@namespace',
          '@page',
          '@supports',
          '@viewport',
        ];
        break;

      case '#': // prevents autocomplete for #hex colors
        break;

      case '-': // --variable
      case '(': // var(
        list = str.startsWith('--') || testAt(rxVAR, ch - 5, text)
          ? findAllCssVars(cm, left)
          : [];
        if (str.startsWith('(')) {
          prev++;
          leftLC = left.slice(1);
        } else {
          leftLC = left;
        }
        break;

      case '/': // USO vars
        if (str.startsWith('/*[[') && str.endsWith(']]*/')) {
          prev += 4;
          end -= 4;
          end -= text.slice(end - 4, end) === '-rgb' ? 4 : 0;
          list = Object.keys((editor.style.usercssData || {}).vars || {}).sort();
          leftLC = left.slice(4);
        }
        break;

      case 'u': // url(), url-prefix()
      case 'd': // domain()
      case 'r': // regexp()
        if (/^(variable|tag|error)/.test(type) &&
            docFuncs.some(s => s.startsWith(leftLC)) &&
            /^(top|documentTypes|atBlock)/.test(getTokenState())) {
          end++;
          list = docFuncs;
          break;
        }
        // fallthrough to `default`

      default:
        // property values
        if (isStylusLang || getTokenState() === 'prop') {
          while (i > 0 && !rxPROP.test(styles[i + 1])) i -= 2;
          const propEnd = styles[i];
          let prop;
          if (propEnd > text.lastIndexOf(';', ch - 1)) {
            while (i > 0 && rxPROP.test(styles[i + 1])) i -= 2;
            prop = text.slice(styles[i] || 0, propEnd).match(/([-\w]+)?$/u)[1];
          }
          if (prop) {
            if (/[^-\w]/.test(leftLC)) {
              prev += execAt(/[\s:()]*/y, prev, text)[0].length;
              leftLC = leftLC.replace(/^[^\w\s]\s*/, '');
            }
            if (prop.startsWith('--')) prop = 'color'; // assuming 90% of variables are colors
            if (!cssValues) cssValues = await linterMan.worker.getCssPropsValues();
            list = [...new Set([...cssValues.own[prop] || [], ...cssValues.global])];
            end = prev + execAt(/(\s*[-a-z(]+)?/y, prev, text)[0].length;
          }
        }
        // properties and media features
        if (!list &&
            /^(prop(erty|\?)|atom|error)/.test(type) &&
            /^(block|atBlock_parens|maybeprop)/.test(getTokenState())) {
          if (!cssProps) initCssProps();
          if (type === 'prop?') {
            prev += leftLC.length;
            leftLC = '';
          }
          list = state === 'atBlock_parens' ? cssMedia : cssProps;
          end -= /\W$/u.test(str); // e.g. don't consume ) when inside ()
          end += execAt(rxCONSUME, end, text)[0].length;

        }
        if (!list) {
          return isStylusLang
            ? CodeMirror.hint.fromList(cm, {words: CodeMirror.hintWords.stylus})
            : originalHelper(cm);
        }
    }
    return {
      list: (list || []).filter(s => s.startsWith(leftLC)),
      from: {line, ch: prev + str.match(/^\s*/)[0].length},
      to: {line, ch: end},
    };
  }

  function initCssProps() {
    cssProps = addSuffix(cssMime.propertyKeywords);
    cssMedia = [].concat(...Object.entries(cssMime).map(getMediaKeys).filter(Boolean)).sort();
  }

  function addSuffix(obj, suffix = ': ') {
    // Sorting first, otherwise "foo-bar:" would precede "foo:"
    return Object.keys(obj).sort().map(k => k + suffix);
  }

  function getMediaKeys([k, v]) {
    return k === 'mediaFeatures' && addSuffix(v) ||
      k.startsWith('media') && Object.keys(v);
  }

  /** makes sure we don't process a different adjacent comment */
  function isSameToken(text, style, i) {
    return !style || text[i] !== '/' && text[i + 1] !== '*' ||
      !style.startsWith(USO_VALID_VAR) && !style.startsWith(USO_INVALID_VAR);
  }

  function findAllCssVars(cm, leftPart) {
    // simplified regex without CSS escapes
    const rx = new RegExp(
      '(?:^|[\\s/;{])(' +
      (leftPart.startsWith('--') ? leftPart : '--') +
      (leftPart.length <= 2 ? '[a-zA-Z_\u0080-\uFFFF]' : '') +
      '[-0-9a-zA-Z_\u0080-\uFFFF]*)',
      'g');
    const list = new Set();
    cm.eachLine(({text}) => {
      for (let m; (m = rx.exec(text));) {
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
    rx.lastIndex = Math.max(0, index);
    return rx.test(text);
  }

  function autocompleteOnTyping(cm, [info], debounced) {
    const lastLine = info.text[info.text.length - 1];
    if (cm.state.completionActive ||
        info.origin && !info.origin.includes('input') ||
        !lastLine) {
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
