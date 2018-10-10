/* exported objectDiff */
'use strict';

function objectDiff(first, second, path = '') {
  const diff = [];
  for (const key in first) {
    const a = first[key];
    const b = second[key];
    if (a === b) {
      continue;
    }
    if (b === undefined) {
      diff.push({path, key, values: [a], type: 'removed'});
      continue;
    }
    if (a && typeof a.filter === 'function' && b && typeof b.filter === 'function') {
      if (
        a.length !== b.length ||
        a.some((el, i) => {
          const result = !el || typeof el !== 'object'
            ? el !== b[i]
            : objectDiff(el, b[i], path + key + '[' + i + '].').length;
          return result;
        })
      ) {
        diff.push({path, key, values: [a, b], type: 'changed'});
      }
    } else if (typeof a === 'object' && typeof b === 'object') {
      diff.push(...objectDiff(a, b, path + key + '.'));
    } else {
      diff.push({path, key, values: [a, b], type: 'changed'});
    }
  }
  for (const key in second) {
    if (!(key in first)) {
      diff.push({path, key, values: [second[key]], type: 'added'});
    }
  }
  return diff;
}
