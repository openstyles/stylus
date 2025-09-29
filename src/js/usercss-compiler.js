import {styleCodeEmpty} from './sections-util';
import {importScriptsOnce} from './worker-util';

let builderChain = Promise.resolve();

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
      importScriptsOnce('stylus-lang.js'); /* global StylusRenderer */
      return new Promise((resolve, reject) => {
        const varDef = Object.keys(vars).map(key => `${key} = ${vars[key].value};\n`).join('');
        new StylusRenderer(varDef + source)
          .render((err, output) => err ? reject(countVarLines(err, varDef)) : resolve(output));
      });
    },
  },

  less: {
    async pre(source, vars) {
      if (!self.less) {
        self.document = {currentScript: {}};
        self.window = self;
        self.less = {
          logLevel: 0,
          useFileCache: false,
          onReady: false,
        };
      }
      importScriptsOnce('less.js'); /* global less */
      const varDefs = Object.keys(vars).map(key => `@${key}:${vars[key].value};\n`).join('');
      try {
        return (await less.render(varDefs + source, {math: 'parens-division'})).css;
      } catch (err) {
        throw countVarLines(err, varDefs);
      }
    },
  },

  uso: {
    pre(source, vars) {
      importScriptsOnce('color-converter.js'); /* global colorConverter */
      const pool = Object.create(null);
      return doReplace(source);

      function doReplace(text) {
        return text.replace(/(\/\*\[\[([\w-]+)]]\*\/)([0-9a-f]{2}(?=\W))?/gi, (_, cmt, name, alpha) => {
          const key = alpha ? name + '[A]' : name;
          let val = pool[key];
          if (val === undefined) {
            val = pool[key] = getValue(name, null, alpha);
          }
          return (val != null ? val : cmt) + (alpha || '');
        });
      }

      function getValue(name, isUsoRgb, alpha) {
        const v = vars[name];
        if (!v) {
          return name.endsWith('-rgb')
            ? getValue(name.slice(0, -4), true)
            : null;
        }
        let {value} = v;
        switch (v.type) {
          case 'color':
            value = colorConverter.parse(value) || null;
            if (value) {
              /* #rrggbb - inline alpha is present; an opaque hsl/a; #rrggbb originally
               * rgba(r, g, b, a) - transparency <1 is present (Chrome pre-66 compatibility)
               * rgb(r, g, b) - if color is rgb/a with a=1, note: r/g/b will be rounded
               * r, g, b - if the var has `-rgb` suffix per USO specification
               * TODO: when minimum_chrome_version >= 66 try to keep `value` intact */
              if (alpha) delete value.a;
              const isRgb = isUsoRgb || value.type === 'rgb' || value.a != null && value.a !== 1;
              const usoMode = isUsoRgb || !isRgb;
              value = colorConverter.format(value, isRgb ? 'rgb' : 'hex', {usoMode});
            }
            return value;
          case 'dropdown':
          case 'select':
            pool[name] = ''; // prevent infinite recursion
            return doReplace(value);
        }
        return value;
      }
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
  importScriptsOnce('moz-parser.js', 'parserlib.js'); /* global extractSections */
  const res = extractSections({code});

  // Process @match directives from metadata
  if (vars && vars._usercssData && vars._usercssData.match) {
    // Convert @match patterns to @-moz-document sections
    for (const section of res.sections) {
      if (!section.matches) {
        section.matches = [];
      }
    }

    // If no sections exist, create a global one
    if (res.sections.length === 0) {
      res.sections.push({
        code: '',
        matches: vars._usercssData.match,
      });
    } else {
      // Add @match patterns to the first section
      res.sections[0].matches = vars._usercssData.match;
    }
  }

  if (builder.post) {
    builder.post(res.sections, vars);
  }
  if (log.length) {
    res.log = log;
  }
  return res;
}

function countVarLines(err, str) {
  // var's value may include \n inside
  err._varLines = str.match(/^/gm).length;
  return err;
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
    importScriptsOnce('parserlib.js'); /* global parserlib */
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
