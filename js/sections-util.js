'use strict';

/* exported
  calcStyleDigest
  MozDocMapper
  styleCodeEmpty
  styleJSONseemsValid
  styleSectionGlobal
  styleSectionsEqual
*/

const MozDocMapper = {
  TO_CSS: {
    urls: 'url',
    urlPrefixes: 'url-prefix',
    domains: 'domain',
    regexps: 'regexp',
  },
  FROM_CSS: {
    'url': 'urls',
    'url-prefix': 'urlPrefixes',
    'domain': 'domains',
    'regexp': 'regexps',
  },
  /**
   * @param {Object} section
   * @param {function(func:string, value:string)} fn
   */
  forEachProp(section, fn) {
    for (const [propName, func] of Object.entries(MozDocMapper.TO_CSS)) {
      const props = section[propName];
      if (props) props.forEach(value => fn(func, value));
    }
  },
  /**
   * @param {Array<?[type,value]>} funcItems
   * @param {?Object} [section]
   * @returns {Object} section
   */
  toSection(funcItems, section = {}) {
    for (const item of funcItems) {
      const [func, value] = item || [];
      const propName = MozDocMapper.FROM_CSS[func];
      if (propName) {
        const props = section[propName] || (section[propName] = []);
        if (Array.isArray(value)) props.push(...value);
        else props.push(value);
      }
    }
    return section;
  },
  /**
   * @param {StyleObj} style
   * @returns {string}
   */
  styleToCss(style) {
    const res = [];
    for (const section of style.sections) {
      const funcs = [];
      MozDocMapper.forEachProp(section, (type, value) =>
        funcs.push(`${type}("${value.replace(/[\\"]/g, '\\$&')}")`));
      res.push(funcs.length
        ? `@-moz-document ${funcs.join(', ')} {\n${section.code}\n}`
        : section.code);
    }
    return res.join('\n\n');
  },
};

function styleCodeEmpty(code) {
  if (!code) {
    return true;
  }
  const rx = /\s+|\/\*([^*]|\*(?!\/))*(\*\/|$)|@namespace[^;]+;|@charset[^;]+;/giyu;
  while (rx.exec(code)) {
    if (rx.lastIndex === code.length) {
      return true;
    }
  }
  return false;
}

/** Checks if section is global i.e. has no targets at all */
function styleSectionGlobal(section) {
  return (!section.regexps || !section.regexps.length) &&
    (!section.urlPrefixes || !section.urlPrefixes.length) &&
    (!section.urls || !section.urls.length) &&
    (!section.domains || !section.domains.length);
}

/**
 * The sections are checked in successive order because it matters when many sections
 * match the same URL and they have rules with the same CSS specificity
 * @param {Object} a - first style object
 * @param {Object} b - second style object
 * @returns {?boolean}
 */
function styleSectionsEqual({sections: a}, {sections: b}) {
  const targets = ['urls', 'urlPrefixes', 'domains', 'regexps'];
  return a && b && a.length === b.length && a.every(sameSection);
  function sameSection(secA, i) {
    return equalOrEmpty(secA.code, b[i].code, 'string', (a, b) => a === b) &&
      targets.every(target => equalOrEmpty(secA[target], b[i][target], 'array', arrayMirrors));
  }
  function equalOrEmpty(a, b, type, comparator) {
    const typeA = type === 'array' ? Array.isArray(a) : typeof a === type;
    const typeB = type === 'array' ? Array.isArray(b) : typeof b === type;
    return typeA && typeB && comparator(a, b) ||
      (a == null || typeA && !a.length) &&
      (b == null || typeB && !b.length);
  }
  function arrayMirrors(a, b) {
    return a.length === b.length &&
      a.every(el => b.includes(el)) &&
      b.every(el => a.includes(el));
  }
}

async function calcStyleDigest(style) {
  // retain known properties in an arbitrarily predefined order
  const src = style.usercssData
    ? style.sourceCode
    // retain known properties in an arbitrarily predefined order
    : JSON.stringify((style.sections || []).map(section => /** @namespace StyleSection */({
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

function styleJSONseemsValid(json) {
  return json
    && typeof json.name == 'string'
    && json.name.trim()
    && Array.isArray(json.sections)
    && typeof (json.sections[0] || {}).code === 'string';
}
