'use strict';

define(require => { // define and require use `importScripts` which is synchronous
  const {createAPI} = require('/js/worker-util');

  let BUILDERS;
  const bgw = /** @namespace BackgroundWorker */ {

    async compileUsercss(preprocessor, code, vars) {
      if (!BUILDERS) createBuilders();
      const builder = BUILDERS[preprocessor] || BUILDERS.default;
      if (!builder) throw new Error(`Unknown preprocessor "${preprocessor}"`);
      vars = simplifyVars(vars);
      const {preprocess, postprocess} = builder;
      if (preprocess) code = await preprocess(code, vars);
      const res = bgw.parseMozFormat({code});
      if (postprocess) postprocess(res.sections, vars);
      return res;
    },

    parseMozFormat(...args) {
      return require('/js/moz-parser').extractSections(...args);
    },

    parseUsercssMeta(text) {
      return require('/js/meta-parser').parse(text);
    },

    nullifyInvalidVars(vars) {
      return require('/js/meta-parser').nullifyInvalidVars(vars);
    },
  };

  createAPI(bgw);

  function createBuilders() {
    BUILDERS = Object.assign(Object.create(null));

    BUILDERS.default = {
      postprocess(sections, vars) {
        const {styleCodeEmpty} = require('/js/sections-util');
        let varDef = Object.keys(vars).map(k => `  --${k}: ${vars[k].value};\n`).join('');
        if (!varDef) return;
        varDef = ':root {\n' + varDef + '}\n';
        for (const section of sections) {
          if (!styleCodeEmpty(section.code)) {
            section.code = varDef + section.code;
          }
        }
      },
    };

    BUILDERS.stylus = {
      preprocess(source, vars) {
        require('/vendor/stylus-lang-bundle/stylus-renderer.min');
        return new Promise((resolve, reject) => {
          const varDef = Object.keys(vars).map(key => `${key} = ${vars[key].value};\n`).join('');
          new self.StylusRenderer(varDef + source)
            .render((err, output) => err ? reject(err) : resolve(output));
        });
      },
    };

    BUILDERS.less = {
      preprocess(source, vars) {
        if (!self.less) {
          self.less = {
            logLevel: 0,
            useFileCache: false,
          };
        }
        require('/vendor/less-bundle/less.min');
        const varDefs = Object.keys(vars).map(key => `@${key}:${vars[key].value};\n`).join('');
        return self.less.render(varDefs + source)
          .then(({css}) => css);
      },
    };

    BUILDERS.uso = {
      async preprocess(source, vars) {
        const colorConverter = require('/js/color/color-converter');
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
    };
  }

  function getVarValue(va, prop) {
    if (va.type === 'select' || va.type === 'dropdown' || va.type === 'image') {
      // TODO: handle customized image
      return va.options.find(o => o.name === va[prop]).value;
    }
    if ((va.type === 'number' || va.type === 'range') && va.units) {
      return va[prop] + va.units;
    }
    return va[prop];
  }

  function simplifyVars(vars) {
    if (!vars) {
      return {};
    }
    // simplify vars by merging `va.default` to `va.value`, so BUILDER don't
    // need to test each va's default value.
    return Object.keys(vars).reduce((output, key) => {
      const va = vars[key];
      output[key] = Object.assign({}, va, {
        value: va.value === null || va.value === undefined ?
          getVarValue(va, 'default') : getVarValue(va, 'value'),
      });
      return output;
    }, {});
  }

  return bgw;
});
