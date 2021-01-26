'use strict';

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
      const pool = new Map();
      return doReplace(source);

      function getValue(name, rgbName) {
        if (!vars.hasOwnProperty(name)) {
          if (name.endsWith('-rgb')) {
            return getValue(name.slice(0, -4), name);
          }
          return null;
        }
        const {type, value} = vars[name];
        switch (type) {
          case 'color': {
            let color = pool.get(rgbName || name);
            if (color == null) {
              color = colorConverter.parse(value);
              if (color) {
                if (color.type === 'hsl') {
                  color = colorConverter.HSVtoRGB(colorConverter.HSLtoHSV(color));
                }
                const {r, g, b} = color;
                color = rgbName
                  ? `${r}, ${g}, ${b}`
                  : `#${(0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
              }
              // the pool stores `false` for bad colors to differentiate from a yet unknown color
              pool.set(rgbName || name, color || false);
            }
            return color || null;
          }
          case 'dropdown':
          case 'select': // prevent infinite recursion
            pool.set(name, '');
            return doReplace(value);
        }
        return value;
      }

      function doReplace(text) {
        return text.replace(/\/\*\[\[([\w-]+)\]\]\*\//g, (match, name) => {
          if (!pool.has(name)) {
            const value = getValue(name);
            pool.set(name, value === null ? match : value);
          }
          return pool.get(name);
        });
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
  if (builder.pre) {
    code = await builder.pre(code, vars);
  }
  require(['/js/moz-parser']); /* global extractSections */
  const res = extractSections({code});
  if (builder.post) {
    builder.post(res.sections, vars);
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
