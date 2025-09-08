import { styleCodeEmpty } from "@/js/sections-util";
import { ownRoot } from "@/js/urls";
import { stringAsRegExpStr, tryRegExp, tryURL } from "@/js/util";
import * as colorScheme from "../color-scheme";

const BAD_MATCHER = { test: () => false };
const EXT_RE = /\bextension\b/;
const compileRe = createCompiler((text) => `^(${text})$`);
const compileSloppyRe = createCompiler((text) => `^${text}$`);
const compileExclusion = createCompiler(buildExclusion);

function buildExclusion(text) {
  // match pattern
  const match = text.match(/^(\*|[\w-]+):\/\/(\*\.)?([\w.]+\/.*)/);
  if (!match) {
    return "^" + compileGlob(text) + "$";
  }
  return (
    "^" +
    (match[1] === "*" ? "[\\w-]+" : match[1]) +
    "://" +
    (match[2] ? "(?:[\\w.]+\\.)?" : "") +
    compileGlob(match[3]) +
    "$"
  );
}

function compileGlob(text) {
  return stringAsRegExpStr(text).replace(/\\\\\\\*|\\\*/g, (m) =>
    m.length > 2 ? m : ".*"
  );
}

function createCompiler(compile) {
  // FIXME: FIFO cache doesn't work well here, if we want to match many
  // regexps more than the cache size, we will never hit the cache because
  // the first cache is deleted. So we use a simple map but it leaks memory.
  const cache = new Map();
  return (text) => {
    let re = cache.get(text);
    if (!re) cache.set(text, (re = tryRegExp(compile(text)) || BAD_MATCHER));
    return re;
  };
}

function urlMatchExclusion(e) {
  return compileExclusion(e).test(
    (this.urlWithoutParams ??= this.url.split(/[?#]/, 1)[0])
  );
}

export function urlMatchStyle(query, style) {
  let ovr;
  if ((ovr = style.exclusions) && ovr.some(urlMatchExclusion, query)) {
    return "excluded";
  }
  if (!style.enabled) {
    return "disabled";
  }
  if (!colorScheme.shouldIncludeStyle(style)) {
    return "excludedScheme";
  }
  if ((ovr = style.inclusions) && ovr.some(urlMatchExclusion, query)) {
    return "included";
  }
  return true;
}

export function urlMatchSection(query, section, skipEmptyGlobal) {
  let dd, ddL, pp, ppL, rr, rrL, uu, uuL, mm, mmL;
  if (
    ((dd = section.domains) &&
      (ddL = dd.length) &&
      dd.some(urlMatchDomain, query)) ||
    ((pp = section.urlPrefixes) &&
      (ppL = pp.length) &&
      pp.some(urlMatchPrefix, query)) ||
    /* Per the specification the fragment portion is ignored in @-moz-document:
       https://www.w3.org/TR/2012/WD-css3-conditional-20120911/#url-of-doc
       but the spec is outdated and doesn't account for SPA sites,
       so we only respect it for `url()` function */
    ((uu = section.urls) &&
      (uuL = uu.length) &&
      (uu.includes(query.url) ||
        uu.includes((query.urlWithoutHash ??= query.url.split("#", 1)[0])))) ||
    ((rr = section.regexps) &&
      (rrL = rr.length) &&
      rr.some(urlMatchRegexp, query)) ||
    ((mm = section.matches) &&
      (mmL = mm.length) &&
      mm.some(urlMatchPattern, query))
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
    return "sloppy";
  }
  // TODO: check for invalid regexps?
  return (
    !rrL &&
    !ppL &&
    !uuL &&
    !ddL &&
    !mmL &&
    // We allow only intentionally targeted sections for own pages
    !(query.isOwnPage ??= query.url.startsWith(ownRoot)) &&
    (!skipEmptyGlobal || !styleCodeEmpty(section))
  );
}

/** @this {MatchQuery} */
function urlMatchDomain(d) {
  const _d = (this.domain ??= tryURL(this.url).hostname);
  return d === _d || (_d[_d.length - d.length - 1] === "." && _d.endsWith(d));
}

/** @this {MatchQuery} */
function urlMatchPrefix(p) {
  return p && this.url.startsWith(p);
}

/** @this {MatchQuery} */
function urlMatchRegexp(r) {
  return (
    (!(this.isOwnPage ??= this.url.startsWith(ownRoot)) || EXT_RE.test(r)) &&
    compileRe(r).test(this.url)
  );
}

/** @this {MatchQuery} */
function urlMatchRegexpSloppy(r) {
  return (
    (!(this.isOwnPage ??= this.url.startsWith(ownRoot)) || EXT_RE.test(r)) &&
    compileSloppyRe(r).test(this.url)
  );
}

/** @this {MatchQuery} */
function urlMatchPattern(pattern) {
  // Convert @match pattern to regex (similar to Tampermonkey)
  // Examples: *://*.example.com/*, *://example.com/*, https://example.com/*

  try {
    const url = new URL(this.url);
    const urlWithoutParams = (this.urlWithoutParams ??= this.url.split(
      /[?#]/,
      1
    )[0]);

    // Parse the pattern
    const match = pattern.match(/^(\*|[\w-]+):\/\/(\*\.)?([\w.-]+\/.*)$/);
    if (!match) {
      // If pattern doesn't match expected format, try exact match
      return urlWithoutParams === pattern;
    }

    const [, protocol, subdomainWildcard, hostAndPath] = match;

    // Check protocol
    if (protocol !== "*" && url.protocol !== protocol + ":") {
      return false;
    }

    // Check hostname
    const hostname = url.hostname;
    if (subdomainWildcard) {
      // Pattern like *.example.com
      const domain = hostAndPath.split("/")[0];
      if (!hostname.endsWith("." + domain) && hostname !== domain) {
        return false;
      }
    } else {
      // Exact hostname match
      const domain = hostAndPath.split("/")[0];
      if (hostname !== domain) {
        return false;
      }
    }

    // Check path
    const pathPattern = hostAndPath.substring(hostAndPath.indexOf("/"));
    if (pathPattern === "/*") {
      return true; // Any path
    } else if (pathPattern.endsWith("/*")) {
      // Prefix match
      const prefix = pathPattern.slice(0, -2);
      return url.pathname.startsWith(prefix);
    } else {
      // Exact path match
      return url.pathname === pathPattern;
    }
  } catch {
    return false;
  }
}
