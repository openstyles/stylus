import * as colorConverter from '@/js/color/color-converter';
import {styleCodeEmpty} from '../sections-util';
import {nullifyInvalidVars} from './meta-parser';
import extractSections from './moz-parser';
import {importScripts, loadParserlib, parserlib} from './util';

let builderChain = Promise.resolve();
let StylusEvaluator, StylusParser, StylusRenderer, less;

const BUILDERS = Object.assign(Object.create(null), {

  default: {
    post(sections, vars) {
      let varDef = Object.keys(vars).map(k => `  --${k}: ${vars[k].value};\n`).join('');
      if (!varDef) return;
      varDef = ':root {\n' + varDef + '}\n';
      for (const section of sections) {
        if (!styleCodeEmpty(section)) {
          spliceCssAfterGlobals(section, varDef, styleCodeEmpty.lastIndex);
        }
      }
    },
  },

  stylus: {
    pre(source, vars) {
      StylusRenderer ??= (importScripts('stylus-lang.js'), global.StylusRenderer);
      if (!StylusParser) {
        const r = new StylusRenderer('');
        r.render();
        StylusEvaluator = r.options.Evaluator;
        StylusParser = r.parser.constructor;
      }
      for (const key in vars) {
        let val = vars[key].value;
        try {
          val = new StylusParser(`(${val})`).parse();
          val = new StylusEvaluator(val).evaluate();
          do val = val.nodes[0]; while (val.nodeName === 'expression' && val.nodes.length);
          vars[key] = val;
        } catch (err) {
          err.message += '\n' + key + ' = ' + val;
          throw err;
        }
      }
      return new Promise((resolve, reject) => {
        new StylusRenderer(source, {globals: vars})
          .render((err, output) => err ? reject(err) : resolve(output));
      });
    },
  },

  less: {
    async pre(source, vars) {
      if (!less) {
        global.document = {currentScript: {}};
        global.window = global;
        global.less = {
          logLevel: 0,
          useFileCache: false,
          onReady: false,
        };
        importScripts('less.js');
        less = global.less;
      }
      const varDefs = {};
      for (const key in vars)
        varDefs['@' + key] = vars[key].value;
      return (await less.render(source, {
        math: 'parens-division',
        modifyVars: varDefs,
      })).css;
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
      return doReplace(source);
    },
  },
});

/**
 * @param {string} preprocessor
 * @param {string} code
 * @param {Object} [vars] - WARNING: each var's `value` will be overwritten
   (not a problem currently as this code runs in a worker so `vars` is just a copy)
 * @returns {Promise<{sections, errors}>}
 */
export default async function compileUsercss(preprocessor, code, vars) {
  let builder = BUILDERS[preprocessor];
  if (!builder) {
    builder = BUILDERS.default;
    if (preprocessor != null) console.warn(`Unknown preprocessor "${preprocessor}"`);
  }
  if (vars) {
    nullifyInvalidVars(vars);
    simplifyUsercssVars(vars);
  } else {
    vars = {};
  }
  const log = [];
  if (builder.pre) {
    // another compileUsercss may(?) become active while this one is awaited so let's chain
    builderChain = builderChain.catch(() => {}).then(async () => {
      const logFn = console.log;
      console.log = (...args) => log.push(args);
      code = await builder.pre(code, vars);
      console.log = logFn;
    });
    await builderChain;
  }
  const res = extractSections({code});
  if (builder.post) {
    builder.post(res.sections, vars);
  }
  if (log.length) {
    res.log = log;
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
