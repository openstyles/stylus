/* global parserlib, loadScript */

'use strict';

// eslint-disable-next-line no-var
var mozParser = (function () {
  // direct & reverse mapping of @-moz-document keywords and internal property names
  const propertyToCss = {urls: 'url', urlPrefixes: 'url-prefix', domains: 'domain', regexps: 'regexp'};
  const CssToProperty = {'url': 'urls', 'url-prefix': 'urlPrefixes', 'domain': 'domains', 'regexp': 'regexps'};

  function backtrackTo(parser, tokenType, startEnd) {
    const tokens = parser._tokenStream._lt;
    for (let i = parser._tokenStream._ltIndex - 1; i >= 0; --i) {
      if (tokens[i].type === tokenType) {
        return {line: tokens[i][startEnd + 'Line'], col: tokens[i][startEnd + 'Col']};
      }
    }
  }

  function trimNewLines(s) {
    return s.replace(/^[\s\n]+/, '').replace(/[\s\n]+$/, '');
  }

  function parseMozFormat(mozStyle) {
    return new Promise((resolve, reject) => {
      const parser = new parserlib.css.Parser();
      const lines = mozStyle.split('\n');
      const sectionStack = [{code: '', start: {line: 1, col: 1}}];
      const errors = [];
      const sections = [];

      parser.addListener('startdocument', function (e) {
        const lastSection = sectionStack[sectionStack.length - 1];
        let outerText = getRange(lastSection.start, (--e.col, e));
        const gapComment = outerText.match(/(\/\*[\s\S]*?\*\/)[\s\n]*$/);
        const section = {code: '', start: backtrackTo(this, parserlib.css.Tokens.LBRACE, 'end')};
        // move last comment before @-moz-document inside the section
        if (gapComment && !gapComment[1].match(/\/\*\s*AGENT_SHEET\s*\*\//)) {
          section.code = gapComment[1] + '\n';
          outerText = trimNewLines(outerText.substring(0, gapComment.index));
        }
        if (outerText.trim()) {
          lastSection.code = outerText;
          doAddSection(lastSection);
          lastSection.code = '';
        }
        for (const f of e.functions) {
          const m = f && f.match(/^([\w-]*)\((['"]?)(.+?)\2?\)$/);
          if (!m || !/^(url|url-prefix|domain|regexp)$/.test(m[1])) {
            errors.push(`${e.line}:${e.col + 1} invalid function "${m ? m[1] : f || ''}"`);
            continue;
          }
          const aType = CssToProperty[m[1]];
          const aValue = aType !== 'regexps' ? m[3] : m[3].replace(/\\\\/g, '\\');
          (section[aType] = section[aType] || []).push(aValue);
        }
        sectionStack.push(section);
      });

      parser.addListener('enddocument', function () {
        const end = backtrackTo(this, parserlib.css.Tokens.RBRACE, 'start');
        const section = sectionStack.pop();
        const lastSection = sectionStack[sectionStack.length - 1];
        section.code += getRange(section.start, end);
        lastSection.start = (++end.col, end);
        doAddSection(section);
      });

      parser.addListener('endstylesheet', () => {
        // add nonclosed outer sections (either broken or the last global one)
        const lastLine = lines[lines.length - 1];
        const endOfText = {line: lines.length, col: lastLine.length + 1};
        const lastSection = sectionStack[sectionStack.length - 1];
        lastSection.code += getRange(lastSection.start, endOfText);
        sectionStack.forEach(doAddSection);

        if (errors.length) {
          reject(errors);
        } else {
          resolve(sections);
        }
      });

      parser.addListener('error', e => {
        errors.push(e.line + ':' + e.col + ' ' +
          e.message.replace(/ at line \d.+$/, ''));
      });

      parser.parse(mozStyle);

      function getRange(start, end) {
        const L1 = start.line - 1;
        const C1 = start.col - 1;
        const L2 = end.line - 1;
        const C2 = end.col - 1;
        if (L1 === L2) {
          return lines[L1].substr(C1, C2 - C1 + 1);
        } else {
          const middle = lines.slice(L1 + 1, L2).join('\n');
          return lines[L1].substr(C1) + '\n' + middle +
            (L2 >= lines.length ? '' : ((middle ? '\n' : '') + lines[L2].substring(0, C2)));
        }
      }

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
    });
  }

  return {
    // Parse mozilla-format userstyle into sections
    parse(text) {
      if (typeof parserlib === 'undefined') {
        return loadScript('vendor-overwrites/csslint/csslint-worker.js')
          .then(() => parseMozFormat(text));
      }
      return parseMozFormat(text);
    },
    format(style) {
      return style.sections.map(section => {
        let cssMds = [];
        for (const i in propertyToCss) {
          if (section[i]) {
            cssMds = cssMds.concat(section[i].map(v =>
              propertyToCss[i] + '("' + v.replace(/\\/g, '\\\\') + '")'
            ));
          }
        }
        return cssMds.length ? '@-moz-document ' + cssMds.join(', ') + ' {\n' + section.code + '\n}' : section.code;
      }).join('\n\n');
    }
  };
})();
