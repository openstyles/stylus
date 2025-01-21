/** Registers 'hint' helper and 'autocompleteOnTyping' option in CodeMirror */
import {getStyleAtPos} from '@/cm/util';
import {kCssPropSuffix, UCD} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {hasOwn, stringAsRegExpStr, tryRegExp} from '@/js/util';
import {CodeMirror} from '@/cm';
import {
  addSuffix, autocompleteOnTyping, Completion, execAt, findAllCssVars, getTokenState, isSameToken,
  testAt, USO_INVALID_VAR, USO_VALID_VAR,
} from './autocomplete-util';
import cmFactory from './codemirror-factory';
import editor from './editor';
import {worker} from './util';

const rxCmAnyProp = /^(prop(erty)?|variable-2|string-2)\b/;
const rxCmProp = /prop/;
const rxCmTopFunc = /^(top|documentTypes|atBlock)/;
const rxCmVarTagColor = /^(variable|tag|error)/;
const rxConsume = /([-\w]*\s*:\s?)?/yu;
const rxCruftAtStart = /^[^\w\s]\s*/;
const rxFilterable = /(--|[#.\w])\S*\s*$|@/;
const rxHexColor = /[0-9a-f]+\b|$|\s/yi;
const rxMaybeProp1 = /^(prop(erty|\?)|atom|error|tag)/;
const rxMaybeProp2 = /^(block|atBlock_parens|maybeprop)/;
const rxNamedColors = /<color>$/;
const rxNonSpace = /\S/;
const rxNonWord = /[^-\w]/u;
const rxNonWordEnd = /[^-\w]$/u;
const rxPropOrEnd = /^([-a-z]*)(: ?|\()?$/i;
const rxPropChars = /(\s*[-a-z(]+)?/yi;
const rxPropEnd = /[\s:()]*/y;
const rxVar = /(^|[^-.\w\u0080-\uFFFF])var\(/iyu;
/** Using a string to avoid syntax error while loading this script in old browsers */
const rxWordStart = __.MV3 ? /(?<![-\w]|#[0-9a-f]*)/
  : tryRegExp('(?<![-\\w]|#[0-9a-f]*)');
const rxWord = __.MV3 ? /(?<![-\w]|#[0-9a-f]*)[a-z][-a-z]+/gi
  : rxWordStart ? tryRegExp('(?<![-\\w]|#[0-9a-f]*)[a-z][-a-z]+', 'gi')
    : /\b[a-z][-a-z]+/gi;
const cssMime = CodeMirror.mimeModes['text/css'];
const docFuncs = addSuffix(cssMime.documentTypes, '(');
const docFuncsStr = '\n' + docFuncs.join('\n');
const {tokenHooks} = cssMime;
const originalCommentHook = tokenHooks['/'];
const originalHelper = CodeMirror.hint.css || (() => {});

const AOT_ID = 'autocompleteOnTyping';
const AOT_PREF_ID = 'editor.' + AOT_ID;
const aot = prefs.__values[AOT_PREF_ID];

let cssAts, cssColors, cssMedia, cssProps, cssPropsLC, cssPropNames;
let /** @type {AutocompleteSpec} */ cssSpecData;
let prevData, prevMatch, prevLine, prevCh;

CodeMirror.defineOption(AOT_ID, aot, (cm, value) => {
  cm[value ? 'on' : 'off']('changes', autocompleteOnTyping);
});
prefs.subscribe(AOT_PREF_ID, (key, val) => cmFactory.globalSetOption(AOT_ID, val), aot);
CodeMirror.registerHelper('hint', 'css', helper);
CodeMirror.registerHelper('hint', 'stylus', helper);
tokenHooks['/'] = tokenizeUsoVariables;

/** @param {CodeMirror.Editor} cm */
async function helper(cm) {
  const pos = cm.getCursor();
  const {line, ch} = pos;
  const {styles, text} = cm.getLineHandle(line);
  let i, end, leftLC, list, prev, prop, state, str, type;
  if (
    prevData &&
    prevLine === line &&
    prevCh <= ch &&
    prevMatch === text.slice(prevCh - prevMatch.length, prevCh) &&
    (i = text.slice(prevCh, ch).match(rxPropOrEnd)) &&
    (prevMatch += i[1], !i[2])
  ) {
    prevData.len = prevMatch.length;
    prevData.to.ch = ch;
    for (let arr = prevData.list, a = 0, ok = 0, v;
         a < arr.length || ok && !(arr.length = ok);
         a++) {
      v = arr[a];
      if ((v.text || v).indexOf(prevMatch) === v.i) {
        if (ok < a) arr[ok] = v;
        ok++;
      }
    }
    prevLine = line;
    prevCh = ch;
    return prevData;
  }
  prevData = null;
  if (i) {
    prop = prevMatch;
    prev = end = ch;
    str = leftLC = '';
  } else {
    const [style, styleIndex] = getStyleAtPos(styles, ch) || [];
    type = style && style.split(' ', 1)[0] || 'prop?';
    if (!type || type === 'comment' || type === 'string') {
      return originalHelper(cm);
    }
    // not using getTokenAt until the need is unavoidable because it reparses text
    // and runs a whole lot of complex calc inside which is slow on long lines
    // especially if autocomplete is auto-shown on each keystroke
    i = styleIndex;
    while (
      (prev == null || `${styles[i - 1]}`.startsWith(type)) &&
      (prev = i > 2 ? styles[i - 2] : 0) &&
      isSameToken(text, style, prev)
    ) i -= 2;
    if (text[prev] === '#' && testAt(rxHexColor, prev + 1, text)) {
      return; // ignore #hex colors
    }
    i = styleIndex;
    while (
      (end == null || `${styles[i + 1]}`.startsWith(type)) &&
      (end = styles[i]) &&
      isSameToken(text, style, end)
    ) i += 2;
    rxFilterable.lastIndex = prev;
    prev = Math.max(prev, text.search(rxFilterable));
    str = text.slice(prev, end);
    const left = text.slice(prev, ch).trim();
    const L = (leftLC = left.toLowerCase())[0];

    // Using Allman style to have conceptually one block but with separate clauses
    /*eslint-disable brace-style*/
    if (L === '!')
    {
      list = '!important'.startsWith(leftLC) ? ['!important'] : [];
    }
    else if (L === '@')
    {
      list = cssAts || (await initCssProps(), cssAts);
      if (cm.doc.mode.helperType === 'less') {
        list = findAllCssVars(cm, left, '\\s*:').concat(list);
      }
    }
    else if (L === '.' || L === '#') // classes, ids, hex colors
    {
      list = false;
    }
    else if (L === '-' /*--var*/ || L === '(' /*var()*/)
    {
      list = str.startsWith('--') || testAt(rxVar, ch - 5, text)
        ? findAllCssVars(cm, left)
        : [];
      if (str.startsWith('(')) {
        prev++;
        leftLC = left.slice(1);
      } else {
        leftLC = left;
      }
    }
    else if (L === '/') // USO vars
    {
      if (str.startsWith('/*[[') && str.endsWith(']]*/')) {
        prev += 4;
        end -= 4;
        end -= text.slice(end - 4, end) === '-rgb' ? 4 : 0;
        list = Object.keys(editor.style[UCD]?.vars || {}).sort();
        leftLC = left.slice(4);
      }
    }
    else if (L === 'u' /*url*/ || L === 'd' /*domain*/ || L === 'r' /*regexp*/)
    {
      if (rxCmVarTagColor.test(type) &&
          docFuncsStr.includes('\n' + leftLC) &&
          rxCmTopFunc.test(state ??= getTokenState(cm, pos, type))) {
        end++;
        list = docFuncs;
      }
    }
  }
  /*eslint-enable brace-style*/

  if (list == null) {
    // property values
    if (!prop && (
      cm.doc.mode.name === 'stylus' ||
      rxCmProp.test(state ??= getTokenState(cm, pos, type))
    )) {
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
      list = cssProps[prop + kCssPropSuffix];
      if (list !== null) {
        list = (list.replace(rxNamedColors, cssColors) + cssSpecData.global).split('\n');
      }
      end = prev + execAt(rxPropChars, prev, text)[0].length;
    }
    // properties and media features
    if (!list
    && rxMaybeProp1.test(type)
    && rxMaybeProp2.test(state ??= getTokenState(cm, pos, type))) {
      if (!cssPropNames) await initCssProps();
      if (type === 'prop?') {
        prev += leftLC.length;
        leftLC = '';
      }
      list = state === 'atBlock_parens' ? cssMedia : cssPropNames;
      end -= rxNonWordEnd.test(str); // e.g. don't consume ) when inside ()
      end += execAt(rxConsume, end, text)[0].length;
    }
  }
  if (!list) {
    const simple = cm.doc.mode.name === 'stylus'
      ? CodeMirror.hint.fromList(cm, {words: CodeMirror.hintWords.stylus})
      : originalHelper(cm);
    const word = leftLC
      ? RegExp(stringAsRegExpStr(leftLC) + '[-a-z]+', 'gi')
      : rxWord;
    const any = CodeMirror.hint.anyword(cm, {word}).list;
    if (!cssColors) await initCssProps();
    list = [...new Set(simple.list.concat(any, cssColors.split('\n')))];
    list.sort();
  }
  const len = leftLC.length;
  const names1 = new Map();
  const names2 = new Map();
  for (const v of list) {
    i = leftLC ? v.toLowerCase().indexOf(leftLC) : 0;
    if (i >= 0) (i ? names2 : names1).set(v, new Completion(i, v));
  }
  list = [...names1.values(), ...names2.values()];
  if (!prop) {
    const values1 = new Map();
    const values2 = new Map();
    if (!cssPropNames) await initCssProps();
    for (const name of cssPropNames) {
      i = 0;
      for (let a, b, v, lc = cssPropsLC[name];
        i >= 0 && (!leftLC || (i = lc.indexOf(leftLC, i)) >= 0);
        i = leftLC ? b : b + 1 || b/*retain -1 to end the loop*/
      ) {
        a = leftLC ? lc.lastIndexOf('\n', i) + 1 : i;
        b = lc.indexOf('\n', i + len);
        v = cssProps[name].slice(a, b < 0 ? 1e9 : b);
        (i === a ? values1 : values2).set(name + v, new Completion(i - a, name, v));
      }
    }
    list.push(...values1.values(), ...values2.values());
  }
  prev += Math.max(0, str.search(rxNonSpace));
  prevMatch = text.slice(prev, ch);
  prevLine = line;
  prevCh = ch;
  /** @namespace CompletionData */
  prevData = {
    /** length of the highlight for the matched input */
    len,
    list,
    from: {line, ch: prev},
    to: {line, ch: end},
  };
  return prevData;
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

function getMediaKeys([k, v]) {
  return k === 'mediaFeatures' && addSuffix(v, kCssPropSuffix) ||
    k.startsWith('media') && Object.keys(v);
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
