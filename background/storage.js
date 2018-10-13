/* exported calcStyleDigest detectSloppyRegexps */
'use strict';

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
