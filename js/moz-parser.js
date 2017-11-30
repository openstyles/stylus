/* global parserlib, loadScript */
'use strict';

// eslint-disable-next-line no-var
var mozParser = (() => {
  // direct & reverse mapping of @-moz-document keywords and internal property names
  const propertyToCss = {urls: 'url', urlPrefixes: 'url-prefix', domains: 'domain', regexps: 'regexp'};
  const CssToProperty = {'url': 'urls', 'url-prefix': 'urlPrefixes', 'domain': 'domains', 'regexp': 'regexps'};

  function parseMozFormat(mozStyle) {
    return new Promise((resolve, reject) => {
      const parser = new parserlib.css.Parser();
      const lines = mozStyle.split('\n');
      const sectionStack = [{code: '', start: {line: 1, col: 1}}];
      const errors = [];
      const sections = [];

      parser.addListener('startdocument', e => {
        const lastSection = sectionStack[sectionStack.length - 1];
        let outerText = getRange(lastSection.start, {line: e.line, col: e.col - 1});
        const lastCmt = getLastComment(outerText);
        const {endLine: line, endCol: col} = parser._tokenStream._token;
        const section = {code: '', start: {line, col}};
        // move last comment before @-moz-document inside the section
        if (!/\/\*[\s\n]*AGENT_SHEET[\s\n]*\*\//.test(lastCmt)) {
          section.code = lastCmt + '\n';
          const indent = outerText.match(/^\s*/)[0];
          outerText = outerText.slice(0, -lastCmt.length);
          outerText = indent + outerText.trim();
        }
        if (outerText.trim()) {
          lastSection.code = outerText;
          doAddSection(lastSection);
          lastSection.code = '';
        }
        for (const f of e.functions) {
          const m = f && f.match(/^([\w-]*)\((.+?)\)$/);
          if (!m || !/^(url|url-prefix|domain|regexp)$/.test(m[1])) {
            errors.push(`${e.line}:${e.col + 1} invalid function "${m ? m[1] : f || ''}"`);
            continue;
          }
          const aType = CssToProperty[m[1]];
          const aValue = unquote(aType !== 'regexps' ? m[2] : m[2].replace(/\\\\/g, '\\'));
          (section[aType] = section[aType] || []).push(aValue);
        }
        sectionStack.push(section);
      });

      parser.addListener('enddocument', e => {
        const section = sectionStack.pop();
        const lastSection = sectionStack[sectionStack.length - 1];
        const end = {line: e.line, col: e.col - 1};
        section.code += getRange(section.start, end);
        end.col += 2;
        lastSection.start = end;
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

      function unquote(s) {
        const first = s.charAt(0);
        return (first === '"' || first === "'") && s.endsWith(first) ? s.slice(1, -1) : s;
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
          const prevClose = text.lastIndexOf('*/', close);
          // then find the real start of current comment
          // e.g. /* preceding */  /* current /* current /* current */
          open = text.indexOf('/*', prevClose < 0 ? 0 : prevClose + 2);
        }
        return text.substr(open);
      }
    });
  }

  return {
    // Parse mozilla-format userstyle into sections
    parse(text) {
      return Promise.resolve(self.CSSLint || loadScript('/vendor-overwrites/csslint/csslint-worker.js'))
        .then(() => parseMozFormat(text));
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
