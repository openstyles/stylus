import {FROM_CSS} from './sections-util';
import {RX_META} from './util';
/* global parserlib */

/**
 * Extracts @-moz-document blocks into sections and the code between them into global sections.
 * Puts the global comments into the following section to minimize the amount of global sections.
 * Doesn't move the comment with ==UserStyle== inside.
 * @param {Object} _
 * @param {string} _.code
 * @param {boolean} [_.fast] - uses topDocOnly option to extract sections as text
 * @param {number} [_.styleId] - used to preserve parserCache on subsequent runs over the same style
 * @returns {{sections: Array, errors: Array}}
 * @property {?number} lastStyleId
 */
export default function extractSections({code, styleId, fast = true}) {
  const commentsAtEnd = /(\/\*(?:[^*]+|\*(?!\/))*\*\/\s*)*$/;
  const hasSingleEscapes = /([^\\]|^)\\([^\\]|$)/;
  const parser = new parserlib.css.Parser({
    noValidation: true,
    starHack: true,
    topDocOnly: fast,
  });
  const sectionStack = [{code: '', start: 0}];
  const errors = [];
  const sections = [];
  let mozStyle;

  parser.addListener('startstylesheet', () => {
    mozStyle = parser.stream.source.string;
  });

  parser.addListener('startdocument', e => {
    const lastSection = sectionStack[sectionStack.length - 1];
    let outerText = mozStyle.slice(lastSection.start, e.offset);
    const lastCmt = outerText.match(commentsAtEnd)[0];
    const section = {
      code: '',
      start: e.brace.offset + 1,
    };
    // move last comment before @-moz-document inside the section
    if (!lastCmt.includes('AGENT_SHEET') &&
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
    for (const fn of e.functions) {
      const {name, expr} = fn;
      const aType = FROM_CSS[name.toLowerCase()];
      const p0 = expr && expr.parts[0];
      const {uri: val = (
        p0 && aType === 'regexps' && hasSingleEscapes.test(p0.text)
          ? p0.text.slice(1, -1)
          : p0.string
      )} = fn;
      (section[aType] = section[aType] || []).push(val || '');
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
    errors.push(e);
    const min = 5; // characters to show
    const max = 100;
    const i = e.offset;
    const a = Math.max(mozStyle.lastIndexOf('\n', i - min) + 1, i - max);
    const b = Math.min(mozStyle.indexOf('\n', i - a > min ? i : i + min) + 1 || 1e9, i + max);
    e.context = mozStyle.slice(a, b).trim();
  });

  try {
    parser.parse(code.replace(RX_META, ''), {
      reuseCache: !extractSections.lastStyleId || styleId === extractSections.lastStyleId,
    });
  } catch (e) {
    errors.push(e);
  }
  for (const err of errors) {
    for (const [k, v] of Object.entries(err)) {
      if (typeof v === 'object') delete err[k];
    }
    err.message = `${err.line}:${err.col} ${err.message}`;
  }
  extractSections.lastStyleId = styleId;

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
}
