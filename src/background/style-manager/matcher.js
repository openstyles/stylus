import {styleCodeEmpty} from '@/js/sections-util';
import {ownRoot} from '@/js/urls';
import {globAsRegExpStr, RX_MAYBE_REGEXP, tryURL} from '@/js/util';

const BAD_MATCHER = /^$/;
const EXT_RE = /\bextension\b/;
const GLOB_RE = /^(\*|[\w-]+):\/\/(\*\.)?([\w.]+\/.*)/;
const CACHE_MAX = 1000;
/** @type {Map<string,RegExp>} */
const cache = new Map();

function buildOverrideRe(text) {
  const slashed = text.startsWith('/');
  const match = text.match(slashed ? RX_MAYBE_REGEXP : GLOB_RE);
  if (!match) {
    return '^' + globAsRegExpStr(text) + '$';
  }
  if (slashed)
    return match;
  return '^' +
    (match[1] === '*' ? '[\\w-]+' : match[1]) +
    '://' +
    (match[2] ? '(?:[\\w.]+\\.)?' : '') +
    globAsRegExpStr(match[3]) +
    '$';
}

/**
 * @param {string | string[]} text - string or regexp match array
 * @return {RegExp}
 */
function compile(text) {
  let re;
  try {
    if (typeof text === 'string') {
      re = new RegExp(text);
    } else {
      re = text;
      text = text[0]; // use the whole string as a key for the cache map
      re = new RegExp(re[1], re[2]);
    }
  } catch {
    re = BAD_MATCHER;
  }
  cache.set(text, re);
  if (cache.size > CACHE_MAX) {
    // delete the least recently used key
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
    // increase recency of this key
    if (text !== firstKey) cache.delete(text);
    cache.set(text, re);
  }
  return re;
}

export function urlMatchSection(query, section, skipEmptyGlobal) {
  let dd, ddL, pp, ppL, rr, rrL, uu, uuL;
  if (
    (dd = section.domains) && (ddL = dd.length) && dd.some(urlMatchDomain, query) ||
    (pp = section.urlPrefixes) && (ppL = pp.length) && pp.some(urlMatchPrefix, query) ||
    /* Per the specification the fragment portion is ignored in @-moz-document:
       https://www.w3.org/TR/2012/WD-css3-conditional-20120911/#url-of-doc
       but the spec is outdated and doesn't account for SPA sites,
       so we only respect it for `url()` function */
    (uu = section.urls) && (uuL = uu.length) && (
      uu.includes(query.url) ||
      uu.includes(query.urlWithoutHash ??= query.url.split('#', 1)[0])
    ) ||
    (rr = section.regexps) && (rrL = rr.length) && rr.some(urlMatchRegexp, query)
  ) {
    return true;
  }
  /*
  According to CSS4 @document specification the entire URL must match.
  Stylish-for-Chrome implemented it incorrectly since the very beginning.
  We'll detect styles that abuse the bug by finding the sections that
  would have been applied by Stylish but not by us as we follow the spec.
  */
  if (rrL && rr.some(urlMatchRegexpSloppy, query)) {
    return 'sloppy';
  }
  // TODO: check for invalid regexps?
  return !rrL && !ppL && !uuL && !ddL &&
    // We allow only intentionally targeted sections for own pages
    !(query.isOwnPage ??= query.url.startsWith(ownRoot)) &&
    (!skipEmptyGlobal || !styleCodeEmpty(section));
}

/** @this {MatchQuery} */
function urlMatchDomain(d) {
  const _d = this.domain ??= tryURL(this.url).hostname;
  return d === _d ||
    _d[_d.length - d.length - 1] === '.' && _d.endsWith(d);
}

/** @this {MatchQuery} */
export function urlMatchOverride(e) {
  return (cache.get(e) || compile(buildOverrideRe(e)))
    .test(this.urlWithoutParams ??= this.url.split(/[?#]/, 1)[0]);
}

/** @this {MatchQuery} */
function urlMatchPrefix(p) {
  return p && this.url.startsWith(p);
}

/** @this {MatchQuery} */
function urlMatchRegexp(r) {
  return (!(this.isOwnPage ??= this.url.startsWith(ownRoot)) || EXT_RE.test(r)) &&
    (cache.get(r) || compile(`^(${r})$`)).test(this.url);
}

/** @this {MatchQuery} */
function urlMatchRegexpSloppy(r) {
  return (!(this.isOwnPage ??= this.url.startsWith(ownRoot)) || EXT_RE.test(r)) &&
    (cache.get(r) || compile(`^${r}$`)).test(this.url);
}
