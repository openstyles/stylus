export const GlobalKeywords = ['initial', 'inherit', 'revert', 'unset'];
export const {assign, defineProperty: define} = Object;
export const PDESC = {configurable: true, enumerable: true, writable: true, value: null};
export const isOwn = Object.call.bind({}.hasOwnProperty);
export const pick = (obj, keys, dst = {}) => {
  for (const k of keys) dst[k] = obj[k];
  return dst;
};
export const rxUnescapeLF = /\\(?:(?:([0-9a-fA-F]{1,6})|(.))[\t ]?|(\n))/g;
const unescapeLF = (m, code, char, LF) =>
  LF ? '' : char || String.fromCodePoint(parseInt(code, 16));
export const parseString = str => str.slice(1, -1).replace(rxUnescapeLF, unescapeLF);
export const toLowAscii = c => c >= 65 && c <= 90 ? c + 32 : c;

export class EventDispatcher {
  constructor() {
    /** @type {Record<string,Set>} */
    this._listeners = {__proto__: null};
  }
  addListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = new Set())).add(fn);
  }
  fire(event) {
    const type = typeof event === 'object' && event.type;
    const list = this._listeners[type || event];
    if (!list) return;
    if (!type) event = {type};
    list.forEach(fn => fn(event));
  }
  removeListener(type, fn) {
    const list = this._listeners[type];
    if (list) list.delete(fn);
  }
}

export class ParseError extends Error {
  constructor(message, pos) {
    super();
    this.name = this.constructor.name;
    this.col = pos.col;
    this.line = pos.line;
    this.offset = pos.offset;
    this.message = message;
  }
}

export function clipString(s, len = 30) {
  return (s = `${s}`).length > len ? s.slice(0, len) + '...' : s;
}
