import Color from '@/js/color/color-converter';
import {COLOR_HEX, COLOR_RGB} from '@/js/consts';
import {FROM_CSS, styleCodeEmpty} from '../style-util';
import {nullifyInvalidVars} from './meta-parser';
import extractSections from './moz-parser';
import {load, loadParserlib, loadStylusLang, parserlib, stylusLang} from './util';

let builderChain = Promise.resolve();
/** @type {import('less')} */
let less;

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
    pre(source, vars, sections, log, warn) {
      if (!stylusLang)
        loadStylusLang();
      /** Adding to the source text because `globals` needs a Node, but Evaluator fails on url()
       * Using a random separator to clean up leftovers (note that {} is re-formatted by stylus) */
      let sep;
      if (vars) {
        source = Object.entries(vars).map(e => `${e[0]}=${e[1].value};\n`).join('') +
          (sep = '.a' + Math.random().toString(36).slice(2)) + '{x:0}\n' +
          source;
      }
      source = stylusLang(source, {
        /** Copied from postcss-styl to avoid it crashing due to an empty lexer.
         *  TODO: see if this noticeably reduces performance and maybe patch postcss-styl. */
        cache: false,
        functions: {
          p: node => log.push(node.val || node) && stylusLang.nodes.null,
          warn: node => warn.push(node.val || node) && stylusLang.nodes.null,
        },
      }).render();
      if (vars && ~(sep = source.indexOf(sep)))
        source = source.slice(source.indexOf('}', sep) + 2/*}\n*/);
      return source;
    },
  },

  less: {
    async pre(source, vars, sections) {
      let varDefs;
      if (vars) {
        varDefs = {};
        for (const key in vars)
          varDefs['@' + key] = vars[key].value;
      }
      less ||= load('less.js', 'less');
      return new Promise((resolve, reject) => less.render(source, {
        math: 'parens-division',
        modifyVars: varDefs,
        sections,
      }, (err, res, docs) => {
        if (err)
          return reject(err);
        for (let [prelude, code] of docs) {
          const sec = {code};
          let k, v, quote;
          if (prelude && (prelude = Array.isArray(v = prelude.value) ? v : [prelude])) {
            for (const node of prelude) {
              if (typeof (v = node.value) !== 'string'
              && (k = node.name || node.type)
              && (k = FROM_CSS[k.toLowerCase()])
              && (v ||= node.args?.[0])
              && typeof ({quote} = v, v = v.value) === 'string') {
                // TODO: use parserlib.Token.string to decode CSS escapes
                (sec[k] ||= []).push(quote ? v.replace(/\\\\/g, '\\') : v);
              }
            }
          }
          sections.push(sec);
        }
        resolve(res.css);
      }));
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
        } else if (type === 'color' && (hexAlpha || rgb) && (v = Color.parse(value))) {
          if (hexAlpha) v.a = 1;
          value = v.toString(rgb ? COLOR_RGB : COLOR_HEX, {uso: hexAlpha || rgb}) + hexAlpha;
        }
        return value;
      };
      return vars ? doReplace(source) : source;
    },
  },
};

/**
 * @param {string} code
 * @param {string} preprocessor
 * @param {Object} [vars] - WARNING: each var's `value` will be overwritten
   (not a problem currently as this code runs in a worker so `vars` is just a copy)
 * @param {number} [styleId]
 * @returns {Promise<[StyleSection[], string[]?, string[]?]>}
 */
export default async function compileUsercss(code, preprocessor, vars, styleId) {
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
  let sections;
  if (pre && (code = pre(code, vars, sections = [], log, warn)).then) {
    builderChain = builderChain.catch(__.DEBUG ? console.log : () => {}).then(code);
    code = await builderChain;
  }
  sections ||= extractSections(code, styleId);
  if (vars && builder === DEFAULT_BUILDER && sections.length)
    addRootVars(sections[0], vars);
  return [sections, log, warn];
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
