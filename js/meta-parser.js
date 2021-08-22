'use strict';

/* exported metaParser */
const metaParser = (() => {
  require(['/vendor/usercss-meta/usercss-meta.min']); /* global usercssMeta */
  const {createParser, ParseError} = usercssMeta;
  const PREPROCESSORS = new Set(['default', 'uso', 'stylus', 'less']);
  const options = {
    validateKey: {
      preprocessor: state => {
        if (!PREPROCESSORS.has(state.value)) {
          throw new ParseError({
            code: 'unknownPreprocessor',
            args: [state.value],
            index: state.valueIndex,
          });
        }
      },
    },
    validateVar: {
      select: state => {
        if (state.varResult.options.every(o => o.name !== state.value)) {
          throw new ParseError({
            code: 'invalidSelectValueMismatch',
            index: state.valueIndex,
          });
        }
      },
      color: state => {
        require(['/js/color/color-converter']); /* global colorConverter */
        const color = colorConverter.parse(state.value);
        if (!color) {
          throw new ParseError({
            code: 'invalidColor',
            args: [state.value],
            index: state.valueIndex,
          });
        }
        state.value = colorConverter.format(color);
      },
    },
  };
  const parser = createParser(options);
  const looseParser = createParser(Object.assign({}, options, {
    allowErrors: true,
    unknownKey: 'throw',
  }));

  return {

    lint: looseParser.parse,
    parse: parser.parse,

    nullifyInvalidVars(vars) {
      for (const va of Object.values(vars)) {
        if (va.value !== null) {
          try {
            parser.validateVar(va);
          } catch (err) {
            va.value = null;
          }
        }
      }
      return vars;
    },
  };
})();
