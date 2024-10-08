/** Registers 'hint' helper and 'autocompleteOnTyping' option in CodeMirror */
import {worker} from '/edit/linter/store';
import * as prefs from '/js/prefs';
import {debounce, stringAsRegExpStr, tryRegExp, UCD} from '/js/toolbox';
import CodeMirror from 'codemirror';
import cmFactory from './codemirror-factory';
import editor from './editor';

const USO_VAR = 'uso-variable';
const USO_VALID_VAR = 'variable-3 ' + USO_VAR;
const USO_INVALID_VAR = 'error ' + USO_VAR;
const rxPROP = /^(prop(erty)?|variable-2|string-2)\b/;
const rxVAR = /(^|[^-.\w\u0080-\uFFFF])var\(/iyu;
const rxCONSUME = /([-\w]*\s*:\s?)?/yu;
// Using a string to avoid syntax error in old browsers
const rxsWORD = tryRegExp('(?<=a)') ? '(?<![-\\w]|#[0-9a-f]*)' : '';
const cssMime = CodeMirror.mimeModes['text/css'];
const docFuncs = addSuffix(cssMime.documentTypes, '(');
const {tokenHooks} = cssMime;
const originalCommentHook = tokenHooks['/'];
const originalHelper = CodeMirror.hint.css || (() => {});
let cssAts, cssMedia, cssProps, cssValues;

const AOT_ID = 'autocompleteOnTyping';
const AOT_PREF_ID = 'editor.' + AOT_ID;
const aot = prefs.get(AOT_PREF_ID);
CodeMirror.defineOption(AOT_ID, aot, (cm, value) => {
  cm[value ? 'on' : 'off']('changes', autocompleteOnTyping);
  cm[value ? 'on' : 'off']('pick', autocompletePicked);
});
prefs.subscribe(AOT_PREF_ID, (key, val) => cmFactory.globalSetOption(AOT_ID, val), aot);

CodeMirror.registerHelper('hint', 'css', helper);
CodeMirror.registerHelper('hint', 'stylus', helper);

tokenHooks['/'] = tokenizeUsoVariables;

async function helper(cm) {
  const pos = cm.getCursor();
  const {line, ch} = pos;
  const {styles, text} = cm.getLineHandle(line);
  const {style, index} = cm.getStyleAtPos({styles, pos: ch}) || {};
  const isLessLang = cm.doc.mode.helperType === 'less';
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
  if (text[prev] === '#' && testAt(/[0-9a-f]+\b|$|\s/yi, prev + 1, text)) {
    return; // ignore #hex colors
  }
  i = index;
  while (
    (end == null || `${styles[i + 1]}`.startsWith(type)) &&
    (end = styles[i]) &&
    isSameToken(text, style, end)
  ) i += 2;
  const getTokenState = () => state || (
    (state = cm.getTokenAt(pos, true)),
    (state = state.type ? state.state.state : type));
  const str = text.slice(prev, end);
  const left = text.slice(prev, ch).trim();
  let leftLC = left.toLowerCase();
  let list;
  switch (leftLC[0]) {

    case '!':
      list = '!important'.startsWith(leftLC) ? ['!important'] : [];
      break;

    case '@':
      list = cssAts || (await initCssProps(), cssAts);
      if (isLessLang) list = findAllCssVars(cm, left, '\\s*:').concat(list);
      break;

    case '.':
    case '#':
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
        list = Object.keys((editor.style[UCD] || {}).vars || {}).sort();
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

    default: {
      // property values
      let prop;
      if (isStylusLang || /prop/.test(getTokenState())) {
        while (i > 0 && !rxPROP.test(styles[i + 1])) i -= 2;
        const propEnd = styles[i];
        if (propEnd > text.lastIndexOf(';', ch - 1)) {
          while (i > 0 && rxPROP.test(styles[i + 1])) i -= 2;
          prop = (i < 2 || styles[i] < ch) &&
            text.slice(styles[i] || 0, propEnd).toLowerCase().match(/([-\w]+)?$/u)[1];
        }
      }
      if (prop) {
        if (/[^-\w]/.test(leftLC)) {
          prev += execAt(/[\s:()]*/y, prev, text)[0].length;
          leftLC = leftLC.replace(/^[^\w\s]\s*/, '');
        }
        if (prop.startsWith('--')) prop = 'color'; // assuming 90% of variables are colors
        else if (leftLC && prop.startsWith(leftLC)) prop = '';
      }
      if (prop) {
        if (!cssProps) await initCssProps();
        prop = cssValues.all[prop];
        list = [...new Set([...prop || [], ...cssValues.global])];
        end = prev + execAt(/(\s*[-a-z(]+)?/yi, prev, text)[0].length;
      }
      // properties and media features
      if (!list &&
          /^(prop(erty|\?)|atom|error|tag)/.test(type) &&
          /^(block|atBlock_parens|maybeprop)/.test(getTokenState())) {
        if (!cssProps) await initCssProps();
        if (type === 'prop?') {
          prev += leftLC.length;
          leftLC = '';
        }
        list = state === 'atBlock_parens' ? cssMedia : cssProps;
        end -= /[^-\w]$/u.test(str); // e.g. don't consume ) when inside ()
        end += execAt(rxCONSUME, end, text)[0].length;
      }
    }
  }
  if (!list) {
    const simple = isStylusLang
      ? CodeMirror.hint.fromList(cm, {words: CodeMirror.hintWords.stylus})
      : originalHelper(cm);
    const word = RegExp(rxsWORD +
      (leftLC ? stringAsRegExpStr(leftLC) : '[a-z]') +
      '[-a-z]+', 'gi');
    const any = CodeMirror.hint.anyword(cm, {word}).list;
    list = simple ? [...new Set(simple.list.concat(any))] : any;
    list.sort();
  }
  return list && {
    list: /^(--|[#.\w])\S*\s*$|^@/.test(leftLC)
      ? list.filter(s => s.toLowerCase().startsWith(leftLC))
      : list,
    from: {line, ch: prev + str.match(/^\s*/)[0].length},
    to: {line, ch: end},
  };
}

async function initCssProps() {
  cssValues = await worker.getCssPropsValues();
  cssAts = cssValues.ats;
  cssProps = addSuffix(cssValues.all);
  cssMedia = [].concat(...Object.entries(cssMime).map(getMediaKeys).filter(Boolean)).sort();
  for (const v of Object.values(cssValues.all)) {
    if (v && v[v.length - 1] === '<color>') {
      v.pop();
      v.push(...cssValues.colors);
    }
  }
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

function findAllCssVars(cm, leftPart, rightPart = '') {
  // simplified regex without CSS escapes
  const [, prefixed, named] = leftPart.match(/^(--|@)?(\S)?/);
  const rx = new RegExp(
    '(?:^|[\\s/;{])(' +
    (prefixed ? leftPart : '--') +
    (named ? '' : '[a-zA-Z_\u0080-\uFFFF]') +
    '[-0-9a-zA-Z_\u0080-\uFFFF]*)' +
    rightPart,
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
      const vars = (editor.style[UCD] || {}).vars;
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
