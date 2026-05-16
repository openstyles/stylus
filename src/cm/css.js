/**
 * CodeMirror, copyright (c) by Marijn Haverbeke and others
 * Distributed under an MIT license: https://codemirror.net/5/LICENSE
 * Modded by Stylus Team: switched to charCodeAt, Set, unicode in ids, keywords from csslint-mod
 */
import {showUnhandledError} from '@/js/dom-init';
/* eslint-disable no-shadow,one-var,one-var-declaration-per-line,prefer-const */
import CodeMirror from 'codemirror';
import * as cssData from './css-data';

const kAllowNested = 'allowNested';
const kAtom = 'atom';
const kBlock = 'block';
const kComment = 'comment';
const kError = 'error';
const kHash = 'hash';
const kInterpolation = 'interpolation';
const kKeyframes = 'keyframes';
const kKeyword = 'keyword';
const kLineComment = 'lineComment';
const kMaybeProp = 'maybeprop';
const kOperator = 'operator';
const kProperty = 'property';
const kRestrictedAtBlock = 'restricted_atBlock';
const kRestrictedAtBlockBefore = 'restricted_atBlock_before';
const kTokenHooks = 'tokenHooks';
const kVariable = 'variable';
const kVariable2 = 'variable-2';
const kVariableDefinition = 'variable-definition';
const kWord = 'word';
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
const rxColon = /(?:\s+|\/\*(?:[^*]+|\*(?!\/))*(?:\*\/|$))*:/y;
const rxDocFunc = /(?:url(?:-prefix)?|domain|regexp)\(\s*(['")])?/iy;
const rxHexColor = /#[\da-f]{3}(?:[\da-f](?:[\da-f]{2}(?:[\da-f]{2})?)?)?/yi;
const rxNumberDigit = /\d*(?:\.\d*)?(?:e[-+]\d+)?(?:\w+|%)?/y;
const rxNumberDot = /\d+(?:e[-+]\d+)?(?:\w+|%)?/y;
const rxNumberSign = /(?:\d+(?:\.\d*)?|\.?\d+)(?:e[-+]\d+)?(?:\w+|%)?/y;
const rxSpace = /[\s\u00a0]+/y;
const rxSpaceRParenEOL = /[\s\u00a0]*(?=\)|$)/y;
const rxStringDoubleQ = /\s*(?:[^\\"]+|\\(?:[0-9a-fA-F]{1,6}\s?|.|$))*/y;
const rxStringSingleQ = /\s*(?:[^\\']+|\\(?:[0-9a-fA-F]{1,6}\s?|.|$))*/y;
const rxUniAny = /[-\w\\\u00A1-\uFFFF]*/y;
const rxUniVar = /-[-\w\\\u00A1-\uFFFF]*/y;
const rxUniClass = /-?[_a-zA-Z\\\u00A1-\uFFFF][-\w\\\u00A1-\uFFFF]*/y;
const rxUnquotedUrl = /\s*(?:[^()\s\\'"]+|\\(?:[0-9a-fA-F]{1,6}\s?|.|$))*\s*/y;
const rxUnquotedBadUrl = /(?:[^)\\]|\\[^)])+/y;
const states = {};
/**
 * @param {CodeMirror.StringStream} stream
 * @param {RegExp} rx - must be sticky
 * @param {boolean} [consume]
 * @return {boolean}
 */
const stickyMatch = (stream, rx, consume = true) => {
  rx.lastIndex = stream.pos;
  return rx.test(stream.string) && (consume && (stream.pos = rx.lastIndex), true);
};

let rxAtRules;
let tokenStringDouble, tokenStringSingle, tokenUrl, tokenUrlEnd, tokenBadUrl;

// TODO: patch `eatWhile` and `match` + use WeakMap for converted non-sticky regexps
CodeMirror.StringStream.prototype.eatSpace = function () {
  rxSpace.lastIndex = this.pos;
  return rxSpace.test(this.string) && !!(this.pos = rxSpace.lastIndex);
};

CodeMirror.defineMode('css', (config, parserConfig) => {
  const inline = parserConfig.inline;
  if (!parserConfig.propertyKeywords) parserConfig = CodeMirror.resolveMode('text/css');

  const indentUnit = config.indentUnit,
    tokenHooks = parserConfig[kTokenHooks],
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
    allowNested = parserConfig[kAllowNested],
    lineComment = parserConfig[kLineComment],
    supportsAtComponent = parserConfig.supportsAtComponent === true,
    highlightNonStandardPropertyKeywords = config.highlightNonStandardPropertyKeywords !== false;

  let type, override;
  let prevStream;
  let prevCounter = 0;

  // Tokenizers

  /**
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  function tokenBase(stream, state) {
    let res;
    const str = stream.string;
    const pos = ++stream.pos; // advance stream
    const c = str.charCodeAt(pos - 1);
    const hook = tokenHooks.get(c);
    if (hook) {
      res = hook(stream, state);
      if (res === false) res = null;
    } else if (c === 64/* @ */ && stickyMatch(stream, /[-\w\\]+/y)) {
      res = 'def';
      type = stream.current().toLowerCase();
    } else if (c === 61/* = */
    || (c === 126/* ~ */ || c === 124/* | */ || c === 42/* * */ || c === 36/* $ */)
    && str.charCodeAt(pos) === 61/* = */ && stream.pos++) {
      type = 'compare';
    } else if (
      c === 34/* " */ ? res = tokenStringDouble ??= tokenString.bind(rxStringDoubleQ, c)
        : c === 39/* ' */ && (res = tokenStringSingle ??= tokenString.bind(rxStringSingleQ, c))) {
      state.tokenize = res;
      return state.tokenize(stream, state);
    } else if (c === 35/* # */) {
      stickyMatch(stream, rxUniAny);
      res = kAtom;
      type = kHash;
    } else if (c === 33/* ! */) {
      stickyMatch(stream, /\s*\w*/y);
      res = kKeyword;
      type = 'important';
    } else if (c === 46/* . */ ? stickyMatch(stream, rxNumberDot)
      : c === 43/* + */ || c === 45/* - */ ? stickyMatch(stream, rxNumberSign)
      : c >= 48 && c <= 57 /* 0-9 */ && stickyMatch(stream, rxNumberDigit)) {
      res = 'number';
      type = 'unit';
    } else if (c === 45/* - */) {
      if (stickyMatch(stream, rxUniVar)) {
        res = kVariable2;
        type = stickyMatch(stream, rxColon, false) ? kVariableDefinition : kVariable;
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
          rxDocFunc.lastIndex = pos - 1,
          (res = rxDocFunc.exec(str)) && !res[1]
        )) state.tokenize = tokenParenthesized;
        res = 'variable callee';
        type = kVariable;
      } else {
        res = kProperty;
        type = kWord;
      }
    } else {
      type = null;
    }
    return res;
  }

  /**
   * @this {RegExp}
   * @param {number} quote - bound param
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  function tokenString(quote, stream, state) {
    type = !stickyMatch(stream, this) || this === rxUnquotedBadUrl ? kError : 'string';
    let tokenize;
    const {string: str, pos} = stream;
    const next = str.charCodeAt(pos);
    if (next === quote) {
      if (quote !== 41/* ) */)
        stream.pos++;
    } else if (next >= 0 /* not NaN */) {
      if (quote === 41) {
        tokenize = tokenBadUrl ??= tokenString.bind(rxUnquotedBadUrl, 41/* ) */);
      } else {
        type = kError;
      }
    } else if (quote === 41) {
      tokenize = tokenUrlEnd ??= tokenString.bind(rxSpaceRParenEOL, 41/* ) */);
    } else if (str.charCodeAt(pos - 1) !== 92/* \ */) {
      type = kError;
    } else {
      return type;
    }
    state.tokenize = tokenize;
    return type;
  }

  /**
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  function tokenParenthesized(stream, state) {
    stream.pos++; // Must be '('
    state.tokenize = tokenUrl ??= tokenString.bind(rxUnquotedUrl, 41/* ) */);
    type = '(';
  }

  // Context management

  function Context(type, indent, prev) {
    this.type = type;
    this.indent = indent;
    this.prev = prev;
  }

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   * @param {boolean} [indent=true]
   */
  function pushContext(state, stream, type, indent) {
    state.context = new Context(type, stream.indentation() + (indent === false ? 0 : indentUnit),
      state.context);
    return type;
  }

  /** @param {CodeMirror.CSS.State} state */
  function popContext(state) {
    if (state.context.prev) {
      state.context = state.context.prev;
    }
    return state.context.type;
  }

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  function pass(type, stream, state) {
    return states[state.context.type](type, stream, state);
  }

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   * @param {number} [n=1]
   */
  function popAndPass(type, stream, state, n) {
    for (let i = n || 1; i > 0; i--) {
      state.context = state.context.prev;
    }
    return pass(type, stream, state);
  }

  // Parser

  /** @param {CodeMirror.StringStream} stream */
  function wordAsValue(stream) {
    const word = stream.current().toLowerCase();
    if (valueKeywords.has(word)) {
      override = kAtom;
    } else if (colorKeywords.has(word)) {
      override = kKeyword;
    } else {
      override = kVariable;
    }
  }

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.top = (type, stream, state) => {
    switch (type) {
      case '{':
        return pushContext(state, stream, kBlock);
      case '}':
        return state.context.prev ? popContext(state) : state.context.type;
      case kHash:
        override = 'builtin';
        break;
      case kWord:
        override = 'tag';
        break;
      case kVariableDefinition:
        return kMaybeProp;
      case kInterpolation:
        return pushContext(state, stream, kInterpolation);
      case ':':
        return 'pseudo';
      case '(':
        if (allowNested) return pushContext(state, stream, 'parens');
        break;
      case '@component':
        return pushContext(state, stream, supportsAtComponent ? 'atComponentBlock' : 'at');
      case '@document':
      case '@-moz-document':
        return pushContext(state, stream, 'documentTypes');
      case '@import':
      case '@media':
      case '@page':
      case '@supports':
      case '@starting-style':
      case '@view-transition':
        return pushContext(state, stream, 'atBlock');
      case '@counter-style':
      case '@container':
      case '@font-face':
      case '@font-palette-values':
      case '@function':
      case '@property':
        state.stateArg = type;
        return kRestrictedAtBlockBefore;
      case '@keyframes':
      case '@-moz-keyframes':
      case '@-ms-keyframes':
      case '@-o-keyframes':
      case '@-webkit-keyframes':
        return kKeyframes;
      default:
        if (type && type.charCodeAt(0) === 64/* @ */)
          return pushContext(state, stream, 'at');
    }
    return state.context.type;
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states[kBlock] = (type, stream, state) => {
    switch (type) {
      case kWord:
        type = stream.current().toLowerCase();
        if (propertyKeywords.has(type)) {
          override = kProperty;
          type = kMaybeProp;
        } else if (nonStandardPropertyKeywords.has(type)) {
          override = highlightNonStandardPropertyKeywords ? 'string-2' : kProperty;
          type = kMaybeProp;
        } else if (allowNested) {
          override = stickyMatch(stream, /\s*:(?:\s|$)/y, false) ? kProperty : 'tag';
          type = kBlock;
        } else {
          override += ' ' + kError;
          type = kMaybeProp;
        }
        return type;
      case 'meta':
        return kBlock;
      case kHash:
      case 'qualifier':
        if (!allowNested) {
          override = kError;
          return kBlock;
        }
        // fallthrough to default
      default:
        return states.top(type, stream, state);
    }
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states[kMaybeProp] = (type, stream, state) =>
    type === ':'
      ? pushContext(state, stream, 'prop')
      : pass(type, stream, state);

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.prop = (type, stream, state) => {
    switch (type) {
      case ';':
        return popContext(state);
      case '{':
        if (allowNested) return pushContext(state, stream, 'propBlock');
        // fallthrough to '}'
      case '}':
        return popAndPass(type, stream, state);
      case '(':
        return pushContext(state, stream, 'parens');
      case kHash:
        rxHexColor.lastIndex = stream.start;
        if (!rxHexColor.exec(stream.string))
          override += ' ' + kError;
        break;
      case kWord:
        wordAsValue(stream);
        break;
      case kInterpolation:
        return pushContext(state, stream, kInterpolation);
    }
    return 'prop';
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.propBlock = (type, stream, state) => {
    switch (type) {
      case '}':
        return popContext(state);
      case kWord:
        override = kProperty;
        return kMaybeProp;
    }
    return state.context.type;
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.parens = (type, stream, state) => {
    switch (type) {
      case '{':
      case '}':
        return popAndPass(type, stream, state);
      case ')':
        return popContext(state);
      case '(':
        return pushContext(state, stream, 'parens');
      case kInterpolation:
        return pushContext(state, stream, kInterpolation);
      case kWord:
        wordAsValue(stream);
        break;
    }
    return 'parens';
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.pseudo = (type, stream, state) => {
    switch (type) {
      case 'meta':
        return 'pseudo';
      case kWord:
        override = 'variable-3';
        return state.context.type;
    }
    return pass(type, stream, state);
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.documentTypes = (type, stream, state) => {
    if (type === kWord && documentTypes.has(stream.current().toLowerCase())) {
      override = 'tag';
      return state.context.type;
    } else {
      return states.atBlock(type, stream, state);
    }
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.atBlock = (type, stream, state) => {
    switch (type) {
      case '(':
        return pushContext(state, stream, 'atBlock_parens');
      case '}':
      case ';':
        return popAndPass(type, stream, state);
      case '{':
        return popContext(state) && pushContext(state, stream, allowNested ? kBlock : 'top');
      case kInterpolation:
        return pushContext(state, stream, kInterpolation);
      case kWord: {
        const word = stream.current().toLowerCase();
        if (word === 'only' || word === 'not' || word === 'and' || word === 'or') {
          override = kKeyword;
        } else if (mediaTypes.has(word)) {
          override = 'attribute';
        } else if (mediaFeatures.has(word)) {
          override = kProperty;
        } else if (mediaValueKeywords.has(word)) {
          override = kKeyword;
        } else if (propertyKeywords.has(word)) {
          override = kProperty;
        } else if (nonStandardPropertyKeywords.has(word)) {
          override = highlightNonStandardPropertyKeywords ? 'string-2' : kProperty;
        } else if (valueKeywords.has(word)) {
          override = kAtom;
        } else if (colorKeywords.has(word)) {
          override = kKeyword;
        } else {
          override = kError;
        }
      }
    }
    return state.context.type;
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.atComponentBlock = (type, stream, state) => {
    switch (type) {
      case '}':
        return popAndPass(type, stream, state);
      case '{':
        return popContext(state) &&
          pushContext(state, stream, allowNested ? kBlock : 'top', false);
      case kWord:
        override = kError;
        break;
    }
    return state.context.type;
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.atBlock_parens = (type, stream, state) => {
    switch (type) {
      case ')':
        return popContext(state);
      case '{':
      case '}':
        return popAndPass(type, stream, state, 2);
    }
    return states.atBlock(type, stream, state);
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states[kRestrictedAtBlockBefore] = (type, stream, state) => {
    switch (type) {
      case '{':
        return pushContext(state, stream, kRestrictedAtBlock);
      case kWord:
        if (state.stateArg === '@counter-style') {
          override = kVariable;
          return kRestrictedAtBlockBefore;
        }
        break;
    }
    return pass(type, stream, state);
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states[kRestrictedAtBlock] = (type, stream, state) => {
    switch (type) {
      case '}':
        state.stateArg = null;
        return popContext(state);
      case kWord:
        type = state.stateArg;
        override = (
          type === '@font-face' ? !fontProperties.has(stream.current().toLowerCase())
            : type === '@counter-style' && !counterDescriptors.has(stream.current().toLowerCase())
        ) ? kError
          : kProperty;
        return kMaybeProp;
    }
    return kRestrictedAtBlock;
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.keyframes = (type, stream, state) => {
    switch (type) {
      case kWord:
        override = kVariable;
        return kKeyframes;
      case '{':
        return pushContext(state, stream, 'top');
    }
    return pass(type, stream, state);
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.at = (type, stream, state) => {
    switch (type) {
      case ';':
        return popContext(state);
      case '{':
      case '}':
        return popAndPass(type, stream, state);
      case kWord:
        override = 'tag';
        break;
      case kHash:
        override = 'builtin';
        break;
    }
    return 'at';
  };

  /**
   * @param {string} type
   * @param {CodeMirror.StringStream} stream
   * @param {CodeMirror.CSS.State} state
   */
  states.interpolation = (type, stream, state) => {
    switch (type) {
      case '}':
        return popContext(state);
      case '{':
      case ';':
        return popAndPass(type, stream, state);
      case kWord:
        override = kVariable;
        break;
      case kVariable:
      case '(':
      case ')':
        break;
      default:
        override = kError;
    }
    return kInterpolation;
  };

  return {
    /** @namespace CodeMirror.CSS.State */
    startState: base => ({
      tokenize: null,
      state: inline ? kBlock : 'top',
      stateArg: null,
      context: new Context(inline ? kBlock : 'top', base || 0, null),
    }),

    /**
     * @param {CodeMirror.StringStream} stream
     * @param {CodeMirror.CSS.State} state
     */
    token(stream, state) {
      const {tokenize} = state;
      const {pos} = stream;
      if (!tokenize && stream.eatSpace()) {
        override = null;
      } else {
        let style = (tokenize || tokenBase)(stream, state);
        if (style && typeof style === 'object') {
          type = style[1];
          style = style[0];
        }
        override = style;
        if (type !== kComment) {
          state.state = states[state.state](type, stream, state);
        }
      }
      if (stream.pos === stream.start) { // TODO: remove after finding out the culprit
        // CM calls token() 10 times before giving up
        if (prevStream !== stream) {
          prevStream = stream;
          prevCounter = 0;
        } else if (++prevCounter === 9) {
          stream.pos = stream.string.length; // pacify CM by butchering this line
          showUnhandledError(new Error(
            `cm/css.js did not advance stream at ${pos}, ${override}, ${type}: ${stream.string}`));
        }
      }
      return override;
    },

    indent(state, textAfter) {
      let cx = state.context, ch = textAfter && textAfter.charAt(0);
      let indent = cx.indent;
      if (cx.type === 'prop' && (ch === '}' || ch === ')')) cx = cx.prev;
      if (cx.prev) {
        if (ch === '}' && (cx.type === kBlock || cx.type === 'top' ||
          cx.type === kInterpolation || cx.type === kRestrictedAtBlock)) {
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
    [kLineComment]: lineComment,
    fold: 'brace',
  };
});

CodeMirror.registerHelper('hintWords', 'css', [
  ...cssData.atRules,
  ...cssData.colorKeywords,
  ...cssData.counterDescriptors,
  ...cssData.documentTypes,
  ...cssData.fontProperties,
  ...cssData.mediaFeatures,
  ...cssData.mediaTypes,
  ...cssData.mediaValueKeywords,
  ...cssData.nonStandardPropertyKeywords,
  ...cssData.propertyKeywords,
  ...cssData.pseudos,
  ...cssData.valueKeywords,
]);

/**
 * @param {CodeMirror.StringStream} stream
 * @param {CodeMirror.CSS.State} state
 */
function hookLineComment(stream, state) {
  const c = stream.string.charCodeAt(stream.pos);
  switch (c) {
    case 47/* / */:
      stream.skipToEnd();
      return [kComment, kComment];
    case 42/* * */:
      stream.pos++;
      state.tokenize = tokenCComment;
      return tokenCComment(stream, state);
    default:
      return [kOperator, kOperator];
  }
}

/**
 * @param {CodeMirror.StringStream} stream
 * @param {CodeMirror.CSS.State} state
 */
function tokenCComment(stream, state) {
  const str = stream.string;
  const i = str.indexOf('*/', stream.pos);
  stream.pos = i < 0 ? str.length : (state.tokenize = null, i);
  return [kComment, kComment];
}

CodeMirror.defineMIME('text/css', {
  ...keywords,
  [kAllowNested]: true,
  [kTokenHooks]: new Map([
    /**
     * @param {CodeMirror.StringStream} stream
     * @param {CodeMirror.CSS.State} state
     */
    [47/* / */, (stream, state) => {
      if (stream.string.charCodeAt(stream.pos) !== 42/* * */)
        return false;
      stream.pos++;
      state.tokenize = tokenCComment;
      return tokenCComment(stream, state);
    }],
  ]),
  name: 'css',
});

CodeMirror.defineMIME('text/x-scss', {
  ...keywords,
  [kAllowNested]: true,
  [kLineComment]: '//',
  [kTokenHooks]: new Map([
    [47/* / */, hookLineComment],
    [58/* : */, stream => {
      if (stickyMatch(stream, /\s*\{/y, false)) {
        return [null, null];
      }
      return false;
    }],
    [36/* $ */, stream => {
      stickyMatch(stream, /[\w-]+/y);
      if (stickyMatch(stream, /\s*:/y, false)) {
        return [kVariable2, kVariableDefinition];
      }
      return [kVariable2, kVariable];
    }],
    /** @param {CodeMirror.StringStream} stream */
    [35/* # */, stream => {
      if (stream.string.charCodeAt(stream.pos) !== 123/* { */)
        return false;
      stream.pos++;
      return [null, kInterpolation];
    }],
  ]),
  name: 'css',
  helperType: 'scss',
});

CodeMirror.defineMIME('text/x-less', {
  ...keywords,
  [kAllowNested]: true,
  [kLineComment]: '//',
  [kTokenHooks]: new Map([
    [47/* / */, hookLineComment],
    /** @param {CodeMirror.StringStream} stream */
    [64/* @ */, stream => {
      if (stream.string.charCodeAt(stream.pos) === 123/* { */) {
        stream.pos++;
        return [null, kInterpolation];
      }
      rxAtRules ??= new RegExp(
        String.raw`(?:-(?:moz|ms|o|webkit)-)?(?:${cssData.atRules.join('|')})(?![-\w\\])`, 'iy');
      if (stickyMatch(stream, rxAtRules, false)) {
        return false;
      }
      stickyMatch(stream, /[\w\\-]/y);
      if (stickyMatch(stream, /\s*:/y, false)) {
        return [kVariable2, kVariableDefinition];
      }
      return [kVariable2, kVariable];
    }],
    [38/* & */, () => [kAtom, kAtom]],
  ]),
  name: 'css',
  helperType: 'less',
});

CodeMirror.defineMIME('text/x-gss', {
  ...keywords,
  supportsAtComponent: true,
  [kTokenHooks]: new Map([
    /**
     * @param {CodeMirror.StringStream} stream
     * @param {CodeMirror.CSS.State} state
     */
    [47/* / */, (stream, state) => {
      if (stream.string.charCodeAt(stream.pos) !== 42/* * */)
        return false;
      stream.pos++;
      state.tokenize = tokenCComment;
      return tokenCComment(stream, state);
    }],
  ]),
  name: 'css',
  helperType: 'gss',
});
