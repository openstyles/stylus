import {FROM_CSS} from '../style-util';
import {RX_META} from '../util';
import {loadParserlib, parserlib} from './util';

/**
 * Extracts @-moz-document blocks into sections and the code between them into global sections.
 * Puts the global comments into the following section to minimize the amount of global sections.
 * Doesn't move the comment with ==UserStyle== inside.
 * @param {string} code
 * @param {number} [styleId] - to reuse parserCache on re-runs
 * @param {string} [metaStr]
 * @param {boolean} [strict] throw on parsing error
 * @returns {StyleSection[]}
 */
export default function extractSections(code, styleId, metaStr, strict) {
  if (!parserlib) loadParserlib();
  const hasSingleEscapes = /([^\\]|^)\\([^\\]|$)/;
  const opts = {
    noValidation: true,
    starHack: true,
    styleId,
  };
  const parser = new parserlib.css.Parser(opts);
  const sectionStack = [{code: '', start: 0}];
  const sections = [];
  let parseError;

  parser.addListener('startstylesheet', () => {
    code = parser.stream.source.string; // in case it's changed due to normalization
  });

  parser.addListener('startdocument', e => {
    const lastSection = sectionStack[sectionStack.length - 1];
    const lastCmt = e.start.comment?.text || '';
    const section = {
      code: '',
      start: e.brace.offset + 1,
    };
    let outerText = code.slice(lastSection.start, e.offset);
    // move last comment before @-moz-document inside the section
    if (lastCmt && (
      !(metaStr ??= code.match(RX_META)?.[0] || '') ||
      !lastCmt.includes(metaStr)
    )) {
      section.code = lastCmt + '\n';
      outerText = outerText.slice(0, -lastCmt.length);
    }
    outerText = outerText.replace(metaStr ??= code.match(RX_META)?.[0] || '', '').trim();
    if (outerText) {
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
    section.code += code.slice(section.start, e.offset);
    lastSection.start = e.offset + 1;
    doAddSection(section);
  });

  parser.addListener('endstylesheet', () => {
    // add nonclosed outer sections (either broken or the last global one)
    const lastSection = sectionStack[sectionStack.length - 1];
    lastSection.code += code.slice(lastSection.start);
    sectionStack.forEach(doAddSection);
  });

  parser.addListener('error', e => {
    if (parseError)
      return;
    const min = 5; // characters to show
    const max = 100;
    const i = e.offset;
    const a = Math.max(code.lastIndexOf('\n', i - min) + 1, i - max);
    const b = Math.min(code.indexOf('\n', i - a > min ? i : i + min) + 1 || 1e9, i + max);
    e.context = code.slice(a, b).trim();
    if (strict && (!e.recoverable || e.name === 'ParseError')) {
      parser.stream.source.offset = 1e9;
      parseError ||= e;
    }
  });

  try {
    parser.parse(code, {reuseCache: JSON.stringify(opts)});
  } catch (e) {
    parseError ||= e;
  }
  if (parseError) {
    for (const k in parseError)
      if (typeof parseError[k] === 'object')
        delete parseError[k];
    parseError.message = `${parseError.line}:${parseError.col} ${parseError.message}`;
    throw parseError;
  }

  return sections;

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
