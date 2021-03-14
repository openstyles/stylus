'use strict';

let builderChain = Promise.resolve();

const BUILDERS = Object.assign(Object.create(null), {

  default: {
    post(sections, vars) {
      require(['/js/sections-util']); /* global styleCodeEmpty */
      let varDef = Object.keys(vars).map(k => `  --${k}: ${vars[k].value};\n`).join('');
      if (!varDef) return;
      varDef = ':root {\n' + varDef + '}\n';
      for (const section of sections) {
        if (!styleCodeEmpty(section.code)) {
          section.code = varDef + section.code;
        }
      }
    },
  },

  stylus: {
    pre(source, vars) {
      require(['/vendor/stylus-lang-bundle/stylus-renderer.min']); /* global StylusRenderer */
      return new Promise((resolve, reject) => {
        const varDef = Object.keys(vars).map(key => `${key} = ${vars[key].value};\n`).join('');
        new StylusRenderer(varDef + source)
          .render((err, output) => err ? reject(err) : resolve(output));
      });
    },
  },

  less: {
    async pre(source, vars) {
      if (!self.less) {
        self.less = {
          logLevel: 0,
          useFileCache: false,
        };
      }
      require(['/vendor/less-bundle/less.min']); /* global less */
      const varDefs = Object.keys(vars).map(key => `@${key}:${vars[key].value};\n`).join('');
      const res = await less.render(varDefs + source, {
        math: 'parens-division',
      });
      return res.css;
    },
  },

  uso: {
    pre(source, vars) {
      require(['/js/color/color-converter']); /* global colorConverter */
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
              value = colorConverter.format(value, isRgb ? 'rgb' : 'hex', undefined, usoMode);
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

/* exported compileUsercss */
/**
 * @param {string} preprocessor
 * @param {string} code
 * @param {Object} [vars] - WARNING: each var's `value` will be overwritten
   (not a problem currently as this code runs in a worker so `vars` is just a copy)
 * @returns {Promise<{sections, errors}>}
 */
async function compileUsercss(preprocessor, code, vars) {
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
  require(['/js/moz-parser']); /* global extractSections */
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
