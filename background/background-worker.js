/* global workerUtil importScripts parseMozFormat metaParser styleCodeEmpty colorConverter */
'use strict';

importScripts('/js/worker-util.js');
const {loadScript, createAPI} = workerUtil;

createAPI({
  parseMozFormat(arg) {
    loadScript('/vendor-overwrites/csslint/parserlib.js', '/js/moz-parser.js');
    return parseMozFormat(arg);
  },
  compileUsercss,
  parseUsercssMeta(text, indexOffset = 0) {
    loadScript(
      '/js/polyfill.js',
      '/vendor/usercss-meta/usercss-meta.min.js',
      '/vendor-overwrites/colorpicker/colorconverter.js',
      '/js/meta-parser.js'
    );
    return metaParser.parse(text, indexOffset);
  },
  nullifyInvalidVars(vars) {
    loadScript(
      '/js/polyfill.js',
      '/vendor/usercss-meta/usercss-meta.min.js',
      '/vendor-overwrites/colorpicker/colorconverter.js',
      '/js/meta-parser.js'
    );
    return metaParser.nullifyInvalidVars(vars);
  }
});

function compileUsercss(preprocessor, code, vars) {
  loadScript('/vendor-overwrites/csslint/parserlib.js', '/js/moz-parser.js');
  const builder = getUsercssCompiler(preprocessor);
  vars = simpleVars(vars);
  return Promise.resolve(builder.preprocess ? builder.preprocess(code, vars) : code)
    .then(code => parseMozFormat({code}))
    .then(({sections, errors}) => {
      if (builder.postprocess) {
        builder.postprocess(sections, vars);
      }
      return {sections, errors};
    });

  function simpleVars(vars) {
    if (!vars) {
      return {};
    }
    // simplify vars by merging `va.default` to `va.value`, so BUILDER don't
    // need to test each va's default value.
    return Object.keys(vars).reduce((output, key) => {
      const va = vars[key];
      output[key] = Object.assign({}, va, {
        value: va.value === null || va.value === undefined ?
          getVarValue(va, 'default') : getVarValue(va, 'value')
      });
      return output;
    }, {});
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
}

function getUsercssCompiler(preprocessor) {
  const BUILDER = {
    default: {
      postprocess(sections, vars) {
        loadScript('/js/sections-util.js');
        let varDef = Object.keys(vars).map(k => `  --${k}: ${vars[k].value};\n`).join('');
        if (!varDef) return;
        varDef = ':root {\n' + varDef + '}\n';
        for (const section of sections) {
          if (!styleCodeEmpty(section.code)) {
            section.code = varDef + section.code;
          }
        }
      }
    },
    stylus: {
      preprocess(source, vars) {
        loadScript('/vendor/stylus-lang-bundle/stylus.min.js');
        return new Promise((resolve, reject) => {
          const varDef = Object.keys(vars).map(key => `${key} = ${vars[key].value};\n`).join('');
          if (!Error.captureStackTrace) Error.captureStackTrace = () => {};
          self.stylus(varDef + source).render((err, output) => {
            if (err) {
              reject(err);
            } else {
              resolve(output);
            }
          });
        });
      }
    },
    less: {
      preprocess(source, vars) {
        if (!self.less) {
          self.less = {
            logLevel: 0,
            useFileCache: false,
          };
        }
        loadScript('/vendor/less-bundle/less.min.js');
        const varDefs = Object.keys(vars).map(key => `@${key}:${vars[key].value};\n`).join('');
        return self.less.render(varDefs + source)
          .then(({css}) => css);
      }
    },
    uso: {
      preprocess(source, vars) {
        loadScript('/vendor-overwrites/colorpicker/colorconverter.js');
        const pool = new Map();
        return Promise.resolve(doReplace(source));

        function getValue(name, rgb) {
          if (!vars.hasOwnProperty(name)) {
            if (name.endsWith('-rgb')) {
              return getValue(name.slice(0, -4), true);
            }
            return null;
          }
          if (rgb) {
            if (vars[name].type === 'color') {
              const color = colorConverter.parse(vars[name].value);
              if (!color) return null;
              const {r, g, b} = color;
              return `${r}, ${g}, ${b}`;
            }
            return null;
          }
          if (vars[name].type === 'dropdown' || vars[name].type === 'select') {
            // prevent infinite recursion
            pool.set(name, '');
            return doReplace(vars[name].value);
          }
          return vars[name].value;
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
      }
    }
  };

  if (preprocessor) {
    if (!BUILDER[preprocessor]) {
      throw new Error('unknwon preprocessor');
    }
    return BUILDER[preprocessor];
  }
  return BUILDER.default;
}
