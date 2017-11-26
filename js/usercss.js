/* global loadScript mozParser semverCompare colorParser styleCodeEmpty */
'use strict';

// eslint-disable-next-line no-var
var usercss = (() => {
  // true for global, false for private
  const METAS = {
    __proto__: null,
    author: true,
    advanced: false,
    description: true,
    homepageURL: false,
    // icon: false,
    license: false,
    name: true,
    namespace: false,
    // noframes: false,
    preprocessor: false,
    supportURL: false,
    'var': false,
    version: false
  };

  const META_VARS = ['text', 'color', 'checkbox', 'select', 'dropdown', 'image'];

  const BUILDER = {
    default: {
      postprocess(sections, vars) {
        const varDef =
          ':root {\n' +
          Object.keys(vars).map(k => `  --${k}: ${vars[k].value};\n`).join('') +
          '}\n';
        for (const section of sections) {
          if (!styleCodeEmpty(section.code)) {
            section.code = varDef + section.code;
          }
        }
      }
    },
    stylus: {
      preprocess(source, vars) {
        return loadScript('/vendor/stylus-lang/stylus.min.js').then(() => (
          new Promise((resolve, reject) => {
            const varDef = Object.keys(vars).map(key => `${key} = ${vars[key].value};\n`).join('');

            // eslint-disable-next-line no-undef
            stylus(varDef + source).render((err, output) => {
              if (err) {
                reject(err);
              } else {
                resolve(output);
              }
            });
          })
        ));
      }
    },
    uso: {
      preprocess(source, vars) {
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
              // eslint-disable-next-line no-use-before-define
              const color = colorParser.parse(vars[name].value);
              return `${color.r}, ${color.g}, ${color.b}`;
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

  const RX_NUMBER = /^-?\d+(\.\d+)?\s*/y;
  const RX_WHITESPACE = /\s*/y;

  function getMetaSource(source) {
    const commentRe = /\/\*[\s\S]*?\*\//g;
    const metaRe = /==userstyle==[\s\S]*?==\/userstyle==/i;

    let m;
    // iterate through each comment
    while ((m = commentRe.exec(source))) {
      const commentSource = source.slice(m.index, m.index + m[0].length);
      const n = commentSource.match(metaRe);
      if (n) {
        return {
          index: m.index + n.index,
          text: n[0]
        };
      }
    }
  }

  function parseWord(state, error = 'invalid word') {
    const match = state.text.slice(state.re.lastIndex).match(/^([\w-]+)\s*/);
    if (!match) {
      throw new Error(error);
    }
    state.value = match[1];
    state.re.lastIndex += match[0].length;
  }

  function parseVar(state) {
    const result = {
      type: null,
      label: null,
      name: null,
      value: null,
      default: null,
      options: null
    };

    parseWord(state, 'missing type');
    result.type = state.type = state.value;
    if (!META_VARS.includes(state.type)) {
      throw new Error(`unknown type: ${state.type}`);
    }

    parseWord(state, 'missing name');
    result.name = state.value;

    parseString(state);
    result.label = state.value;

    if (state.type === 'checkbox') {
      const match = state.text.slice(state.re.lastIndex).match(/([01])\s+/);
      if (!match) {
        throw new Error('value must be 0 or 1');
      }
      state.re.lastIndex += match[0].length;
      result.default = match[1];
    } else if (state.type === 'select' || (state.type === 'image' && state.key === 'var')) {
      parseJSONValue(state);
      if (Array.isArray(state.value)) {
        result.options = state.value.map(text => createOption(text));
      } else {
        result.options = Object.keys(state.value).map(k => createOption(k, state.value[k]));
      }
      result.default = result.options[0].name;
    } else if (state.type === 'dropdown' || state.type === 'image') {
      if (state.text[state.re.lastIndex] !== '{') {
        throw new Error('no open {');
      }
      result.options = [];
      state.re.lastIndex++;
      while (state.text[state.re.lastIndex] !== '}') {
        const option = {};

        parseStringUnquoted(state);
        option.name = state.value;

        parseString(state);
        option.label = state.value;

        if (state.type === 'dropdown') {
          parseEOT(state);
        } else {
          parseString(state);
        }
        option.value = state.value;

        result.options.push(option);
      }
      state.re.lastIndex++;
      eatWhitespace(state);
      result.default = result.options[0].name;
    } else {
      // text, color
      parseStringToEnd(state);
      result.default = state.value;
    }
    state.usercssData.vars[result.name] = result;
    validVar(result);
  }

  function createOption(label, value) {
    let name;
    const match = label.match(/^(\w+):(.*)/);
    if (match) {
      ([, name, label] = match);
    }
    if (!name) {
      name = label;
    }
    if (!value) {
      value = name;
    }
    return {name, label, value};
  }

  function parseEOT(state) {
    const re = /<<<EOT([\s\S]+?)EOT;/y;
    re.lastIndex = state.re.lastIndex;
    const match = state.text.match(re);
    if (!match) {
      throw new Error('missing EOT');
    }
    state.re.lastIndex += match[0].length;
    state.value = match[1].trim().replace(/\*\\\//g, '*/');
    eatWhitespace(state);
  }

  function parseStringUnquoted(state) {
    const re = /[^"]*/y;
    re.lastIndex = state.re.lastIndex;
    const match = state.text.match(re);
    state.re.lastIndex += match[0].length;
    state.value = match[0].trim().replace(/\s+/g, '-');
  }

  function parseString(state) {
    const match = state.text.slice(state.re.lastIndex).match(
      state.text[state.re.lastIndex] === '`' ?
        /^(`(?:\\`|[\s\S])*?`)\s*/ :
        /^((['"])(?:\\\2|[^\n])*?\2|\w+)\s*/
    );
    state.re.lastIndex += match[0].length;
    state.value = unquote(match[1]);
  }

  function parseJSONValue(state) {
    const JSON_PRIME = {
      __proto__: null,
      'null': null,
      'true': true,
      'false': false
    };
    if (state.text[state.re.lastIndex] === '{') {
      // object
      const obj = {};
      state.re.lastIndex++;
      eatWhitespace(state);
      while (state.text[state.re.lastIndex] !== '}') {
        parseString(state);
        const key = state.value;
        if (state.text[state.re.lastIndex] !== ':') {
          throw new Error('missing \':\'');
        }
        state.re.lastIndex++;
        eatWhitespace(state);
        parseJSONValue(state);
        obj[key] = state.value;
        if (state.text[state.re.lastIndex] === ',') {
          state.re.lastIndex++;
          eatWhitespace(state);
        } else if (state.text[state.re.lastIndex] !== '}') {
          throw new Error('missing \',\' or \'}\'');
        }
      }
      state.re.lastIndex++;
      eatWhitespace(state);
      state.value = obj;
    } else if (state.text[state.re.lastIndex] === '[') {
      // array
      const arr = [];
      state.re.lastIndex++;
      eatWhitespace(state);
      while (state.text[state.re.lastIndex] !== ']') {
        parseJSONValue(state);
        arr.push(state.value);
        if (state.text[state.re.lastIndex] === ',') {
          state.re.lastIndex++;
          eatWhitespace(state);
        } else if (state.text[state.re.lastIndex] !== ']') {
          throw new Error('missing \',\' or \']\'');
        }
      }
      state.re.lastIndex++;
      eatWhitespace(state);
      state.value = arr;
    } else if (state.text[state.re.lastIndex] === '"' || state.text[state.re.lastIndex] === '`') {
      // string
      parseString(state);
    } else if (/\d/.test(state.text[state.re.lastIndex])) {
      // number
      parseNumber(state);
    } else {
      parseWord(state);
      if (!(state.value in JSON_PRIME)) {
        throw new Error(`unknown literal '${state.value}'`);
      }
      state.value = JSON_PRIME[state.value];
    }
  }

  function parseNumber(state) {
    RX_NUMBER.lastIndex = state.re.lastIndex;
    const match = RX_NUMBER.exec(state.text);
    if (!match) {
      throw new Error('invalid number');
    }
    state.value = Number(match[0].trim());
    state.re.lastIndex += match[0].length;
  }

  function eatWhitespace(state) {
    RX_WHITESPACE.lastIndex = state.re.lastIndex;
    state.re.lastIndex += RX_WHITESPACE.exec(state.text)[0].length;
  }

  function parseStringToEnd(state) {
    const EOL = state.text.indexOf('\n', state.re.lastIndex);
    const match = state.text.slice(state.re.lastIndex, EOL >= 0 ? EOL : undefined);
    state.value = unquote(match.trim());
    state.re.lastIndex += match.length;
  }

  function unquote(s) {
    const q = s[0];
    if (q === s[s.length - 1] && (q === '"' || q === "'")) {
      // http://www.json.org/
      return s.slice(1, -1).replace(
        new RegExp(`\\\\([${q}\\\\/bfnrt]|u[0-9a-fA-F]{4})`, 'g'),
        s => {
          if (s[1] === q) {
            return q;
          }
          return JSON.parse(`"${s}"`);
        }
      );
    }
    return s;
  }

  function buildMeta(sourceCode) {
    sourceCode = sourceCode.replace(/\r\n?/g, '\n');

    const usercssData = {
      vars: {}
    };

    const style = {
      enabled: true,
      sourceCode,
      sections: [],
      usercssData
    };

    const {text, index: metaIndex} = getMetaSource(sourceCode);
    const re = /@(\w+)\s+/mg;
    const state = {style, re, text, usercssData};

    function doParse() {
      let match;
      while ((match = re.exec(text))) {
        state.key = match[1];
        if (!(state.key in METAS)) {
          continue;
        }
        if (text[re.lastIndex - 1] === '\n') {
          // an empty value should point to EOL
          re.lastIndex--;
        }
        if (state.key === 'var' || state.key === 'advanced') {
          if (state.key === 'advanced') {
            state.maybeUSO = true;
          }
          parseVar(state);
        } else {
          parseStringToEnd(state);
          usercssData[state.key] = state.value;
        }
        if (state.key === 'version') {
          usercssData[state.key] = normalizeVersion(usercssData[state.key]);
          validVersion(usercssData[state.key]);
        }
        if (METAS[state.key]) {
          style[state.key] = usercssData[state.key];
        }
        if (state.key === 'homepageURL' || state.key === 'supportURL') {
          validUrl(usercssData[state.key]);
        }
      }
    }

    try {
      doParse();
    } catch (e) {
      // grab additional info
      e.index = metaIndex + state.re.lastIndex;
      throw e;
    }

    if (state.maybeUSO && !usercssData.preprocessor) {
      usercssData.preprocessor = 'uso';
    }
    if (usercssData.homepageURL) {
      style.url = usercssData.homepageURL;
    }

    validate(style);

    return style;
  }

  function normalizeVersion(version) {
    // https://docs.npmjs.com/misc/semver#versions
    if (version[0] === 'v' || version[0] === '=') {
      return version.slice(1);
    }
    return version;
  }

  function buildCode(style) {
    const {usercssData: {preprocessor, vars}, sourceCode} = style;
    let builder;
    if (preprocessor) {
      if (!BUILDER[preprocessor]) {
        return Promise.reject(chrome.i18n.getMessage('styleMetaErrorPreprocessor', preprocessor));
      }
      builder = BUILDER[preprocessor];
    } else {
      builder = BUILDER.default;
    }

    const sVars = simpleVars(vars);

    return Promise.resolve().then(() => {
      // preprocess
      if (builder.preprocess) {
        return builder.preprocess(sourceCode, sVars);
      }
      return sourceCode;
    }).then(mozStyle =>
      // moz-parser
      loadScript('/js/moz-parser.js').then(() =>
        mozParser.parse(mozStyle).then(sections => {
          style.sections = sections;
        })
      )
    ).then(() => {
      // postprocess
      if (builder.postprocess) {
        return builder.postprocess(style.sections, sVars);
      }
    }).then(() => style);
  }

  function simpleVars(vars) {
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
    return va[prop];
  }

  function validate(style) {
    const {usercssData: data} = style;
    // mandatory fields
    for (const prop of ['name', 'namespace', 'version']) {
      if (!data[prop]) {
        throw new Error(chrome.i18n.getMessage('styleMissingMeta', prop));
      }
    }
    // validate version
    validVersion(data.version);

    // validate URLs
    validUrl(data.homepageURL);
    validUrl(data.supportURL);

    // validate vars
    for (const key of Object.keys(data.vars)) {
      validVar(data.vars[key]);
    }
  }

  function validVersion(version) {
    semverCompare(version, '0.0.0');
  }

  function validUrl(url) {
    if (!url) {
      return;
    }
    url = new URL(url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${url.protocol} is not a valid protocol`);
    }
  }

  function validVar(va, value = 'default') {
    if (va.type === 'select' || va.type === 'dropdown') {
      if (va.options.every(o => o.name !== va[value])) {
        throw new Error(chrome.i18n.getMessage('styleMetaErrorSelectValueMismatch'));
      }
    } else if (va.type === 'checkbox' && !/^[01]$/.test(va[value])) {
      throw new Error(chrome.i18n.getMessage('styleMetaErrorCheckbox'));
    } else if (va.type === 'color') {
      va[value] = colorParser.format(colorParser.parse(va[value]));
    }
  }

  function assignVars(style, oldStyle) {
    const {usercssData: {vars}} = style;
    const {usercssData: {vars: oldVars}} = oldStyle;
    // The type of var might be changed during the update. Set value to null if the value is invalid.
    for (const key of Object.keys(vars)) {
      if (oldVars[key] && oldVars[key].value) {
        vars[key].value = oldVars[key].value;
        try {
          validVar(vars[key], 'value');
        } catch (e) {
          vars[key].value = null;
        }
      }
    }
  }

  return {buildMeta, buildCode, assignVars};
})();
