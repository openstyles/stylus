import {styleCodeEmpty} from '@/js/style-util';
import {loadParserlib, parserlib} from './util';

export default function spliceCssVars(sections, vars) {
  vars = `:root {\n${
    Object.keys(vars).map(k =>
      `  --${k}: ${vars[k].value};\n`,
    ).join('')
  }}\n`;
  for (const section of sections) {
    if (!styleCodeEmpty(section)) {
      spliceCssAfterGlobals(section, vars, styleCodeEmpty.lastIndex);
    }
  }
}

function spliceCssAfterGlobals(section, newText, after) {
  const {code} = section;
  const rx = /@import\s/gi;
  if ((rx.lastIndex = after, rx.test(code))) {
    if (!parserlib) loadParserlib();
    const P = new parserlib.css.Parser({globalsOnly: true});
    P.parse(code);
    const {col, line, offset} = P.stream.token || P.stream.peekCached();
    // normalizing newlines in non-usercss to match line:col from parserlib
    if ((code.indexOf('\r') + 1 || 1e99) - 1 < offset) {
      after = col + code.split('\n', line).reduce((len, s) => len + s.length + 1, 0);
    } else {
      after = offset + 1;
    }
  }
  section.code = (after ? code.slice(0, after) + '\n' : '') + newText + code.slice(after);
}
