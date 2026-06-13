import * as colorConverter from '@/js/color/color-converter';
import {styleCodeEmpty} from '../sections-util';
import {nullifyInvalidVars} from './meta-parser';
import extractSections from './moz-parser';
import {less, loadLess, loadParserlib, loadStylusLang, parserlib, stylusLang} from './util';

let builderChain = Promise.resolve();

const addRootVars = (sections, vars) => {
  vars = `:root {\n${
    Object.keys(vars).map(k =>
      `  --${k}: ${vars[k].value};\n`
    ).join('')
  }}\n`;
  for (const section of sections) {
    if (!styleCodeEmpty(section)) {
      spliceCssAfterGlobals(section, vars, styleCodeEmpty.lastIndex);
    }
  }
};
const DEFAULT_BUILDER = {
  post: addRootVars,
};
const BUILDERS = {
  __proto__: null,

  default: DEFAULT_BUILDER,

  stylus: {
    log: true,
    pre(source, vars, log, warn) {
      if (!stylusLang)
        loadStylusLang();
      if (vars) for (const key in vars) {
        let val = vars[key].value;
        try {
          val = new stylusLang.Parser(`(${val})`).parse();
          val = new stylusLang.Evaluator(val).evaluate();
          do val = val.nodes[0]; while (val.nodeName === 'expression' && val.nodes.length);
          vars[key] = val;
        } catch (err) {
          err.message += '\n' + key + ' = ' + val;
          throw err;
        }
      }
      return stylusLang(source, {
        globals: vars,
        functions: {
          p: node => log.push(node.val || node) && stylusLang.nodes.null,
          warn: node => warn.push(node.val || node) && stylusLang.nodes.null,
        },
      }).render();
    },
  },

  less: {
    async pre(source, vars) {
      let varDefs;
      if (vars) {
        varDefs = {};
        for (const key in vars)
          varDefs['@' + key] = vars[key].value;
      }
      const res = await (less || loadLess()).render(source, {
        math: 'parens-division',
        modifyVars: varDefs,
      });
      return res.css;
    },
  },

  uso: {
    pre(source, vars) {
      const pool = Object.create(null);
      const reCmt = /\/\*\[\[([\w-]+)]]\*\/([0-9a-f]{2}(?=\W)|)/gi;
      const doReplace = text => text.replace(reCmt, (s, name, hexAlpha) => {
        const key = hexAlpha ? name + '[A]' : name;
        const val = key in pool ? pool[key] : pool[key] = getValue(name, hexAlpha);
        return val ?? s;
      });
      const getValue = (name, hexAlpha) => {
        let rgb;
        let v = vars[name] || (rgb = name.endsWith('-rgb')) && vars[name.slice(0, -4)];
        let {type, value} = v || {};
        if (type === 'dropdown' || type === 'select') {
          pool[name] = ''; // prevent infinite recursion
          value = doReplace(value);
        } else if (type === 'color' && (hexAlpha || rgb) && (v = colorConverter.parse(value))) {
          if (hexAlpha) v.a = 1;
          value = colorConverter.format(v, rgb ? 'rgb' : 'hex', {uso: hexAlpha || rgb}) + hexAlpha;
        }
        return value;
      };
      return vars ? doReplace(source) : source;
    },
  },
};

/**
 * @param {string} preprocessor
 * @param {string} code
 * @param {Object} [vars] - WARNING: each var's `value` will be overwritten
   (not a problem currently as this code runs in a worker so `vars` is just a copy)
 * @returns {Promise<{sections, errors}>}
 */
export default async function compileUsercss(preprocessor, code, vars) {
  const builder = BUILDERS[preprocessor] || (
    preprocessor == null || console.warn(`Unknown preprocessor "${preprocessor}"`),
    DEFAULT_BUILDER
  );
  if (vars) {
    nullifyInvalidVars(vars);
    simplifyUsercssVars(vars);
  }
  const {pre} = builder;
  const log = builder.log && [];
  const warn = log && [];
  if (pre) {
    // another compileUsercss may(?) become active while this one is awaited so let's chain
    builderChain = builderChain.catch(() => {}).then(async () => {
      code = await pre(code, vars, log, warn);
    });
    await builderChain;
  }
  const res = extractSections({code});
  if (builder === DEFAULT_BUILDER && vars)
    addRootVars(res.sections, vars);
  if (log) {
    res.log = log;
    res.warn = warn;
  }
  return res;
}

/**
 * Adds units and sets `null` values to their defaults
 * WARNING: the old value is overwritten
 */
function simplifyUsercssVars(vars) {
  for (const va of Object.values(vars)) {
    let value = va.value != null ? va.value : va.default;
    switch (va.type) {
      case 'select':
      case 'dropdown':
      case 'image':
        // TODO: handle customized image
        for (const opt of va.options) {
          if (opt.name === value) {
            value = opt.value;
            break;
          }
        }
        break;
      case 'number':
      case 'range':
        value += va.units || '';
        break;
    }
    va.value = value;
  }
}

function spliceCssAfterGlobals(section, newText, after) {
  const {code} = section;
  const rx = /@import\s/gi;
  if ((rx.lastIndex = after, rx.test(code))) {
    if (!parserlib) loadParserlib();
    const P = new parserlib.css.Parser({globalsOnly: true}); P.parse(code);
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
