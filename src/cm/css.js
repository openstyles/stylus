/**
 * CodeMirror, copyright (c) by Marijn Haverbeke and others
 * Distributed under an MIT license: https://codemirror.net/5/LICENSE
 * Modded by Stylus Team: switched to charCodeAt, Set, unicode in ids, keywords from csslint-mod
 */
/* eslint-disable no-shadow,one-var,one-var-declaration-per-line,prefer-const */
import CodeMirror from 'codemirror';
import * as cssData from './css-data';

const rxColon = /(?:\s+|\/\*(?:[^*]+|\*(?!\/))*(?:\*\/|$))*:/y;
const rxDocFuncUnquoted = /(?:url(?:-prefix)?|domain|regexp)\((?!['")])/iy;
const rxHexColor = /#[\da-f]{3}(?:[\da-f](?:[\da-f]{2}(?:[\da-f]{2})?)?)?/yi;
const rxNumberDigit = /\d*(?:\.\d*)?(?:e[-+]\d+)?(?:\w+|%)?/y;
const rxNumberDot = /\d+(?:e[-+]\d+)?(?:\w+|%)?/y;
const rxNumberSign = /(?:\d+(?:\.\d*)?|\.?\d+)(?:e[-+]\d+)?(?:\w+|%)?/y;
const rxUniAny = /[-\w\\\u00A1-\uFFFF]*/yu;
const rxUniVar = /-[-\w\\\u00A1-\uFFFF]*/yu;
const rxUniClass = /-?[_a-zA-Z\\\u00A1-\uFFFF][-\w\\\u00A1-\uFFFF]*/yu;
/**
 * @param {import('codemirror').StringStream} stream
 * @param {RegExp} rx - must be sticky
 * @param {boolean} [consume]
 * @return {RegExp}
 */
const stickyMatch = (stream, rx, consume = true) => {
  rx.lastIndex = stream.pos;
  rx = rx.exec(stream.string);
  if (rx && consume !== false) stream.pos += rx[0].length;
  return rx;
};

CodeMirror.defineMode('css', function (config, parserConfig) {
  const inline = parserConfig.inline;
  if (!parserConfig.propertyKeywords) parserConfig = CodeMirror.resolveMode('text/css');

  const indentUnit = config.indentUnit,
    tokenHooks = parserConfig.tokenHooks,
    documentTypes = parserConfig.documentTypes || new Set(),
    mediaTypes = parserConfig.mediaTypes || new Set(),
    mediaFeatures = parserConfig.mediaFeatures || new Set(),
    mediaValueKeywords = parserConfig.mediaValueKeywords || new Set(),
    propertyKeywords = parserConfig.propertyKeywords || new Set(),
    nonStandardPropertyKeywords = parserConfig.nonStandardPropertyKeywords || new Set(),
    fontProperties = parserConfig.fontProperties || new Set(),
    counterDescriptors = parserConfig.counterDescriptors || new Set(),
    colorKeywords = parserConfig.colorKeywords || new Set(),
    valueKeywords = parserConfig.valueKeywords || new Set(),
    allowNested = parserConfig.allowNested,
    lineComment = parserConfig.lineComment,
    supportsAtComponent = parserConfig.supportsAtComponent === true,
    highlightNonStandardPropertyKeywords = config.highlightNonStandardPropertyKeywords !== false;

  let type, override;

  // Tokenizers

  /**
   * @param {import('codemirror').StringStream} stream
   * @param {{}} state
   */
  function tokenBase(stream, state) {
    let res;
    const str = stream.string;
    const c = str.charCodeAt(stream.pos);
    const pos = stream.pos += c != null;
    if (tokenHooks[c]) {
      res = tokenHooks[c](stream, state);
      if (res === false) res = null;
    } else if (c === 64/* @ */ && stickyMatch(stream, /[-\w\\]+/y)) {
      res = 'def';
      type = stream.current();
    } else if (c === 61/* = */
    || (c === 126/* ~ */ || c === 124/* | */ || c === 42/* * */ || c === 36/* $ */)
    && str.charCodeAt(pos) === 61/* = */ && stream.pos++) {
      type = 'compare';
    } else if (c === 34/* " */ || c === 39/* ' */) {
      state.tokenize = tokenString(c);
      return state.tokenize(stream, state);
    } else if (c === 35/* # */) {
      stickyMatch(stream, rxUniAny);
      res = 'atom';
      type = 'hash';
    } else if (c === 33/* ! */) {
      stickyMatch(stream, /\s*\w*/y);
      res = 'keyword';
      type = 'important';
    } else if (c === 46/* . */ ? stickyMatch(stream, rxNumberDot)
      : c === 43/* + */ || c === 45/* - */ ? stickyMatch(stream, rxNumberSign)
      : c >= 48 && c <= 57 /* 0-9 */ && stickyMatch(stream, rxNumberDigit)) {
      res = 'number';
      type = 'unit';
    } else if (c === 45/* - */) {
      if (stickyMatch(stream, rxUniVar)) {
        res = 'variable-2';
        type = stickyMatch(stream, rxColon, false) ? 'variable-definition' : 'variable';
      } else if (stickyMatch(stream, /\w+-/y)) {
        res = type = 'meta';
      } else {
        type = null;
      }
    } else if (c === 44/* , */ || c === 43/* + */ || c === 62/* > */ || c === 47/* / */) {
      type = 'select-op';
    } else if (c === 46/* . */ && stickyMatch(stream, rxUniClass)) {
      res = type = 'qualifier';
    } else if (c === 58/* : */ || c === 59/* ; */ || c === 123/* { */ || c === 125/* } */
    || c === 91/* [ */ || c === 93/* ] */ || c === 40/* ( */ || c === 41/* ) */) {
      type = String.fromCharCode(c);
    } else if (c === 45/* - */ || c === 92/* \ */ || c >= 48 && c <= 57 /* 0-9 */ || c === 95/* _ */
    || c >= 65 && c <= 90/* A-Z */ || c >= 97 && c <= 122/* a-z */ || c > 160/* Unicode */) {
      stickyMatch(stream, rxUniAny);
      if (str.charCodeAt(res = stream.pos) === 40/* ( */) {
        res -= pos - 1;
        if ((
          res === 6 ? /*domain*/c === 100 || c === 68 || /*regexp*/c === 114 || c === 82
          : res === 3 /*url*/ || res === 10 /*url-prefix*/ && (c === 117 || c === 85)
        ) && (
          rxDocFuncUnquoted.lastIndex = pos - 1,
          rxDocFuncUnquoted.test(str)
        )) state.tokenize = tokenParenthesized;
        res = 'variable callee';
        type = 'variable';
      } else {
        res = 'property';
        type = 'word';
      }
    } else {
      type = null;
    }
    return res;
  }

  function tokenString(quote) {
    return function (stream, state) {
      let escaped, c;
      while ((c = stream.string.charCodeAt(stream.pos)) >= 0 /* anti-NaN */) {
        stream.pos++;
        if (c === quote && !escaped) {
          if (quote === 41/* ) */) stream.pos--;
          break;
        }
        escaped = !escaped && c === 92/* \ */;
      }
      if (c === quote || !escaped && quote !== 41/* ) */) state.tokenize = null;
      type = 'string';
      return type;
    };
  }

  function tokenParenthesized(stream, state) {
    stream.pos++; // Must be '('
    state.tokenize = tokenString(41/* ) */);
    type = '(';
  }

  // Context management

  function Context(type, indent, prev) {
    this.type = type;
    this.indent = indent;
    this.prev = prev;
  }

  function pushContext(state, stream, type, indent) {
    state.context = new Context(type, stream.indentation() + (indent === false ? 0 : indentUnit),
      state.context);
    return type;
  }

  function popContext(state) {
    if (state.context.prev) {
      state.context = state.context.prev;
    }
    return state.context.type;
  }

  function pass(type, stream, state) {
    return states[state.context.type](type, stream, state);
  }

  function popAndPass(type, stream, state, n) {
    for (let i = n || 1; i > 0; i--) {
      state.context = state.context.prev;
    }
    return pass(type, stream, state);
  }

  // Parser

  function wordAsValue(stream) {
    const word = stream.current().toLowerCase();
    if (valueKeywords.has(word)) {
      override = 'atom';
    } else if (colorKeywords.has(word)) {
      override = 'keyword';
    } else {
      override = 'variable';
    }
  }

  const states = {};

  states.top = function (type, stream, state) {
    if (type === '{') {
      return pushContext(state, stream, 'block');
    } else if (type === '}' && state.context.prev) {
      return popContext(state);
    } else if (supportsAtComponent && /@component/i.test(type)) {
      return pushContext(state, stream, 'atComponentBlock');
    } else if (/^@(-moz-)?document$/i.test(type)) {
      return pushContext(state, stream, 'documentTypes');
    } else if (/^@(media|supports|(-moz-)?document|import)$/i.test(type)) {
      return pushContext(state, stream, 'atBlock');
    } else if (/^@(font-face|counter-style)/i.test(type)) {
      state.stateArg = type;
      return 'restricted_atBlock_before';
    } else if (/^@(-(moz|ms|o|webkit)-)?keyframes$/i.test(type)) {
      return 'keyframes';
    } else if (type && type.charAt(0) === '@') {
      return pushContext(state, stream, 'at');
    } else if (type === 'hash') {
      override = 'builtin';
    } else if (type === 'word') {
      override = 'tag';
    } else if (type === 'variable-definition') {
      return 'maybeprop';
    } else if (type === 'interpolation') {
      return pushContext(state, stream, 'interpolation');
    } else if (type === ':') {
      return 'pseudo';
    } else if (allowNested && type === '(') {
      return pushContext(state, stream, 'parens');
    }
    return state.context.type;
  };

  states.block = function (type, stream, state) {
    if (type === 'word') {
      const word = stream.current().toLowerCase();
      if (propertyKeywords.has(word)) {
        override = 'property';
        return 'maybeprop';
      } else if (nonStandardPropertyKeywords.has(word)) {
        override = highlightNonStandardPropertyKeywords ? 'string-2' : 'property';
        return 'maybeprop';
      } else if (allowNested) {
        override = stickyMatch(stream, /\s*:(?:\s|$)/y, false) ? 'property' : 'tag';
        return 'block';
      } else {
        override += ' error';
        return 'maybeprop';
      }
    } else if (type === 'meta') {
      return 'block';
    } else if (!allowNested && (type === 'hash' || type === 'qualifier')) {
      override = 'error';
      return 'block';
    } else {
      return states.top(type, stream, state);
    }
  };

  states.maybeprop = function (type, stream, state) {
    if (type === ':') return pushContext(state, stream, 'prop');
    return pass(type, stream, state);
  };

  states.prop = function (type, stream, state) {
    if (type === ';') return popContext(state);
    if (type === '{' && allowNested) return pushContext(state, stream, 'propBlock');
    if (type === '}' || type === '{') return popAndPass(type, stream, state);
    if (type === '(') return pushContext(state, stream, 'parens');

    if (type === 'hash') {
      rxHexColor.lastIndex = stream.start;
      if (!rxHexColor.exec(stream.string) || rxHexColor.lastIndex !== stream.pos)
        override += ' error';
    } else if (type === 'word') {
      wordAsValue(stream);
    } else if (type === 'interpolation') {
      return pushContext(state, stream, 'interpolation');
    }
    return 'prop';
  };

  states.propBlock = function (type, _stream, state) {
    if (type === '}') return popContext(state);
    if (type === 'word') {
      override = 'property';
      return 'maybeprop';
    }
    return state.context.type;
  };

  states.parens = function (type, stream, state) {
    if (type === '{' || type === '}') return popAndPass(type, stream, state);
    if (type === ')') return popContext(state);
    if (type === '(') return pushContext(state, stream, 'parens');
    if (type === 'interpolation') return pushContext(state, stream, 'interpolation');
    if (type === 'word') wordAsValue(stream);
    return 'parens';
  };

  states.pseudo = function (type, stream, state) {
    if (type === 'meta') return 'pseudo';

    if (type === 'word') {
      override = 'variable-3';
      return state.context.type;
    }
    return pass(type, stream, state);
  };

  states.documentTypes = function (type, stream, state) {
    if (type === 'word' && documentTypes.has(stream.current())) {
      override = 'tag';
      return state.context.type;
    } else {
      return states.atBlock(type, stream, state);
    }
  };

  states.atBlock = function (type, stream, state) {
    if (type === '(') return pushContext(state, stream, 'atBlock_parens');
    if (type === '}' || type === ';') return popAndPass(type, stream, state);
    if (type === '{') {
      return popContext(state) &&
        pushContext(state, stream, allowNested ? 'block' : 'top');
    }

    if (type === 'interpolation') return pushContext(state, stream, 'interpolation');

    if (type === 'word') {
      const word = stream.current().toLowerCase();
      if (word === 'only' || word === 'not' || word === 'and' || word === 'or') {
        override = 'keyword';
      } else if (mediaTypes.has(word)) {
        override = 'attribute';
      } else if (mediaFeatures.has(word)) {
        override = 'property';
      } else if (mediaValueKeywords.has(word)) {
        override = 'keyword';
      } else if (propertyKeywords.has(word)) {
        override = 'property';
      } else if (nonStandardPropertyKeywords.has(word)) {
        override = highlightNonStandardPropertyKeywords ? 'string-2' : 'property';
      } else if (valueKeywords.has(word)) {
        override = 'atom';
      } else if (colorKeywords.has(word)) {
        override = 'keyword';
      } else {
        override = 'error';
      }
    }
    return state.context.type;
  };

  states.atComponentBlock = function (type, stream, state) {
    if (type === '}') {
      return popAndPass(type, stream, state);
    }
    if (type === '{') {
      return popContext(state) && pushContext(state, stream, allowNested ? 'block' : 'top', false);
    }
    if (type === 'word') {
      override = 'error';
    }
    return state.context.type;
  };

  states.atBlock_parens = function (type, stream, state) {
    if (type === ')') return popContext(state);
    if (type === '{' || type === '}') return popAndPass(type, stream, state, 2);
    return states.atBlock(type, stream, state);
  };

  states.restricted_atBlock_before = function (type, stream, state) {
    if (type === '{') {
      return pushContext(state, stream, 'restricted_atBlock');
    }
    if (type === 'word' && state.stateArg === '@counter-style') {
      override = 'variable';
      return 'restricted_atBlock_before';
    }
    return pass(type, stream, state);
  };

  states.restricted_atBlock = function (type, stream, state) {
    if (type === '}') {
      state.stateArg = null;
      return popContext(state);
    }
    if (type === 'word') {
      if ((state.stateArg === '@font-face' &&
          !fontProperties.has(stream.current().toLowerCase())) ||
        (state.stateArg === '@counter-style' &&
          !counterDescriptors.has(stream.current().toLowerCase()))) {
        override = 'error';
      } else {
        override = 'property';
      }
      return 'maybeprop';
    }
    return 'restricted_atBlock';
  };

  states.keyframes = function (type, stream, state) {
    if (type === 'word') {
      override = 'variable';
      return 'keyframes';
    }
    if (type === '{') return pushContext(state, stream, 'top');
    return pass(type, stream, state);
  };

  states.at = function (type, stream, state) {
    if (type === ';') return popContext(state);
    if (type === '{' || type === '}') return popAndPass(type, stream, state);
    if (type === 'word') {
      override = 'tag';
    } else if (type === 'hash') override = 'builtin';
    return 'at';
  };

  states.interpolation = function (type, stream, state) {
    if (type === '}') return popContext(state);
    if (type === '{' || type === ';') return popAndPass(type, stream, state);
    if (type === 'word') {
      override = 'variable';
    } else if (type !== 'variable' && type !== '(' && type !== ')') override = 'error';
    return 'interpolation';
  };

  return {
    startState: function (base) {
      return {
        tokenize: null,
        state: inline ? 'block' : 'top',
        stateArg: null,
        context: new Context(inline ? 'block' : 'top', base || 0, null),
      };
    },

    token: function (stream, state) {
      if (!state.tokenize && stream.eatSpace()) return null;
      let style = (state.tokenize || tokenBase)(stream, state);
      if (style && typeof style === 'object') {
        type = style[1];
        style = style[0];
      }
      override = style;
      if (type !== 'comment') {
        state.state = states[state.state](type, stream, state);
      }
      return override;
    },

    indent: function (state, textAfter) {
      let cx = state.context, ch = textAfter && textAfter.charAt(0);
      let indent = cx.indent;
      if (cx.type === 'prop' && (ch === '}' || ch === ')')) cx = cx.prev;
      if (cx.prev) {
        if (ch === '}' && (cx.type === 'block' || cx.type === 'top' ||
          cx.type === 'interpolation' || cx.type === 'restricted_atBlock')) {
          // Resume indentation from parent context.
          cx = cx.prev;
          indent = cx.indent;
        } else if (ch === ')' && (cx.type === 'parens' || cx.type === 'atBlock_parens') ||
          ch === '{' && (cx.type === 'at' || cx.type === 'atBlock')) {
          // Dedent relative to current context.
          indent = Math.max(0, cx.indent - indentUnit);
        }
      }
      return indent;
    },

    electricChars: '}',
    blockCommentStart: '/*',
    blockCommentEnd: '*/',
    blockCommentContinue: ' * ',
    lineComment,
    fold: 'brace',
  };
});

const keywords = {
  colorKeywords: new Set(cssData.colorKeywords),
  counterDescriptors: new Set(cssData.counterDescriptors),
  documentTypes: new Set(cssData.documentTypes),
  fontProperties: new Set(cssData.fontProperties),
  mediaFeatures: new Set(cssData.mediaFeatures),
  mediaTypes: new Set(cssData.mediaTypes),
  mediaValueKeywords: new Set(cssData.mediaValueKeywords),
  nonStandardPropertyKeywords: new Set(cssData.nonStandardPropertyKeywords),
  propertyKeywords: new Set(cssData.propertyKeywords),
  valueKeywords: new Set(cssData.valueKeywords),
};

CodeMirror.registerHelper('hintWords', 'css', [
  ...cssData.colorKeywords,
  ...cssData.documentTypes,
  ...cssData.mediaFeatures,
  ...cssData.mediaTypes,
  ...cssData.mediaValueKeywords,
  ...cssData.nonStandardPropertyKeywords,
  ...cssData.propertyKeywords,
  ...cssData.valueKeywords,
]);

function hookLineComment(stream, state) {
  const c = stream.string.charCodeAt(stream.pos);
  if (c === 47/* / */) {
    stream.skipToEnd();
    return ['comment', 'comment'];
  } else if (c === 42/* * */) {
    stream.pos++;
    state.tokenize = tokenCComment;
    return tokenCComment(stream, state);
  } else {
    return ['operator', 'operator'];
  }
}

function tokenCComment(stream, state) {
  let maybeEnd = false, ch;
  while ((ch = stream.next()) != null) {
    if (maybeEnd && ch === '/') {
      state.tokenize = null;
      break;
    }
    maybeEnd = (ch === '*');
  }
  return ['comment', 'comment'];
}

CodeMirror.defineMIME('text/css', {
  ...keywords,
  tokenHooks: {
    47/* / */: function (stream, state) {
      if (stream.string.charCodeAt(stream.pos) !== 42/* * */)
        return false;
      stream.pos++;
      state.tokenize = tokenCComment;
      return tokenCComment(stream, state);
    },
  },
  name: 'css',
});

CodeMirror.defineMIME('text/x-scss', {
  ...keywords,
  allowNested: true,
  lineComment: '//',
  tokenHooks: {
    47/* / */: hookLineComment,
    58/* : */: function (stream) {
      if (stickyMatch(stream, /\s*\{/y, false)) {
        return [null, null];
      }
      return false;
    },
    36/* $ */: function (stream) {
      stickyMatch(stream, /[\w-]+/y);
      if (stickyMatch(stream, /\s*:/y, false)) {
        return ['variable-2', 'variable-definition'];
      }
      return ['variable-2', 'variable'];
    },
    35/* # */: function (stream) {
      if (stream.string.charCodeAt(stream.pos) !== 123/* { */)
        return false;
      stream.pos++;
      return [null, 'interpolation'];
    },
  },
  name: 'css',
  helperType: 'scss',
});

CodeMirror.defineMIME('text/x-less', {
  ...keywords,
  allowNested: true,
  lineComment: '//',
  tokenHooks: {
    47/* / */: hookLineComment,
    64/* @ */: function (stream) {
      if (stream.string.charCodeAt(stream.pos) === 123/* { */) {
        stream.pos++;
        return [null, 'interpolation'];
      }
      if (stickyMatch(stream, /(?:charset|(?:-moz-)?document|font-face|import|(?:-(?:moz|ms|o|webkit)-)?keyframes|media|namespace|page|supports)\b/iy, false)) {
        return false;
      }
      stickyMatch(stream, /[\w\\-]/y);
      if (stickyMatch(stream, /\s*:/y, false)) {
        return ['variable-2', 'variable-definition'];
      }
      return ['variable-2', 'variable'];
    },
    38/* & */: function () {
      return ['atom', 'atom'];
    },
  },
  name: 'css',
  helperType: 'less',
});

CodeMirror.defineMIME('text/x-gss', {
  ...keywords,
  supportsAtComponent: true,
  tokenHooks: {
    47/* / */: function (stream, state) {
      if (stream.string.charCodeAt(stream.pos) !== 42/* * */)
        return false;
      stream.pos++;
      state.tokenize = tokenCComment;
      return tokenCComment(stream, state);
    },
  },
  name: 'css',
  helperType: 'gss',
});
