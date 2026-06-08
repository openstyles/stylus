import {createParser, ParseError} from 'usercss-meta/dist/usercss-meta';
import * as colorConverter from '@/js/color/color-converter';

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
      if (!colorConverter.parse(state.value)) {
        throw new ParseError({
          code: 'invalidColor',
          args: [state.value],
          index: state.valueIndex,
        });
      }
    },
  },
};
const parser = createParser(options);
const looseParser = createParser(Object.assign({}, options, {
  allowErrors: true,
  unknownKey: 'throw',
}));

export const metaLint = looseParser.parse;
export const metaParse = parser.parse;
export const nullifyInvalidVars = vars => {
  for (const va of Object.values(vars)) {
    if (va.value !== null) {
      try {
        parser.validateVar(va);
      } catch {
        va.value = null;
      }
    }
  }
};
