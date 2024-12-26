/** Registers 'hint' helper and 'autocompleteOnTyping' option in CodeMirror */
import {kCssPropSuffix, UCD} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {debounce, hasOwn, stringAsRegExpStr, tryRegExp} from '@/js/util';
import CodeMirror from 'codemirror';
import cmFactory from './codemirror-factory';
import editor from './editor';
import {worker} from './util';

const USO_VAR = 'uso-variable';
const USO_VALID_VAR = 'variable-3 ' + USO_VAR;
const USO_INVALID_VAR = 'error ' + USO_VAR;
const rxCmAnyProp = /^(prop(erty)?|variable-2|string-2)\b/;
const rxCmProp = /prop/;
const rxCmTopFunc = /^(top|documentTypes|atBlock)/;
const rxCmVarTagColor = /^(variable|tag|error)/;
const rxConsume = /([-\w]*\s*:\s?)?/yu;
const rxCruftAtStart = /^[^\w\s]\s*/;
const rxFilterable = /^(--|[#.\w])\S*\s*$|^@/;
const rxHexColor = /[0-9a-f]+\b|$|\s/yi;
const rxMaybeProp1 = /^(prop(erty|\?)|atom|error|tag)/;
const rxMaybeProp2 = /^(block|atBlock_parens|maybeprop)/;
const rxNamedColors = /<color>$/;
const rxNonWord = /[^-\w]/u;
const rxNonWordEnd = /[^-\w]$/u;
const rxPropChars = /(\s*[-a-z(]+)?/yi;
const rxPropEnd = /[\s:()]*/y;
const rxVar = /(^|[^-.\w\u0080-\uFFFF])var\(/iyu;
/** Using a string to avoid syntax error while loading this script in old browsers */
const rxWordStart = __.MV3 ? /(?<![-\w]|#[0-9a-f]*)/
  : tryRegExp('(?<![-\\w]|#[0-9a-f]*)');
const rxWord = __.MV3 ? /(?<![-\w]|#[0-9a-f]*)[a-z][-a-z]+/gi
  : rxWordStart ? tryRegExp('(?<![-\\w]|#[0-9a-f]*)[a-z][-a-z]+', 'gi')
    : /\b[a-z][-a-z]+/gi;
const rxstrWordStart = rxWordStart ? rxWordStart.source : '';
const cssMime = CodeMirror.mimeModes['text/css'];
const docFuncs = addSuffix(cssMime.documentTypes, '(');
const docFuncsStr = '\n' + docFuncs.join('\n');
const {tokenHooks} = cssMime;
const originalCommentHook = tokenHooks['/'];
const originalHelper = CodeMirror.hint.css || (() => {});
let cssAts, cssColors, cssMedia, cssProps, cssPropsLC, cssPropNames;
let /** @type {AutocompleteSpec} */ cssSpecData;

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
  let list, leftLC, prop;
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
  if (text[prev] === '#' && testAt(rxHexColor, prev + 1, text)) {
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
  leftLC = left.toLowerCase();
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
      list = str.startsWith('--') || testAt(rxVar, ch - 5, text)
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
        list = Object.keys(editor.style[UCD]?.vars || {}).sort();
        leftLC = left.slice(4);
      }
      break;

    case 'u': // url(), url-prefix()
    case 'd': // domain()
    case 'r': // regexp()
      if (rxCmVarTagColor.test(type) &&
          docFuncsStr.includes('\n' + leftLC) &&
          rxCmTopFunc.test(getTokenState())) {
        end++;
        list = docFuncs;
        break;
      }
      // fallthrough to `default`

    default: {
      // property values
      if (isStylusLang || rxCmProp.test(getTokenState())) {
        while (i > 0 && !rxCmAnyProp.test(styles[i + 1])) i -= 2;
        const propEnd = styles[i];
        if (propEnd > text.lastIndexOf(';', ch - 1)) {
          while (i > 0 && rxCmAnyProp.test(styles[i + 1])) i -= 2;
          prop = (i < 2 || styles[i] < ch) &&
            text.slice(styles[i] || 0, propEnd).toLowerCase().match(/([-\w]+)?$/u)[1];
        }
      }
      if (prop) {
        if (rxNonWord.test(leftLC)) {
          prev += execAt(rxPropEnd, prev, text)[0].length;
          leftLC = leftLC.replace(rxCruftAtStart, '');
        }
        if (prop.startsWith('--')) prop = 'color'; // assuming 90% of variables are colors
        else if (leftLC && prop.startsWith(leftLC)) prop = '';
      }
      if (prop) {
        if (!cssPropNames) await initCssProps();
        prop = cssProps[prop + kCssPropSuffix] || '';
        if (prop) {
          list = prop.replace(rxNamedColors, cssColors) + cssSpecData.global;
          list = list.split('\n');
        }
        end = prev + execAt(rxPropChars, prev, text)[0].length;
      }
      // properties and media features
      if (!list && rxMaybeProp1.test(type) && rxMaybeProp2.test(getTokenState())) {
        if (!cssPropNames) await initCssProps();
        if (type === 'prop?') {
          prev += leftLC.length;
          leftLC = '';
        }
        list = state === 'atBlock_parens' ? cssMedia : prop = cssPropNames;
        end -= rxNonWordEnd.test(str); // e.g. don't consume ) when inside ()
        end += execAt(rxConsume, end, text)[0].length;
      }
    }
  }
  if (!list) {
    const simple = isStylusLang
      ? CodeMirror.hint.fromList(cm, {words: CodeMirror.hintWords.stylus})
      : originalHelper(cm);
    const word = leftLC
      ? RegExp(rxstrWordStart + stringAsRegExpStr(leftLC) + '[-a-z]+', 'gi')
      : rxWord;
    const any = CodeMirror.hint.anyword(cm, {word}).list;
    list = simple ? [...new Set(simple.list.concat(any))] : any;
    list.sort();
  }
  const filterable = rxFilterable.test(leftLC);
  if (filterable) {
    const uniq = new Set(list);
    const uniq2 = new Set();
    const uniq3 = new Set();
    const len = leftLC.length;
    for (const v of uniq) {
      i = v.toLowerCase().indexOf(leftLC);
      if (!i) continue;
      if (i > 0) uniq2.add(v);
      uniq.delete(v);
    }
    if (prop != null && !rxNonWord.test(leftLC) && !leftLC.startsWith('--')) {
      for (const name of cssPropNames) {
        for (let j = 0, a, b, lc = cssPropsLC[name];
          j >= 0 && (j = lc.indexOf(leftLC, j)) >= 0;
          j = b
        ) {
          a = lc.lastIndexOf('\n', j) + 1;
          b = lc.indexOf('\n', j + len);
          (j === a ? uniq2 : uniq3).add(name + cssProps[name].slice(a, b < 0 ? 1e9 : b));
        }
      }
    }
    list = [...uniq, ...uniq2, ...uniq3];
  }
  return {
    list,
    from: {line, ch: prev + str.match(/^\s*/)[0].length},
    to: {line, ch: end},
  };
}

async function initCssProps() {
  cssSpecData = await worker.getCssPropsValues();
  cssAts = cssSpecData.ats;
  cssColors = cssSpecData.colors;
  cssProps = cssSpecData.all;
  cssPropsLC = {}; for (const k in cssProps) cssPropsLC[k] = cssProps[k].toLowerCase();
  cssPropNames = cssSpecData.keys;
  cssMedia = [].concat(...Object.entries(cssMime).map(getMediaKeys).filter(Boolean)).sort();
}

function addSuffix(obj, suffix) {
  // Sorting first, otherwise "foo-bar:" would precede "foo:"
  return (Object.keys(obj).sort().join(suffix + '\n') + suffix).split('\n');
}

function getMediaKeys([k, v]) {
  return k === 'mediaFeatures' && addSuffix(v, kCssPropSuffix) ||
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
      const vars = editor.style[UCD]?.vars;
      token[0] =
        vars && hasOwn(vars, string.slice(start + 4, pos - 4).replace(/-rgb$/, ''))
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
