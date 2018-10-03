/* global loadScript semverCompare colorConverter styleCodeEmpty */
'use strict';

// eslint-disable-next-line no-var
var usercss = (() => {
  // true = global
  // false or 0 = private
  // <string> = global key name
  // <function> = (style, newValue)
  const KNOWN_META = new Map([
    ['author', true],
    ['advanced', 0],
    ['description', true],
    ['homepageURL', 'url'],
    ['icon', 0],
    ['license', 0],
    ['name', true],
    ['namespace', 0],
    //['noframes', 0],
    ['preprocessor', 0],
    ['supportURL', 0],
    ['updateURL', (style, newValue) => {
      // always preserve locally installed style's updateUrl
      if (!/^file:/.test(style.updateUrl)) {
        style.updateUrl = newValue;
      }
    }],
    ['var', 0],
    ['version', 0],
  ]);
  const MANDATORY_META = ['name', 'namespace', 'version'];
  const META_VARS = ['text', 'color', 'checkbox', 'select', 'dropdown', 'image', 'number', 'range'];
  const META_URLS = [...KNOWN_META.keys()].filter(k => k.endsWith('URL'));

  const BUILDER = {
    default: {
      postprocess(sections, vars) {
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
        return loadScript('/vendor/stylus-lang-bundle/stylus.min.js').then(() => (
          new Promise((resolve, reject) => {
            const varDef = Object.keys(vars).map(key => `${key} = ${vars[key].value};\n`).join('');
            if (!Error.captureStackTrace) Error.captureStackTrace = () => {};
            window.stylus(varDef + source).render((err, output) => {
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
    less: {
      preprocess(source, vars) {
        window.less = window.less || {
          logLevel: 0,
          useFileCache: false,
        };
        const varDefs = Object.keys(vars).map(key => `@${key}:${vars[key].value};\n`).join('');
        return loadScript('/vendor/less/less.min.js')
          .then(() => window.less.render(varDefs + source))
          .then(({css}) => css);
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
        const extractDefaultOption = (key, value) => {
          if (key.endsWith('*')) {
            const option = createOption(key.slice(0, -1), value);
            result.default = option.name;
            return option;
          }
          return createOption(key, value);
        };
        if (Array.isArray(state.value)) {
          result.options = state.value.map(k => extractDefaultOption(k));
        } else {
          result.options = Object.keys(state.value).map(k => extractDefaultOption(k, state.value[k]));
        }
        if (result.default === null) {
          result.default = (result.options[0] || {}).name || '';
        }
        break;
      }

      case 'number':
      case 'range': {
        state.errorPrefix = 'Invalid JSON: ';
        parseJSONValue(state);
        state.errorPrefix = '';
        // [default, start, end, step, units] (start, end, step & units are optional)
        if (Array.isArray(state.value) && state.value.length) {
          // label may be placed anywhere
          result.units = (state.value.find(i => typeof i === 'string') || '').replace(/[\d.+-]/g, '');
          const range = state.value.filter(i => typeof i === 'number' || i === null);
          result.default = range[0];
          result.min = range[1];
          result.max = range[2];
          result.step = range[3] === 0 ? 1 : range[3];
        }
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
    validateVar(result);
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

  function buildMeta(sourceCode) {
    sourceCode = sourceCode.replace(/\r\n?/g, '\n');

    const usercssData = {
      vars: {}
    };

    const style = {
      reason: 'install',
      enabled: true,
      sourceCode,
      sections: [],
      usercssData
    };

    const {text, index: metaIndex} = getMetaSource(sourceCode);
    const re = /@(\w+)[ \t\xA0]*/mg;
    const state = {style, re, text, usercssData};

    function doParse() {
      let match;
      while ((match = re.exec(text))) {
        const key = state.key = match[1];
        const route = KNOWN_META.get(key);
        if (route === undefined) {
          continue;
        }
        if (key === 'var' || key === 'advanced') {
          if (key === 'advanced') {
            state.maybeUSO = true;
          }
          parseVar(state);
        } else {
          parseStringToEnd(state);
          usercssData[key] = state.value;
        }
        let value = state.value;
        if (key === 'version') {
          value = usercssData[key] = normalizeVersion(value);
          validateVersion(value);
        }
        if (META_URLS.includes(key)) {
          validateUrl(key, value);
        }
        switch (typeof route) {
          case 'function':
            route(style, value);
            break;
          case 'string':
            style[route] = value;
            break;
          default:
            if (route) {
              style[key] = value;
            }
        }
      }
    }

    try {
      doParse();
    } catch (e) {
      // the source code string offset
      e.index = metaIndex + state.re.lastIndex;
      throw e;
    }

    if (state.maybeUSO && !usercssData.preprocessor) {
      usercssData.preprocessor = 'uso';
    }

    validateStyle(style);
    return style;
  }

  function normalizeVersion(version) {
    // https://docs.npmjs.com/misc/semver#versions
    if (version[0] === 'v' || version[0] === '=') {
      return version.slice(1);
    }
    return version;
  }

  /**
   * @param {Object} style
   * @param {Boolean} [allowErrors=false]
   * @returns {(Style | {style: Style, errors: (false|String[])})} - style object
   *      when allowErrors is falsy or {style, errors} object when allowErrors is truthy
   */
  function buildCode(style, allowErrors) {
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

    return (
      Promise.resolve(
        builder.preprocess && builder.preprocess(sourceCode, sVars) ||
        sourceCode)
      .then(mozStyle => invokeWorker({
        action: 'parse',
        styleId: style.id,
        code: mozStyle,
      }))
      .then(({sections, errors}) => {
        if (!errors.length) errors = false;
        if (!sections.length || errors && !allowErrors) {
          return Promise.reject(errors);
        }
        style.sections = sections;
        if (builder.postprocess) builder.postprocess(style.sections, sVars);
        return allowErrors ? {style, errors} : style;
      }));
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
    if ((va.type === 'number' || va.type === 'range') && va.units) {
      return va[prop] + va.units;
    }
    return va[prop];
  }

  function validateStyle({usercssData: data}) {
    for (const prop of MANDATORY_META) {
      if (!data[prop]) {
        throw new Error(chrome.i18n.getMessage('styleMissingMeta', prop));
      }
    }
    validateVersion(data.version);
    META_URLS.forEach(k => validateUrl(k, data[k]));
    Object.keys(data.vars).forEach(k => validateVar(data.vars[k]));
  }

  function validateVersion(version) {
    semverCompare(version, '0.0.0');
  }

  function validateUrl(key, url) {
    if (!url) {
      return;
    }
    url = new URL(url);
    if (!/^https?:/.test(url.protocol)) {
      throw new Error(`${url.protocol} is not a valid protocol in ${key}`);
    }
  }

  function validateVar(va, value = 'default') {
    if (va.type === 'select' || va.type === 'dropdown') {
      if (va.options.every(o => o.name !== va[value])) {
        throw new Error(chrome.i18n.getMessage('styleMetaErrorSelectValueMismatch'));
      }
    } else if (va.type === 'checkbox' && !/^[01]$/.test(va[value])) {
      throw new Error(chrome.i18n.getMessage('styleMetaErrorCheckbox'));
    } else if (va.type === 'color') {
      va[value] = colorConverter.format(colorConverter.parse(va[value]), 'rgb');
    } else if ((va.type === 'number' || va.type === 'range') && typeof va[value] !== 'number') {
      throw new Error(chrome.i18n.getMessage('styleMetaErrorRangeOrNumber', va.type));
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
          validateVar(vars[key], 'value');
        } catch (e) {
          vars[key].value = null;
        }
      }
    }
  }

  function invokeWorker(message) {
    if (!worker.queue) {
      worker.instance = new Worker('/background/parserlib-loader.js');
      worker.queue = [];
      worker.instance.onmessage = ({data}) => {
        worker.queue.shift().resolve(data.__ERROR__ ? Promise.reject(data.__ERROR__) : data);
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

  return {buildMeta, buildCode, assignVars, invokeWorker};
})();
