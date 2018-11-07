/* global parserlib */
/* exported parseMozFormat */
'use strict';

/**
 * Extracts @-moz-document blocks into sections and the code between them into global sections.
 * Puts the global comments into the following section to minimize the amount of global sections.
 * Doesn't move the comment with ==UserStyle== inside.
 * @param {string} code
 * @param {number} styleId - used to preserve parserCache on subsequent runs over the same style
 * @returns {{sections: Array, errors: Array}}
 */
function parseMozFormat({code, styleId}) {
  const CssToProperty = {
    'url':        'urls',
    'url-prefix': 'urlPrefixes',
    'domain':     'domains',
    'regexp':     'regexps',
  };
  const hasSingleEscapes = /([^\\]|^)\\([^\\]|$)/;
  const parser = new parserlib.css.Parser();
  const sectionStack = [{code: '', start: 0}];
  const errors = [];
  const sections = [];
  const mozStyle = code;

  parser.addListener('startdocument', e => {
    const lastSection = sectionStack[sectionStack.length - 1];
    let outerText = mozStyle.slice(lastSection.start, e.offset);
    const lastCmt = getLastComment(outerText);
    const section = {
      code: '',
      start: parser._tokenStream._token.offset + 1,
    };
    // move last comment before @-moz-document inside the section
    if (!lastCmt.includes('AGENT_SHEET') &&
        !lastCmt.includes('==') &&
        !/==userstyle==/i.test(lastCmt)) {
      if (lastCmt) {
        section.code = lastCmt + '\n';
        outerText = outerText.slice(0, -lastCmt.length);
      }
      outerText = outerText.match(/^\s*/)[0] + outerText.trim();
    }
    if (outerText.trim()) {
      lastSection.code = outerText;
      doAddSection(lastSection);
      lastSection.code = '';
    }
    for (const {name, expr, uri} of e.functions) {
      const aType = CssToProperty[name.toLowerCase()];
      const p0 = expr && expr.parts[0];
      if (p0 && aType === 'regexps') {
        const s = p0.text;
        if (hasSingleEscapes.test(p0.text)) {
          const isQuoted = (s.startsWith('"') || s.startsWith("'")) && s.endsWith(s[0]);
          p0.value = isQuoted ? s.slice(1, -1) : s;
        }
      }
      (section[aType] = section[aType] || []).push(uri || p0 && p0.value || '');
    }
    sectionStack.push(section);
  });

  parser.addListener('enddocument', e => {
    const section = sectionStack.pop();
    const lastSection = sectionStack[sectionStack.length - 1];
    section.code += mozStyle.slice(section.start, e.offset);
    lastSection.start = e.offset + 1;
    doAddSection(section);
  });

  parser.addListener('endstylesheet', () => {
    // add nonclosed outer sections (either broken or the last global one)
    const lastSection = sectionStack[sectionStack.length - 1];
    lastSection.code += mozStyle.slice(lastSection.start);
    sectionStack.forEach(doAddSection);
  });

  parser.addListener('error', e => {
    errors.push(`${e.line}:${e.col} ${e.message.replace(/ at line \d.+$/, '')}`);
  });

  try {
    parser.parse(mozStyle, {
      reuseCache: !parseMozFormat.styleId || styleId === parseMozFormat.styleId,
    });
  } catch (e) {
    errors.push(e.message);
  }
  parseMozFormat.styleId = styleId;
  return {sections, errors};

  function doAddSection(section) {
    section.code = section.code.trim();
    // don't add empty sections
    if (
      !section.code &&
      !section.urls &&
      !section.urlPrefixes &&
      !section.domains &&
      !section.regexps
    ) {
      return;
    }
    /* ignore boilerplate NS */
    if (section.code === '@namespace url(http://www.w3.org/1999/xhtml);') {
      return;
    }
    sections.push(Object.assign({}, section));
  }

  function getLastComment(text) {
    let open = text.length;
    let close;
    while (open) {
      // at this point we're guaranteed to be outside of a comment
      close = text.lastIndexOf('*/', open - 2);
      if (close < 0) {
        break;
      }
      // stop if a non-whitespace precedes and return what we currently have
      const tailEmpty = !text.substring(close + 2, open).trim();
      if (!tailEmpty) {
        break;
      }
      // find a closed preceding comment
      const prevClose = text.lastIndexOf('*/', close - 2);
      // then find the real start of current comment
      // e.g. /* preceding */  /* current /* current /* current */
      open = text.indexOf('/*', prevClose < 0 ? 0 : prevClose + 2);
    }
    return open ? text.slice(open) : text;
  }
}
