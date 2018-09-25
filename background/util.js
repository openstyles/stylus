'use strict';

const RX_NAMESPACE = /\s*(@namespace\s+(?:\S+\s+)?url\(http:\/\/.*?\);)\s*/g;
const RX_CHARSET = /\s*@charset\s+(['"]).*?\1\s*;\s*/g;
const RX_CSS_COMMENTS = /\/\*[\s\S]*?(?:\*\/|$)/g;

function styleCodeEmpty(code) {
  // Collect the global section if it's not empty, not comment-only, not namespace-only.
  const cmtOpen = code && code.indexOf('/*');
  if (cmtOpen >= 0) {
    const cmtCloseLast = code.lastIndexOf('*/');
    if (cmtCloseLast < 0) {
      code = code.substr(0, cmtOpen);
    } else {
      code = code.substr(0, cmtOpen) +
        code.substring(cmtOpen, cmtCloseLast + 2).replace(RX_CSS_COMMENTS, '') +
        code.substr(cmtCloseLast + 2);
    }
  }
  if (!code || !code.trim()) return true;
  if (code.includes('@namespace')) code = code.replace(RX_NAMESPACE, '').trim();
  if (code.includes('@charset')) code = code.replace(RX_CHARSET, '').trim();
  return !code;
}
