/* global usercssMeta colorConverter */
/* exported metaParser */
'use strict';

const metaParser = (() => {
  const {createParser, ParseError} = usercssMeta;
  const PREPROCESSORS = new Set(['default', 'uso', 'stylus', 'less']);
  const options = {
    validateKey: {
      preprocessor: state => {
        if (!PREPROCESSORS.has(state.value)) {
          throw new ParseError({
            code: 'unknownPreprocessor',
            args: [state.value],
            index: state.valueIndex
          });
        }
      }
    },
    validateVar: {
      select: state => {
        if (state.varResult.options.every(o => o.name !== state.value)) {
          throw new ParseError({
            code: 'invalidSelectValueMismatch',
            index: state.valueIndex
          });
        }
      },
      color: state => {
        const color = colorConverter.parse(state.value);
        if (!color) {
          throw new ParseError({
            code: 'invalidColor',
            args: [state.value],
            index: state.valueIndex
          });
        }
        state.value = colorConverter.format(color, 'rgb');
      }
    }
  };
  const parser = createParser(options);
  const looseParser = createParser(Object.assign({}, options, {allowErrors: true, unknownKey: 'throw'}));
  return {
    parse,
    lint,
    nullifyInvalidVars
  };

  function parse(text, indexOffset) {
    try {
      return parser.parse(text);
    } catch (err) {
      if (typeof err.index === 'number') {
        err.index += indexOffset;
      }
      throw err;
    }
  }

  function lint(text) {
    return looseParser.parse(text);
  }

  function nullifyInvalidVars(vars) {
    for (const va of Object.values(vars)) {
      if (va.value === null) {
        continue;
      }
      try {
        parser.validateVar(va);
      } catch (err) {
        va.value = null;
      }
    }
    return vars;
  }
})();
