export default class StringSource {

  constructor(text) {
    // https://www.w3.org/TR/css-syntax-3/#input-preprocessing
    this._break = (
      this.string = text.replace(/\r\n?|\f/g, '\n')
    ).indexOf('\n');
    this.line = 1;
    this.col = 1;
    this.offset = 0;
  }

  eof() {
    return this.offset >= this.string.length;
  }

  /** @return {number} */
  peek(distance = 1) {
    return this.string.charCodeAt(this.offset + distance - 1);
  }

  mark() {
    return (this._bookmark = {o: this.offset, l: this.line, c: this.col, b: this._break});
  }

  reset(b = this._bookmark) {
    if (b) {
      ({o: this.offset, l: this.line, c: this.col, b: this._break} = b);
      this._bookmark = null;
    }
  }

  /**
   * Reads characters that match either text or a regular expression and returns those characters.
   * If a match is found, the row and column are adjusted.
   * @param {RegExp} m - must be `sticky`
   * @param {boolean} [asRe]
   * @return {string|RegExpExecArray|void}
   */
  readMatch(m, asRe) {
    const res = (m.lastIndex = this.offset, m.exec(this.string));
    if (res) return (m = res[0]) && this.read(m.length, m) && (asRe ? res : m);
  }

  /** @param {number} code */
  readMatchCode(code) {
    if (code === this.string.charCodeAt(this.offset)) {
      return this.read();
    }
  }

  /** @param {string} m */
  readMatchStr(m) {
    const len = m.length;
    const {offset: i, string: str} = this;
    if (!len || str.charCodeAt(i) === m.charCodeAt(0) && (
      len === 1 ||
      str.charCodeAt(i + len - 1) === m.charCodeAt(len - 1) && str.substr(i, len) === m
    )) {
      return m && this.read(len, m);
    }
  }

  /**
   * Reads a given number of characters. If the end of the input is reached,
   * it reads only the remaining characters and does not throw an error.
   * @param {number} count The number of characters to read.
   * @param {string} [text] Use an already extracted text and only increment the cursor
   * @return {string}
   */
  read(count = 1, text) {
    let {offset: i, _break: br, string} = this;
    if (count <= 0 || text == null && !(text = string.substr(i, count))) return '';
    this.offset = i += (count = text.length); // may be less than requested
    if (i <= br || br < 0) {
      this.col += count;
    } else {
      let brPrev;
      let {line} = this;
      do ++line; while ((br = string.indexOf('\n', (brPrev = br) + 1)) >= 0 && br < i);
      this._break = br;
      this.line = line;
      this.col = i - brPrev;
    }
    return text;
  }

  /** @return {number|undefined} */
  readCode() {
    const c = this.string.charCodeAt(this.offset++);
    if (c === 10) {
      this.col = 1;
      this.line++;
      this._break = this.string.indexOf('\n', this.offset);
    } else if (c >= 0) { // fast NaN check
      this.col++;
    } else {
      this.offset--; // restore EOF
      return;
    }
    return c;
  }
}
