'use strict';

define(require => {
  const exports = {

    async calcStyleDigest(style) {
      const src = style.usercssData
        ? style.sourceCode
        : JSON.stringify(normalizeStyleSections(style));
      const srcBytes = new TextEncoder().encode(src);
      const res = await crypto.subtle.digest('SHA-1', srcBytes);
      return Array.from(new Uint8Array(res), byte2hex).join('');
    },

    styleCodeEmpty(code) {
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
    },

    styleJSONseemsValid(json) {
      return json
        && typeof json.name == 'string'
        && json.name.trim()
        && Array.isArray(json.sections)
        && typeof (json.sections[0] || {}).code === 'string';
    },

    /**
     * Checks if section is global i.e. has no targets at all
     */
    styleSectionGlobal(section) {
      return (!section.regexps || !section.regexps.length) &&
        (!section.urlPrefixes || !section.urlPrefixes.length) &&
        (!section.urls || !section.urls.length) &&
        (!section.domains || !section.domains.length);
    },

    /**
     * The sections are checked in successive order because it matters when many sections
     * match the same URL and they have rules with the same CSS specificity
     * @param {Object} a - first style object
     * @param {Object} b - second style object
     * @returns {?boolean}
     */
    styleSectionsEqual({sections: a}, {sections: b}) {
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
    },
  };

  function byte2hex(b) {
    return (0x100 + b).toString(16).slice(1);
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

  return exports;
});
