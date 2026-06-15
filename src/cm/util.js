import {mimeLESS} from '@/js/consts';

export const kLineComment = 'lineComment';
/** https://drafts.csswg.org/css-syntax-3/#non-ascii-ident-code-point
 * The leading character was already checked */
export const rxUniBody = /[-\\\w\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{10FFFF}]*/yu;

export const getPreprocessorMode = ({preprocessor: pp}) =>
  pp === 'less' ? mimeLESS
    : pp === 'stylus' ? pp
      : 'css';

export const getStyleAtPos = (styles, ch, pickOne) => {
  if (!styles) return;
  const len = styles.length;
  const end = styles[len - 2];
  if (ch > end) return;
  if (ch === end) {
    return pickOne === 0 ? styles[len - 1]
      : pickOne === 1 ? len - 2
        : [styles[len - 1], len - 2];
  }
  const mid = (ch / end * (len - 1) & ~1) + 1;
  let a = mid;
  let b;
  while (a > 1 && styles[a] > ch) {
    b = a;
    a = (a / 2 & ~1) + 1;
  }
  if (!b) b = mid;
  while (b < len && styles[b] < ch) b = ((len + b) / 2 & ~1) + 1;
  while (a < b - 3) {
    const c = ((a + b) / 2 & ~1) + 1;
    if (styles[c] > ch) b = c; else a = c;
  }
  while (a < len && styles[a] < ch) a += 2;
  return pickOne === 0 ? styles[a + 1]
    : pickOne === 1 ? a
      : [styles[a + 1], a];
};
