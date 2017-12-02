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

  const RX_NUMBER = /-?\d+(\.\d+)?\s*/y;
  const RX_WHITESPACE = /\s*/y;
  const RX_WORD = /([\w-]+)\s*/y;
  const RX_STRING_BACKTICK = /(`(?:\\`|[\s\S])*?`)\s*/y;
  const RX_STRING_QUOTED = /((['"])(?:\\\2|[^\n])*?\2|\w+)\s*/y;

  const worker = {};

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
    return {text: '', index: 0};
  }

  function parseWord(state, error = 'invalid word') {
    RX_WORD.lastIndex = state.re.lastIndex;
    const match = RX_WORD.exec(state.text);
    if (!match) {
      throw new Error((state.errorPrefix || '') + error);
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

    const {re, type, text} = state;

    switch (type === 'image' && state.key === 'var' ? '@image@var' : type) {
      case 'checkbox': {
        const match = text.slice(re.lastIndex).match(/([01])\s+/);
        if (!match) {
          throw new Error('value must be 0 or 1');
        }
        re.lastIndex += match[0].length;
        result.default = match[1];
        break;
      }

      case 'select':
      case '@image@var': {
        state.errorPrefix = 'Invalid JSON: ';
        parseJSONValue(state);
        state.errorPrefix = '';
        if (Array.isArray(state.value)) {
          result.options = state.value.map(text => createOption(text));
        } else {
          result.options = Object.keys(state.value).map(k => createOption(k, state.value[k]));
        }
        result.default = (result.options[0] || {}).name || '';
        break;
      }

      case 'dropdown':
      case 'image': {
        if (text[re.lastIndex] !== '{') {
          throw new Error('no open {');
        }
        result.options = [];
        re.lastIndex++;
        while (text[re.lastIndex] !== '}') {
          const option = {};

          parseStringUnquoted(state);
          option.name = state.value;

          parseString(state);
          option.label = state.value;

          if (type === 'dropdown') {
            parseEOT(state);
          } else {
            parseString(state);
          }
          option.value = state.value;

          result.options.push(option);
        }
        re.lastIndex++;
        eatWhitespace(state);
        result.default = result.options[0].name;
        break;
      }

      default: {
        // text, color
        parseStringToEnd(state);
        result.default = state.value;
      }
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
    const pos = state.re.lastIndex;
    const nextQuoteOrEOL = posOrEnd(state.text, '"', pos);
    state.re.lastIndex = nextQuoteOrEOL;
    state.value = state.text.slice(pos, nextQuoteOrEOL).trim().replace(/\s+/g, '-');
  }

  function parseString(state) {
    const pos = state.re.lastIndex;
    const rx = state.text[pos] === '`' ? RX_STRING_BACKTICK : RX_STRING_QUOTED;
    rx.lastIndex = pos;
    const match = rx.exec(state.text);
    if (!match) {
      throw new Error((state.errorPrefix || '') + 'Quoted string expected');
    }
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
    const {text, re, errorPrefix} = state;
    if (text[re.lastIndex] === '{') {
      // object
      const obj = {};
      re.lastIndex++;
      eatWhitespace(state);
      while (text[re.lastIndex] !== '}') {
        parseString(state);
        const key = state.value;
        if (text[re.lastIndex] !== ':') {
          throw new Error(`${errorPrefix}missing ':'`);
        }
        re.lastIndex++;
        eatWhitespace(state);
        parseJSONValue(state);
        obj[key] = state.value;
        if (text[re.lastIndex] === ',') {
          re.lastIndex++;
          eatWhitespace(state);
        } else if (text[re.lastIndex] !== '}') {
          throw new Error(`${errorPrefix}missing ',' or '}'`);
        }
      }
      re.lastIndex++;
      eatWhitespace(state);
      state.value = obj;
    } else if (text[re.lastIndex] === '[') {
      // array
      const arr = [];
      re.lastIndex++;
      eatWhitespace(state);
      while (text[re.lastIndex] !== ']') {
        parseJSONValue(state);
        arr.push(state.value);
        if (text[re.lastIndex] === ',') {
          re.lastIndex++;
          eatWhitespace(state);
        } else if (text[re.lastIndex] !== ']') {
          throw new Error(`${errorPrefix}missing ',' or ']'`);
        }
      }
      re.lastIndex++;
      eatWhitespace(state);
      state.value = arr;
    } else if (text[re.lastIndex] === '"' || text[re.lastIndex] === '`') {
      // string
      parseString(state);
    } else if (/\d/.test(text[re.lastIndex])) {
      // number
      parseNumber(state);
    } else {
      parseWord(state);
      if (!(state.value in JSON_PRIME)) {
        throw new Error(`${errorPrefix}unknown literal '${state.value}'`);
      }
      state.value = JSON_PRIME[state.value];
    }
  }

  function parseNumber(state) {
    RX_NUMBER.lastIndex = state.re.lastIndex;
    const match = RX_NUMBER.exec(state.text);
    if (!match) {
      throw new Error((state.errorPrefix || '') + 'invalid number');
    }
    state.value = Number(match[0].trim());
    state.re.lastIndex += match[0].length;
  }

  function eatWhitespace(state) {
    RX_WHITESPACE.lastIndex = state.re.lastIndex;
    state.re.lastIndex += RX_WHITESPACE.exec(state.text)[0].length;
  }

  function parseStringToEnd(state) {
    rewindToEOL(state);
    const EOL = posOrEnd(state.text, '\n', state.re.lastIndex);
    const match = state.text.slice(state.re.lastIndex, EOL);
    state.value = unquote(match.trim());
    state.re.lastIndex += match.length;
  }

  function unquote(s) {
    const q = s[0];
    if (q === s[s.length - 1] && (q === '"' || q === "'" || q === '`')) {
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

  function posOrEnd(haystack, needle, start) {
    const pos = haystack.indexOf(needle, start);
    return pos < 0 ? haystack.length : pos;
  }

  function rewindToEOL({re, text}) {
    re.lastIndex -= text[re.lastIndex - 1] === '\n' ? 1 : 0;
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
      let pos = state.re.lastIndex;
      while (pos && /[\s\n]/.test(state.text[--pos])) { /**/ }
      e.index = metaIndex + pos;
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

    return Promise.resolve(builder.preprocess && builder.preprocess(sourceCode, sVars) || sourceCode)
      .then(mozStyle => invokeWorker({action: 'parse', code: mozStyle}))
      .then(sections => (style.sections = sections))
      .then(() => builder.postprocess && builder.postprocess(style.sections, sVars))
      .then(() => style);
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

  function invokeWorker(message) {
    if (!worker.queue) {
      worker.instance = new Worker('/vendor-overwrites/csslint/csslint-worker.js');
      worker.queue = [];
      worker.instance.onmessage = ({data}) => {
        worker.queue.shift().resolve(data);
        if (worker.queue.length) {
          worker.instance.postMessage(worker.queue[0].message);
        }
      };
    }
    return new Promise(resolve => {
      worker.queue.push({message, resolve});
      if (worker.queue.length === 1) {
        worker.instance.postMessage(message);
      }
    });
  }

  return {buildMeta, buildCode, assignVars};
})();
