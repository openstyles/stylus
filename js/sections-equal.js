'use strict';

function styleSectionsEqual({sections: a}, {sections: b}) {
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
    return equalOrEmpty(secA.code, secB.code, 'substr', (a, b) => a === b);
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
