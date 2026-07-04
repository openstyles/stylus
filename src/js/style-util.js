import {mimeLESS} from '@/js/consts';

export const TO_CSS = {
  domains: 'domain',
  urlPrefixes: 'url-prefix',
  urls: 'url',
  regexps: 'regexp',
};
export const FROM_CSS = {
  'domain': 'domains',
  'url-prefix': 'urlPrefixes',
  'url': 'urls',
  'regexp': 'regexps',
};
/** Dumb regexp to avoid catastrophic backtracking. Historically matches strings and open comments
 * like /* foo /* ==userstyle==. TODO: extract a simplified CSS tokenizer from csslint-mod? */
export const RX_META1 = /\/\*!?\s*==userstyle==/gi;
export const RX_META2 = /(==\/userstyle==\s*)?\*\//gi;
const STYLE_CODE_EMPTY_RE =
  /\s+|\/\*([^*]+|\*(?!\/))*(\*\/|$)|@namespace[^;]+;|@charset[^;]+;/iyu;
const rxEscape = /[\\"]/g;

/**
 * @param {UsercssData | UsercssData['preprocessor']} u
 * @param {boolean} [omitVanilla] - return `false` when using vanilla CSS
 * @return {'less'|'stylus'|'css' | false}
 */
export const getPreprocessorMode = (u, omitVanilla) =>
  (u = typeof u === 'string' ? u : u.preprocessor) === 'less' ? mimeLESS
    : u === 'stylus' ? u
      : !omitVanilla && 'css';

/**
 * @param {StyleObj} style
 * @returns {string}
 */
export const styleToCss = style => {
  const res = [];
  for (const section of style.sections) {
    let funcs, arr, cssName;
    for (const propName in TO_CSS) {
      if ((arr = section[propName])) {
        cssName = TO_CSS[propName];
        for (const v of arr) {
          res.push(funcs ? ', ' : res.length ? '\n\n@-moz-document ' : '@-moz-document ',
            cssName, '("', v.replace(rxEscape, '\\$&'), '")');
          funcs = true;
        }
      }
    }
    res.push(funcs ? ' {\n' : '', section.code, funcs ? '\n}' : '');
  }
  return res.join('');
};

/** @param {StyleSection} sec */
export function styleCodeEmpty(sec) {
  const {code} = sec;
  let res = !code;
  if (res || (res = sec._empty) != null) return res;
  const len = code.length;
  const rx = STYLE_CODE_EMPTY_RE; rx.lastIndex = 0;
  let i = 0; while (rx.exec(code) && (i = rx.lastIndex) !== len) {/**/}
  Object.defineProperty(sec, '_empty', {value: res = i === len, configurable: true});
  styleCodeEmpty.lastIndex = i;
  return res;
}

/**
 * The sections are checked in successive order because it matters when many sections
 * match the same URL and they have rules with the same CSS specificity
 * @param {Object} a - first style object
 * @param {Object} b - second style object
 * @returns {?boolean}
 */
export function styleSectionsEqual({sections: a}, {sections: b}) {
  return a && b && a.length === b.length && a.every(sameSection, b);
}

function sameSection(secA, i) {
  const secB = this[i];
  if (!equalOrEmpty(secA.code, secB.code, true)) {
    return;
  }
  for (const target in TO_CSS) {
    if (!equalOrEmpty(secA[target], secB[target], false)) {
      return;
    }
  }
  return true;
}

function equalOrEmpty(a, b, isStr) {
  const typeA = isStr ? typeof a === 'string' : Array.isArray(a);
  const typeB = isStr ? typeof b === 'string' : Array.isArray(b);
  return typeA && typeB && (isStr ? a === b : a.length === b.length && arrayEquals(a, b)) ||
    (a == null || typeA && !a.length) &&
    (b == null || typeB && !b.length);
}

function arrayEquals(a, b) {
  return a.every(thisIncludes, b) && b.every(thisIncludes, a);
}

function thisIncludes(el) {
  return this.includes(el);
}

export async function calcStyleDigest(style) {
  const src = style.usercssData
    ? style.sourceCode
    // retain known properties in an arbitrarily predefined order
    : JSON.stringify((style.sections || []).map(section => ({
      code: section.code || '',
      urls: section.urls || [],
      urlPrefixes: section.urlPrefixes || [],
      domains: section.domains || [],
      regexps: section.regexps || [],
    })));
  const srcBytes = new TextEncoder().encode(src);
  const res = await crypto.subtle.digest('SHA-1', srcBytes);
  return Array.from(new Uint8Array(res), b => (0x100 + b).toString(16).slice(1)).join('');
}

export function styleJSONseemsValid(json) {
  return json
    && typeof json.name == 'string'
    && json.name.trim()
    && Array.isArray(json.sections)
    && typeof json.sections[0]?.code === 'string';
}

/**
 * @param {string} str
 * @param {'?' | 'get' | 'del' | 'match'} [action]
 * @return {true | string | RegExpMatchArray}
 */
export function getMetaComment(str, action) {
  let a, b, res;
  let i = 0;
  while (
    (RX_META1.lastIndex = i, a = RX_META1.exec(str)) &&
    (RX_META2.lastIndex = RX_META1.lastIndex, b = RX_META2.exec(str))
  ) {
    i = RX_META2.lastIndex;
    if (b[1]) break; // a properly closed meta comment /* ==UserStyle== .... ==/UserStyle== */
  }
  if (action === 'del') {
    res = a && b?.[1] ? str.slice(0, a.index) + str.slice(i) : str;
  } else if (!a || !b || !(b = b[1])) {
    // nothing
  } else if (action === '?') {
    res = true;
  } else {
    a = a.index;
    res = str.slice(a, i);
    if (action === 'match') (res = [res]).index = a;
  }
  return res || '';
}
