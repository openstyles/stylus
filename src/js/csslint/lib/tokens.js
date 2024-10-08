let i;
/**
 * Based on https://www.w3.org/TR/css3-syntax/#lexical
 * Each key is re-assigned to a sequential index, starting with EOF=0.
 * Each value is converted into {name:string, text?:string} and stored as Tokens[index],
 * e.g. AMP:'&' becomes AMP:1 and a new element is added at 1: {name:'AMP', text:'&'}.
 */
const Tokens = {__proto__: null};
/** EOF must be the first token */
export const EOF = (Tokens[i = 0] = {name: 'EOF'}, i);
export const AMP = (Tokens[++i] = {name: 'AMP', text: '&'}, i);
export const AT = (Tokens[++i] = {name: 'AT'}, i);
export const ATTR_EQ = (Tokens[++i] = {name: 'ATTR_EQ', text: ['|=', '~=', '^=', '*=', '$=']}, i);
/** CDO and CDC */
export const CDCO = (Tokens[++i] = {name: 'CDCO'}, i);
export const CHAR = (Tokens[++i] = {name: 'CHAR'}, i);
export const COLON = (Tokens[++i] = {name: 'COLON', text: ':'}, i);
/** Not using "+" and ">" which can be math ops */
export const COMBINATOR = (Tokens[++i] = {name: 'COMBINATOR', text: ['~', '||']}, i);
export const COMMA = (Tokens[++i] = {name: 'COMMA', text: ','}, i);
export const COMMENT = (Tokens[++i] = {name: 'COMMENT'}, i);
export const DELIM = (Tokens[++i] = {name: 'DELIM', text: '!'}, i);
export const DOT = (Tokens[++i] = {name: 'DOT', text: '.'}, i);
export const EQUALS = (Tokens[++i] = {name: 'EQUALS', text: '='}, i);
export const EQ_CMP = (Tokens[++i] = {name: 'EQ_CMP', text: ['>=', '<=']}, i);
export const FUNCTION = (Tokens[++i] = {name: 'FUNCTION'}, i);
export const GT = (Tokens[++i] = {name: 'GT', text: '>'}, i);
export const HASH = (Tokens[++i] = {name: 'HASH', text: '#'}, i);
export const IDENT = (Tokens[++i] = {name: 'IDENT'}, i);
export const INVALID = (Tokens[++i] = {name: 'INVALID'}, i);
export const LBRACE = (Tokens[++i] = {name: 'LBRACE', text: '{'}, i);
export const LBRACKET = (Tokens[++i] = {name: 'LBRACKET', text: '['}, i);
export const LPAREN = (Tokens[++i] = {name: 'LPAREN', text: '('}, i);
export const MINUS = (Tokens[++i] = {name: 'MINUS', text: '-'}, i);
export const PIPE = (Tokens[++i] = {name: 'PIPE', text: '|'}, i);
export const PLUS = (Tokens[++i] = {name: 'PLUS', text: '+'}, i);
export const RBRACE = (Tokens[++i] = {name: 'RBRACE', text: '}'}, i);
export const RBRACKET = (Tokens[++i] = {name: 'RBRACKET', text: ']'}, i);
export const RPAREN = (Tokens[++i] = {name: 'RPAREN', text: ')'}, i);
export const SEMICOLON = (Tokens[++i] = {name: 'SEMICOLON', text: ';'}, i);
export const STAR = (Tokens[++i] = {name: 'STAR', text: '*'}, i);
export const STRING = (Tokens[++i] = {name: 'STRING'}, i);
export const URANGE = (Tokens[++i] = {name: 'URANGE'}, i);
export const URI = (Tokens[++i] = {name: 'URI'}, i);
export const UVAR = (Tokens[++i] = {name: 'UVAR'}, i); /*[[userstyles-org-variable]]*/
export const WS = (Tokens[++i] = {name: 'WS'}, i);
// numbers
export const ANGLE = (Tokens[++i] = {name: 'ANGLE'}, i);
export const DIMENSION = (Tokens[++i] = {name: 'DIMENSION'}, i);
export const FLEX = (Tokens[++i] = {name: 'FLEX'}, i);
export const FREQUENCY = (Tokens[++i] = {name: 'FREQUENCY'}, i);
export const LENGTH = (Tokens[++i] = {name: 'LENGTH'}, i);
export const NUMBER = (Tokens[++i] = {name: 'NUMBER'}, i);
export const PCT = (Tokens[++i] = {name: 'PCT'}, i);
export const RESOLUTION = (Tokens[++i] = {name: 'RESOLUTION'}, i);
export const TIME = (Tokens[++i] = {name: 'TIME'}, i);

export const TokenIdByCode = [];

for (i in Tokens) {
  const token = Tokens[i];
  const {text} = token;
  Tokens[token.name] = i = +i;
  if (text) {
    for (const str of typeof text === 'string' ? [text] : text) {
      if (str.length === 1) TokenIdByCode[str.charCodeAt(0)] = i;
    }
  }
}

export default Tokens;
