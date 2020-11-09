/* exported styleSectionsEqual styleCodeEmpty styleSectionGlobal calcStyleDigest styleJSONseemsValid */
'use strict';

function styleCodeEmpty(code) {
  if (!code) {
    return true;
  }
  const rx = /\s+|\/\*[\s\S]*?\*\/|@namespace[^;]+;|@charset[^;]+;/giy;
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

function normalizeStyleSections({sections}) {
  // retain known properties in an arbitrarily predefined order
  return (sections || []).map(section => /** @namespace StyleSection */({
    code: section.code || '',
    urls: section.urls || [],
    urlPrefixes: section.urlPrefixes || [],
    domains: section.domains || [],
    regexps: section.regexps || [],
  }));
}

function calcStyleDigest(style) {
  const jsonString = style.usercssData ?
    style.sourceCode : JSON.stringify(normalizeStyleSections(style));
  const text = new TextEncoder('utf-8').encode(jsonString);
  return crypto.subtle.digest('SHA-1', text).then(hex);

  function hex(buffer) {
    const parts = [];
    const PAD8 = '00000000';
    const view = new DataView(buffer);
    for (let i = 0; i < view.byteLength; i += 4) {
      parts.push((PAD8 + view.getUint32(i).toString(16)).slice(-8));
    }
    return parts.join('');
  }
}

function styleJSONseemsValid(json) {
  return json
    && json.name
    && json.name.trim()
    && Array.isArray(json.sections)
    && json.sections
    && json.sections.length
    && typeof json.sections.every === 'function'
    && typeof json.sections[0].code === 'string';
}
