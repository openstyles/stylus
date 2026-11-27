export const kLineComment = 'lineComment';
/** https://drafts.csswg.org/css-syntax-3/#non-ascii-ident-code-point
 * The leading character was already checked */
export const rxUniBody = /[-\\\w\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{10FFFF}]*/yu;
