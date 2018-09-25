/* global usercssMeta colorConverter */
'use strict';

// eslint-disable-next-line no-var
var metaParser = (() => {
  const parser = usercssMeta.createParser({
    validateVar: {
      select: state => {
        if (state.value !== null && state.varResult.options.every(o => o.name !== state.value)) {
          throw new Error('select value mismatch');
        }
      },
      color: state => {
        if (state.value !== null) {
          colorConverter.format(colorConverter.parse(state.value), 'rgb');
        }
      }
    }
  });
  return {parse, nullifyInvalidVars};

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
