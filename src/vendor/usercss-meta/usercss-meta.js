var usercssMeta = (function (exports) {
  'use strict';

  class ParseError extends Error {
    constructor(err) {
      super(err.message);
      delete err.message;
      this.name = 'ParseError';
      Object.assign(this, err);
    }
  }

  class MissingCharError extends ParseError {
    constructor(chars, index) {
      super({
        code: 'missingChar',
        args: chars,
        message: `Missing character: ${chars.map(c => `'${c}'`).join(', ')}`,
        index
      });
    }
  }

  class EOFError extends ParseError {
    constructor(index) {
      super({
        code: 'EOF',
        message: 'Unexpected end of file',
        index
      });
    }
  }

  const RX_EOT = /<<<EOT([\s\S]+?)EOT;/y;
  const RX_LINE = /.*/y;
  const RX_NUMBER = /-?(\d+(\.\d+)?|\.\d+)([eE]-?\d+)?\s*/y;
  const RX_WHITESPACE = /\s*/y;
  const RX_WHITESPACE_SAMELINE = /[^\S\n]*/y;
  const RX_WORD = /([\w-]+)\s*/y;
  const RX_STRING_BACKTICK = /(`(?:\\`|[\s\S])*?`)/y;
  const RX_STRING_QUOTED = /((['"])(?:\\\2|[^\n])*?\2|\w+)/y;
  const RX_STRING_UNQUOTED = /[^"]*/y;
  /** Relaxed semver:
   * dot-separated digits sequence e.g. 1 or 1.2 or 1.2.3.4.5
   * optional pre-release chunk: "-" followed by dot-separated word characters, "-"
   * optional build chunk: "+" followed by dot-separated word characters, "-"
   */
  // FIXME: should we allow leading 'v'?
  const RX_VERSION = /^v?\d+(\.\d+)*(?:-(\w[-\w]*(\.[-\w]+)*))?(?:\+(\w[-\w]*(\.[-\w]+)*))?$/;

  const JSON_PRIME = {
    __proto__: null,
    'null': null,
    'true': true,
    'false': false
  };

  function unescapeComment(s) {
    return s.replace(/\*\\\//g, '*/');
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

    return unescapeComment(s);
  }

  function eatLine(state) {
    RX_LINE.lastIndex = state.lastIndex;
    RX_LINE.exec(state.text);
    state.lastIndex = RX_LINE.lastIndex;
  }

  function eatWhitespace(state) {
    RX_WHITESPACE.lastIndex = state.lastIndex;
    state.lastIndex += RX_WHITESPACE.exec(state.text)[0].length;
  }

  function eatSameLineWhitespace(state) {
    RX_WHITESPACE_SAMELINE.lastIndex = state.lastIndex;
    state.lastIndex += RX_WHITESPACE_SAMELINE.exec(state.text)[0].length;
  }

  function parseChar(state) {
    if (state.lastIndex >= state.text.length) {
      throw new EOFError(state.lastIndex);
    }

    state.index = state.lastIndex;
    state.value = state.text[state.lastIndex];
    state.lastIndex++;
    eatWhitespace(state);
  }

  function parseWord(state) {
    const pos = state.lastIndex;
    RX_WORD.lastIndex = pos;
    const match = RX_WORD.exec(state.text);
    if (!match) {
      throw new ParseError({
        code: 'invalidWord',
        message: 'Invalid word',
        index: pos
      });
    }

    state.index = pos;
    state.value = match[1];
    state.lastIndex += match[0].length;
  }

  function parseJSON(state) {
    const pos = state.lastIndex;
    try {
      parseJSONValue(state);
    } catch (err) {
      err.message = `Invalid JSON: ${err.message}`;
      throw err;
    }

    state.index = pos;
  }

  function parseEOT(state) {
    const pos = state.lastIndex;
    RX_EOT.lastIndex = pos;
    const match = RX_EOT.exec(state.text);
    if (!match) {
      throw new ParseError({
        code: 'missingEOT',
        message: 'Missing EOT',
        index: pos
      });
    }

    state.index = pos;
    state.lastIndex += match[0].length;
    state.value = unescapeComment(match[1].trim());
    eatWhitespace(state);
  }

  function parseStringUnquoted(state) {
    RX_STRING_UNQUOTED.lastIndex = state.lastIndex;
    const match = RX_STRING_UNQUOTED.exec(state.text);
    state.index = state.lastIndex;
    state.lastIndex = RX_STRING_UNQUOTED.lastIndex;
    state.value = match[0].trim().replace(/\s+/g, '-');
  }

  function parseString(state, sameLine = false) {
    const pos = state.lastIndex;
    const rx = state.text[pos] === '`' ? RX_STRING_BACKTICK : RX_STRING_QUOTED;
    rx.lastIndex = pos;
    const match = rx.exec(state.text);
    if (!match) {
      throw new ParseError({
        code: 'invalidString',
        message: 'Invalid string',
        index: pos
      });
    }

    state.index = pos;
    state.lastIndex += match[0].length;
    state.value = unquote(match[1]);
    if (sameLine) {
      eatSameLineWhitespace(state);
    } else {
      eatWhitespace(state);
    }
  }

  function parseJSONValue(state) {
    const {text} = state;
    if (text[state.lastIndex] === '{') {
      // object
      const object = {};
      state.lastIndex++;
      eatWhitespace(state);
      while (text[state.lastIndex] !== '}') {
        parseString(state);
        const key = state.value;
        if (text[state.lastIndex] !== ':') {
          throw new MissingCharError([':'], state.lastIndex);
        }

        state.lastIndex++;
        eatWhitespace(state);
        parseJSONValue(state);
        object[key] = state.value;
        if (text[state.lastIndex] === ',') {
          state.lastIndex++;
          eatWhitespace(state);
        } else if (text[state.lastIndex] !== '}') {
          throw new MissingCharError([',', '}'], state.lastIndex);
        }
      }

      state.lastIndex++;
      eatWhitespace(state);
      state.value = object;
    } else if (text[state.lastIndex] === '[') {
      // array
      const array = [];
      state.lastIndex++;
      eatWhitespace(state);
      while (text[state.lastIndex] !== ']') {
        parseJSONValue(state);
        array.push(state.value);
        if (text[state.lastIndex] === ',') {
          state.lastIndex++;
          eatWhitespace(state);
        } else if (text[state.lastIndex] !== ']') {
          throw new MissingCharError([',', ']'], state.lastIndex);
        }
      }

      state.lastIndex++;
      eatWhitespace(state);
      state.value = array;
    } else if (text[state.lastIndex] === '"' || text[state.lastIndex] === "'" || text[state.lastIndex] === '`') {
      // string
      parseString(state);
    } else if (/[-\d.]/.test(text[state.lastIndex])) {
      // number
      parseNumber(state);
    } else {
      parseWord(state);
      if (!(state.value in JSON_PRIME)) {
        throw new ParseError({
          code: 'unknownJSONLiteral',
          args: [state.value],
          message: `Unknown literal '${state.value}'`,
          index: state.index
        });
      }

      state.value = JSON_PRIME[state.value];
    }
  }

  function parseNumber(state) {
    const pos = state.lastIndex;
    RX_NUMBER.lastIndex = pos;
    const match = RX_NUMBER.exec(state.text);
    if (!match) {
      throw new ParseError({
        code: 'invalidNumber',
        message: 'Invalid number',
        index: pos
      });
    }

    state.index = pos;
    state.value = Number(match[0].trim());
    state.lastIndex += match[0].length;
  }

  function parseStringToEnd(state) {
    RX_LINE.lastIndex = state.lastIndex;
    const match = RX_LINE.exec(state.text);
    const value = match[0].trim();
    if (!value) {
      throw new ParseError({
        code: 'missingValue',
        message: 'Missing value',
        index: RX_LINE.lastIndex
      });
    }

    state.index = state.lastIndex;
    state.value = unquote(value);
    state.lastIndex = RX_LINE.lastIndex;
  }

  function isValidVersion(version) {
    return RX_VERSION.test(version);
  }

  var parseUtil = {
    __proto__: null,
    eatLine: eatLine,
    eatWhitespace: eatWhitespace,
    parseChar: parseChar,
    parseEOT: parseEOT,
    parseJSON: parseJSON,
    parseNumber: parseNumber,
    parseString: parseString,
    parseStringToEnd: parseStringToEnd,
    parseStringUnquoted: parseStringUnquoted,
    parseWord: parseWord,
    unquote: unquote,
    isValidVersion: isValidVersion
  };

  /* eslint-env browser */

  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  const _export_URL_ = self.URL;

  var UNITS = ['em', 'ex', 'cap', 'ch', 'ic', 'rem', 'lh', 'rlh', 'vw', 'vh', 'vi', 'vb', 'vmin', 'vmax', 'cm', 'mm', 'Q', 'in', 'pt', 'pc', 'px', 'deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx', '%'];

  /**
   * Gives you a array with filled with 0...amount - 1.
   * @param {number} amount
   * @returns {number[]}
   */
  function range(amount) {
    const range = Array(amount);
    for (let i = 0; i < amount; i++) {
      range[i] = i;
    }

    return range;
  }

  /**
   * Check if the amount of edits between firstString and secondString is <= maxEdits.
   * It uses the Levenshtein distance algorithm with the two matrix rows variant.
   * @param {string} firstString First string to be checked against the other string
   * @param {string} secondString Second string to be checked against the other string
   * @param {number} maxEdit The maximum amount of edits that these 2 string should have.
   * @returns {boolean} indicate if the 2 strings's edits are less or equal to maxEdits
   */
  function LevenshteinDistanceWithMax(firstString, secondString, maxEdit) {
    const lenOne = firstString.length;
    const lenTwo = secondString.length;

    const lenDiff = Math.abs(lenOne - lenTwo);
    // Are the difference between 2 lengths greater than
    // maxEdit, we know to bail out early on.
    if (lenDiff > maxEdit) {
      return false;
    }

    let prevRowDistance = range(lenOne + 1);
    let currentRowDistance = Array(lenOne + 1);
    for (let i = 1; i <= lenTwo; i++) {
      // Calculate the current row distances from the previous row.
      currentRowDistance[0] = i;
      let minDistance = i;
      for (let j = 1; j <= lenOne; j++) {
        const editCost = firstString[j - 1] === secondString[i - 1] ? 0 : 1;

        const addCost = prevRowDistance[j] + 1;
        const delCost = currentRowDistance[j - 1] + 1;
        const substitionCost = prevRowDistance[j - 1] + editCost;

        currentRowDistance[j] = Math.min(addCost, delCost, substitionCost);
        if (currentRowDistance[j] < minDistance) {
          minDistance = currentRowDistance[j];
        }
      }

      if (minDistance > maxEdit) {
        return false;
      }

      // Swap the vectors
      const vtemp = currentRowDistance;
      currentRowDistance = prevRowDistance;
      prevRowDistance = vtemp;
    }

    return prevRowDistance[lenOne] <= maxEdit;
  }

  const UNITS_SET = new Set(UNITS);

  const DEFAULT_PARSER = {
    name: parseStringToEnd,
    version: parseStringToEnd,
    namespace: parseStringToEnd,
    author: parseStringToEnd,
    description: parseStringToEnd,
    homepageURL: parseStringToEnd,
    supportURL: parseStringToEnd,
    updateURL: parseStringToEnd,
    license: parseStringToEnd,
    preprocessor: parseStringToEnd
  };

  const DEFAULT_VALIDATOR = {
    version: validateVersion,
    homepageURL: validateURL,
    supportURL: validateURL,
    updateURL: validateURL
  };

  const DEFAULT_VAR_PARSER = {
    text: parseStringToEnd,
    color: parseStringToEnd,
    checkbox: parseChar,
    select: parseSelect,
    dropdown: {
      advanced: parseVarXStyle
    },
    image: {
      var: parseSelect,
      advanced: parseVarXStyle
    },
    number: parseRange,
    range: parseRange
  };

  const DEFAULT_VAR_VALIDATOR = {
    checkbox: validateCheckbox,
    number: validateRange,
    range: validateRange
  };

  const MANDATORY_META = ['name', 'namespace', 'version'];
  const RANGE_PROPS = ['default', 'min', 'max', 'step'];

  function parseRange(state) {
    parseJSON(state);
    const result = {
      min: null,
      max: null,
      step: null,
      units: null
    };
    if (typeof state.value === 'number') {
      result.default = state.value;
    } else if (Array.isArray(state.value)) {
      let i = 0;
      for (const item of state.value) {
        if (typeof item === 'string') {
          if (result.units != null) {
            throw new ParseError({
              code: 'invalidRangeMultipleUnits',
              message: 'units is alredy defined',
              args: [state.type],
              index: state.valueIndex
            });
          }

          result.units = item;
        } else if (typeof item === 'number' || item === null) {
          if (i >= RANGE_PROPS.length) {
            throw new ParseError({
              code: 'invalidRangeTooManyValues',
              message: 'the array contains too many values',
              args: [state.type],
              index: state.valueIndex
            });
          }

          result[RANGE_PROPS[i++]] = item;
        } else {
          throw new ParseError({
            code: 'invalidRangeValue',
            message: 'value must be number, string, or null',
            args: [state.type],
            index: state.valueIndex
          });
        }
      }
    } else {
      throw new ParseError({
        code: 'invalidRange',
        message: 'the default value must be an array or a number',
        index: state.valueIndex,
        args: [state.type]
      });
    }

    state.value = result.default;
    Object.assign(state.varResult, result);
  }

  function parseSelect(state) {
    parseJSON(state);
    if (typeof state.value !== 'object' || !state.value) {
      throw new ParseError({
        code: 'invalidSelect',
        message: 'The value must be an array or object'
      });
    }

    const options = Array.isArray(state.value) ?
      state.value.map(key => createOption(key)) :
      Object.keys(state.value).map(key => createOption(key, state.value[key]));
    if (new Set(options.map(o => o.name)).size < options.length) {
      throw new ParseError({
        code: 'invalidSelectNameDuplicated',
        message: 'Option name is duplicated'
      });
    }

    if (options.length === 0) {
      throw new ParseError({
        code: 'invalidSelectEmptyOptions',
        message: 'Option list is empty'
      });
    }

    const defaults = options.filter(o => o.isDefault);
    if (defaults.length > 1) {
      throw new ParseError({
        code: 'invalidSelectMultipleDefaults',
        message: 'multiple default values'
      });
    }

    options.forEach(o => {
      delete o.isDefault;
    });
    state.varResult.options = options;
    state.value = (defaults.length > 0 ? defaults[0] : options[0]).name;
  }

  function parseVarXStyle(state) {
    const pos = state.lastIndex;
    if (state.text[state.lastIndex] !== '{') {
      throw new MissingCharError(['{'], pos);
    }

    const options = [];
    state.lastIndex++;
    while (state.text[state.lastIndex] !== '}') {
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

      options.push(option);
    }

    state.lastIndex++;
    eatWhitespace(state);
    if (options.length === 0) {
      throw new ParseError({
        code: 'invalidSelectEmptyOptions',
        message: 'Option list is empty',
        index: pos
      });
    }

    if (state.type === 'dropdown') {
      state.varResult.type = 'select';
      state.type = 'select';
    }

    state.varResult.options = options;
    state.value = options[0].name;
  }

  function createOption(label, value) {
    if (typeof label !== 'string' || value && typeof value !== 'string') {
      throw new ParseError({
        code: 'invalidSelectValue',
        message: 'Values in the object/array must be strings'
      });
    }

    let isDefault = false;
    if (label.endsWith('*')) {
      isDefault = true;
      label = label.slice(0, -1);
    }

    let name;
    const match = label.match(/^(\w+):(.*)/);
    if (match) {
      ([, name, label] = match);
    }

    if (!name) {
      name = label;
    }

    if (!label) {
      throw new ParseError({
        code: 'invalidSelectLabel',
        message: 'Option label is empty'
      });
    }

    if (value == null) {
      value = name;
    }

    return {name, label, value, isDefault};
  }

  function collectErrors(fn, errors) {
    if (errors) {
      try {
        fn();
      } catch (err) {
        errors.push(err);
      }
    } else {
      fn();
    }
  }

  function validateVersion(state) {
    if (!isValidVersion(state.value)) {
      throw new ParseError({
        code: 'invalidVersion',
        args: [state.value],
        message: `Invalid version: ${state.value}`,
        index: state.valueIndex
      });
    }

    state.value = normalizeVersion(state.value);
  }

  function validateURL(state) {
    let url;
    try {
      url = new _export_URL_(state.value);
    } catch (err) {
      err.args = [state.value];
      err.index = state.valueIndex;
      throw err;
    }

    if (!/^https?:/.test(url.protocol)) {
      throw new ParseError({
        code: 'invalidURLProtocol',
        args: [url.protocol],
        message: `Invalid protocol: ${url.protocol}`,
        index: state.valueIndex
      });
    }
  }

  function validateCheckbox(state) {
    if (state.value !== '1' && state.value !== '0') {
      throw new ParseError({
        code: 'invalidCheckboxDefault',
        message: 'value must be 0 or 1',
        index: state.valueIndex
      });
    }
  }

  function validateRange(state) {
    const value = state.value;
    if (typeof value !== 'number') {
      throw new ParseError({
        code: 'invalidRangeDefault',
        message: `the default value of @var ${state.type} must be a number`,
        index: state.valueIndex,
        args: [state.type]
      });
    }

    const result = state.varResult;
    if (result.min != null && value < result.min) {
      throw new ParseError({
        code: 'invalidRangeMin',
        message: 'the value is smaller than the minimum',
        index: state.valueIndex,
        args: [state.type]
      });
    }

    if (result.max != null && value > result.max) {
      throw new ParseError({
        code: 'invalidRangeMax',
        message: 'the value is larger than the maximum',
        index: state.valueIndex,
        args: [state.type]
      });
    }

    if (
      result.step != null &&
      [value, result.min, result.max]
        .some(n => n != null && !isMultipleOf(n, result.step))
    ) {
      throw new ParseError({
        code: 'invalidRangeStep',
        message: 'the value is not a multiple of the step',
        index: state.valueIndex,
        args: [state.type]
      });
    }

    if (result.units && !UNITS_SET.has(result.units)) {
      throw new ParseError({
        code: 'invalidRangeUnits',
        message: `Invalid CSS unit: ${result.units}`,
        index: state.valueIndex,
        args: [state.type, result.units]
      });
    }
  }

  function isMultipleOf(value, step) {
    const n = Math.abs(value / step);
    const nInt = Math.round(n);
    // IEEE 754 double-precision numbers can reliably store 15 decimal digits
    // of which some are already occupied by the integer part
    return Math.abs(n - nInt) < Math.pow(10, (`${nInt}`.length - 16));
  }

  function createParser({
    unknownKey = 'ignore',
    mandatoryKeys = MANDATORY_META,
    parseKey: userParseKey,
    parseVar: userParseVar,
    validateKey: userValidateKey,
    validateVar: userValidateVar,
    allowErrors = false
  } = {}) {
    if (!['ignore', 'assign', 'throw'].includes(unknownKey)) {
      throw new TypeError("unknownKey must be 'ignore', 'assign', or 'throw'");
    }

    const parser = Object.assign(Object.create(null), DEFAULT_PARSER, userParseKey);
    const keysOfParser = [...Object.keys(parser), 'advanced', 'var'];
    const varParser = Object.assign({}, DEFAULT_VAR_PARSER, userParseVar);
    const validator = Object.assign({}, DEFAULT_VALIDATOR, userValidateKey);
    const varValidator = Object.assign({}, DEFAULT_VAR_VALIDATOR, userValidateVar);

    return {parse, validateVar};

    function validateVar(varObject) {
      const state = {
        key: 'var',
        type: varObject.type,
        value: varObject.value,
        varResult: varObject
      };
      _validateVar(state);
    }

    function _validateVar(state) {
      const validate = typeof varValidator[state.type] === 'object' ?
        varValidator[state.type][state.key] : varValidator[state.type];
      if (validate) {
        validate(state);
      }
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
      state.varResult = result;

      parseWord(state);
      state.type = state.value;
      result.type = state.type;

      const doParse = typeof varParser[state.type] === 'object' ?
        varParser[state.type][state.key] : varParser[state.type];
      if (!doParse) {
        throw new ParseError({
          code: 'unknownVarType',
          message: `Unknown @${state.key} type: ${state.type}`,
          args: [state.key, state.type],
          index: state.index
        });
      }

      parseWord(state);
      result.name = state.value;

      parseString(state, true);
      result.label = state.value;

      state.valueIndex = state.lastIndex;
      doParse(state);
      _validateVar(state);
      result.default = state.value;
      if (!state.usercssData.vars) {
        state.usercssData.vars = {};
      }

      state.usercssData.vars[result.name] = result;
      if (state.key === 'advanced') {
        state.maybeUSO = true;
      }
    }

    function parse(text) {
      if (text.includes('\r')) {
        throw new TypeError("metadata includes invalid character: '\\r'");
      }

      const usercssData = {};
      const errors = [];

      const re = /@([\w-]+)[^\S\r\n]*/gm;
      const state = {
        index: 0,
        lastIndex: 0,
        text,
        usercssData,
        warn: err => errors.push(err)
      };

      // parse
      let match;
      while ((match = re.exec(text))) {
        state.index = match.index;
        state.lastIndex = re.lastIndex;
        state.key = match[1];
        state.shouldIgnore = false;

        collectErrors(() => {
          try {
            if (state.key === 'var' || state.key === 'advanced') {
              parseVar(state);
            } else {
              parseKey(state);
            }
          } catch (err) {
            if (err.index === undefined) {
              err.index = state.index;
            }

            throw err;
          }

          if (state.key !== 'var' && state.key !== 'advanced' && !state.shouldIgnore) {
            usercssData[state.key] = state.value;
          }
        }, allowErrors && errors);

        re.lastIndex = state.lastIndex;
      }

      if (state.maybeUSO && !usercssData.preprocessor) {
        usercssData.preprocessor = 'uso';
      }

      collectErrors(() => {
        const missing = mandatoryKeys.filter(k =>
          !Object.prototype.hasOwnProperty.call(usercssData, k) || !usercssData[k]
        );
        if (missing.length > 0) {
          throw new ParseError({
            code: 'missingMandatory',
            args: missing,
            message: `Missing metadata: ${missing.map(k => `@${k}`).join(', ')}`
          });
        }
      }, allowErrors && errors);

      return {
        metadata: usercssData,
        errors
      };
    }

    function parseKey(state) {
      let doParse = parser[state.key];
      if (!doParse) {
        if (unknownKey === 'assign') {
          doParse = parseStringToEnd;
        } else {
          eatLine(state);
          if (unknownKey === 'ignore') {
            state.shouldIgnore = true;
            return;
          }

          // TODO: Suggest the item with the smallest distance or even multiple results?
          // Implementation note: swtich to Levenshtein automaton variation.
          const MAX_EDIT = Math.log2(state.key.length);
          const maybeSuggestion = keysOfParser.find(metaKey => LevenshteinDistanceWithMax(metaKey, state.key, MAX_EDIT));

          // throw
          throw new ParseError({
            code: 'unknownMeta',
            args: [state.key, maybeSuggestion],
            message: `Unknown metadata: @${state.key}${maybeSuggestion ? `, did you mean @${maybeSuggestion}?` : ''}`,
            index: state.index
          });
        }
      }

      state.valueIndex = state.lastIndex;
      doParse(state);
      if (validator[state.key]) {
        validator[state.key](state);
      }
    }
  }

  function normalizeVersion(version) {
    // https://docs.npmjs.com/misc/semver#versions
    if (version[0] === 'v' || version[0] === '=') {
      return version.slice(1);
    }

    return version;
  }

  const _export_parse_ = function (text, options) {
      return createParser(options).parse(text);
    };

  function createStringifier({
    alignKeys = false,
    space = 2,
    format = 'stylus',
    stringifyKey: userStringifyKey = {},
    stringifyVar: userStringifyVar = {}
  } = {}) {
    function stringify(meta) {
      let varKey;
      if (format === 'stylus') {
        varKey = 'var';
      } else if (format === 'xstyle') {
        varKey = 'advanced';
      } else {
        throw new TypeError("options.format must be 'stylus' or 'xstyle'");
      }

      const lines = [];
      for (const key of Object.keys(meta)) {
        const value = meta[key];
        if (Object.prototype.hasOwnProperty.call(userStringifyKey, key)) {
          const result = userStringifyKey[key](value);
          if (Array.isArray(result)) {
            lines.push.apply(lines, result.map(v => [key, v]));
          } else {
            lines.push([key, result]);
          }
        } else if (key === 'vars') {
          for (const va of Object.values(value)) {
            lines.push([varKey, stringifyVar(va, format, userStringifyVar, space)]);
          }
        } else if (Array.isArray(value)) {
          for (const subLine of value) {
            lines.push([key, quoteIfNeeded(subLine)]);
          }
        } else {
          lines.push([key, quoteIfNeeded(value)]);
        }
      }

      const maxKeyLength = alignKeys ? Math.max.apply(null, lines.map(l => l[0].length)) : 0;
      return `/* ==UserStyle==\n${
      escapeComment(lines.map(([key, text]) => `@${key.padEnd(maxKeyLength)} ${text}`).join('\n'))
    }\n==/UserStyle== */`;
    }

    return {stringify};
  }

  function stringifyVar(va, format, userStringifyVar, space) {
    return `${vaType()} ${va.name} ${JSON.stringify(va.label)} ${vaDefault()}`;

    function vaType() {
      if (format === 'xstyle' && va.type === 'select') {
        return 'dropdown';
      }

      return va.type;
    }

    function vaDefault() {
      if (Object.prototype.hasOwnProperty.call(userStringifyVar, va.type)) {
        return userStringifyVar[va.type](va, format, space);
      }

      if (va.options) {
        if (format === 'stylus') {
          return JSON.stringify(va.options.reduce((object, opt) => {
            const isDefault = opt.name === va.default ? '*' : '';
            object[`${opt.name}:${opt.label}${isDefault}`] = opt.value;
            return object;
          }, {}), null, space);
        }

        return stringifyEOT(va.options, va.type === 'image', space);
      }

      if (va.type === 'text' && format === 'xstyle') {
        return JSON.stringify(va.default);
      }

      if (va.type === 'number' || va.type === 'range') {
        const output = [va.default, va.min, va.max, va.step];
        if (va.units) {
          output.push(va.units);
        }

        return JSON.stringify(output);
      }

      return va.default;
    }
  }

  function quoteIfNeeded(text) {
    if (typeof text === 'string' && text.includes('\n')) {
      return JSON.stringify(text);
    }

    return text;
  }

  function escapeComment(text) {
    return text.replace(/\*\//g, '*\\/');
  }

  function stringifyEOT(options, singleLine = false, space = 0) {
    const pad = typeof space === 'string' ? space : ' '.repeat(space);
    return `{\n${options.map(
    o => `${pad}${o.name} ${JSON.stringify(o.label)} ${oValue(o.value)}`
  ).join('\n')}\n}`;

    function oValue(value) {
      if (singleLine) {
        return JSON.stringify(value);
      }

      return `<<<EOT\n${value} EOT;`;
    }
  }

  const _export_stringify_ = function (meta, options) {
      return createStringifier(options).stringify(meta);
    };

  exports.ParseError = ParseError;
  exports.createParser = createParser;
  exports.createStringifier = createStringifier;
  exports.parse = _export_parse_;
  exports.stringify = _export_stringify_;
  exports.util = parseUtil;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

}({}));
