'use strict';

/**
 Copied from https://github.com/violentmonkey/violentmonkey/blob/master/src/common/util.js
 and switched to Math.sign
 */

/* exported compareVersion */

const VERSION_RE = /^(.*?)-([-.0-9a-z]+)|$/i;
const DIGITS_RE = /^\d+$/; // using regexp to avoid +'1e2' being parsed as 100

/** @return -1 | 0 | 1 */
function compareVersion(ver1, ver2) {
  const [, main1 = ver1 || '', pre1] = VERSION_RE.exec(ver1);
  const [, main2 = ver2 || '', pre2] = VERSION_RE.exec(ver2);
  const delta = compareVersionChunk(main1, main2)
    || !pre1 - !pre2 // 1.2.3-pre-release is less than 1.2.3
    || pre1 && compareVersionChunk(pre1, pre2, true); // if pre1 is present, pre2 is too
  return Math.sign(delta);
}

function compareVersionChunk(ver1, ver2, isSemverMode) {
  const parts1 = ver1.split('.');
  const parts2 = ver2.split('.');
  const len1 = parts1.length;
  const len2 = parts2.length;
  const len = (isSemverMode ? Math.min : Math.max)(len1, len2);
  let delta;
  for (let i = 0; !delta && i < len; i += 1) {
    const a = parts1[i];
    const b = parts2[i];
    if (isSemverMode) {
      delta = DIGITS_RE.test(a) && DIGITS_RE.test(b)
        ? a - b
        : a > b || a < b && -1;
    } else {
      delta = (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
    }
  }
  return delta || isSemverMode && (len1 - len2);
}
