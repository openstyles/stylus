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
    async pre(source, vars) {
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
async function compileUsercss(preprocessor, code, vars) {
  let builder = BUILDERS[preprocessor];
  if (!builder) {
    builder = BUILDERS.default;
    if (preprocessor != null) console.warn(`Unknown preprocessor "${preprocessor}"`);
  }
  // simplify vars by merging `va.default` to `va.value`, so BUILDER don't
  // need to test each va's default value.
  vars = Object.entries(vars || {}).reduce((output, [key, va]) => {
    // TODO: handle customized image
    const prop = va.value == null ? 'default' : 'value';
    const value =
      /^(select|dropdown|image)$/.test(va.type) ?
        va.options.find(o => o.name === va[prop]).value :
      /^(number|range)$/.test(va.type) && va.units ?
        va[prop] + va.units :
        va[prop];
    output[key] = Object.assign({}, va, {value});
    return output;
  }, {});
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
