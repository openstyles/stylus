/* exported styleSectionsEqual styleCodeEmpty calcStyleDigest styleJSONseemsValid */
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

/**
 * @param {Style} a - first style object
 * @param {Style} b - second style object
 * @param {Object} options
 * @param {Boolean=} options.ignoreCode -
 *        true used by invalidateCache to determine if cached filters should be cleared
 * @param {Boolean=} options.checkSource -
 *        true used by update check to compare the server response
 *        instead of sections that depend on @preprocessor
 * @returns {Boolean|undefined}
 */
function styleSectionsEqual(a, b, {ignoreCode, checkSource} = {}) {
  if (checkSource &&
      typeof a.sourceCode === 'string' &&
      typeof b.sourceCode === 'string') {
    return a.sourceCode === b.sourceCode;
  }
  a = a.sections;
  b = b.sections;
  if (!a || !b) {
    return undefined;
  }
  if (a.length !== b.length) {
    return false;
  }
  // order of sections should be identical to account for the case of multiple
  // sections matching the same URL because the order of rules is part of cascading
  return a.every((sectionA, index) => propertiesEqual(sectionA, b[index]));

  function propertiesEqual(secA, secB) {
    for (const name of ['urlPrefixes', 'urls', 'domains', 'regexps']) {
      if (!equalOrEmpty(secA[name], secB[name], 'every', arrayMirrors)) {
        return false;
      }
    }
    return ignoreCode || equalOrEmpty(secA.code, secB.code, 'substr', (a, b) => a === b);
  }

  function equalOrEmpty(a, b, telltale, comparator) {
    const typeA = a && typeof a[telltale] === 'function';
    const typeB = b && typeof b[telltale] === 'function';
    return (
      (a === null || a === undefined || (typeA && !a.length)) &&
      (b === null || b === undefined || (typeB && !b.length))
    ) || typeA && typeB && a.length === b.length && comparator(a, b);
  }

  function arrayMirrors(array1, array2) {
    return (
      array1.every(el => array2.includes(el)) &&
      array2.every(el => array1.includes(el))
    );
  }
}

function normalizeStyleSections({sections}) {
  // retain known properties in an arbitrarily predefined order
  return (sections || []).map(section => ({
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
