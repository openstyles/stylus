const MAX_DURATION = 10 * 60e3;
const TRIM_DELAY = 10e3;
// all blocks since page load; key = text between block start and { inclusive
const data = new Map();
// nested block stack
const stack = [];
// performance.now() of the current parser
let generation = null;
// performance.now() of the first parser after reset or page load,
// used for weighted sorting in getBlock()
let generationBase = null;
let parser = null;
let stream = null;

/**
* Caches the results and reuses them on subsequent parsing of the same code
*/
export function init(newParser) {
  parser = newParser;
  if (!parser) {
    data.clear();
    stack.length = 0;
    generationBase = performance.now();
    return;
  }
  stream = parser.stream;
  generation = performance.now();
  trim();
}

export function addEvent(event) {
  if (!parser) return;
  for (let i = stack.length; --i >= 0;) {
    const {offset, offset2, events} = stack[i];
    if (event.offset >= offset && (!offset2 || event.offset <= offset2)) {
      events.push(event);
      return;
    }
  }
}

export function findBlock(token = getToken()) {
  if (!token || !stream) return;
  const src = stream.source;
  const {string} = src;
  const start = token.offset;
  const key = string.slice(start, string.indexOf('{', start) + 1);
  let block = data.get(key);
  if (!block || !(block = getBlock(block, string, start, key))) return;
  shiftBlock(block, start, token.line, token.col, string);
  src.offset = block.offset2;
  src.line = block.line2;
  src.col = block.col2;
  stream._resetBuf();
  return true;
}

export function startBlock(start = getToken()) {
  if (!start || !stream) return;
  stack.push({
    text: '',
    events: [],
    generation: generation,
    line: start.line,
    col: start.col,
    offset: start.offset,
    line2: undefined,
    col2: undefined,
    offset2: undefined,
  });
  return stack.length;
}

export function endBlock(end = getToken()) {
  if (!parser || !stream) return;
  const block = stack.pop();
  block.line2 = end.line;
  block.col2 = end.col + end.offset2 - end.offset;
  block.offset2 = end.offset2;
  const {string} = stream.source;
  const start = block.offset;
  const key = string.slice(start, string.indexOf('{', start) + 1);
  block.text = string.slice(start, block.offset2);
  let blocks = data.get(key);
  if (!blocks) data.set(key, (blocks = []));
  blocks.push(block);
}

export function cancelBlock(pos) {
  if (pos === stack.length) stack.length--;
}

export function feedback({messages}) {
  messages = new Set(messages);
  for (const blocks of data.values()) {
    for (const block of blocks) {
      if (!block.events.length) continue;
      if (block.generation !== generation) continue;
      const {line: L1, col: C1, line2: L2, col2: C2} = block;
      let isClean = true;
      for (const msg of messages) {
        const {line, col} = msg;
        if (L1 === L2 && line === L1 && C1 <= col && col <= C2 ||
          line === L1 && col >= C1 ||
          line === L2 && col <= C2 ||
          line > L1 && line < L2) {
          messages.delete(msg);
          isClean = false;
        }
      }
      if (isClean) block.events.length = 0;
    }
  }
}

/**
 * Removes old entries from the cache.
 * 'Old' means older than MAX_DURATION or half the blocks from the previous generation(s).
 * @param {Boolean} [immediately] - set internally when debounced by TRIM_DELAY
 */
function trim(immediately) {
  if (!immediately) {
    clearTimeout(trim.timer);
    trim.timer = setTimeout(trim, TRIM_DELAY, true);
    return;
  }
  const cutoff = performance.now() - MAX_DURATION;
  for (const [key, blocks] of data.entries()) {
    const halfLen = blocks.length >> 1;
    const newBlocks = blocks
      .sort((a, b) => a.time - b.time)
      .filter((b, i) => (b = b.generation) > cutoff || b !== generation && i < halfLen);
    if (!newBlocks.length) {
      data.delete(key);
    } else if (newBlocks.length !== blocks.length) {
      data.set(key, newBlocks);
    }
  }
}

// gets the matching block
function getBlock(blocks, input, start, key) {
  // extracted to prevent V8 deopt
  const keyLast = Math.max(key.length - 1);
  const check1 = input[start];
  const check2 = input[start + keyLast];
  const generationSpan = performance.now() - generationBase;
  blocks = blocks
    .filter(({text, offset, offset2}) =>
      text[0] === check1 &&
      text[keyLast] === check2 &&
      text[text.length - 1] === input[start + text.length - 1] &&
      text.startsWith(key) &&
      text === input.substr(start, offset2 - offset))
    .sort((a, b) =>
      // newest and closest will be the first element
      (a.generation - b.generation) / generationSpan +
      (Math.abs(a.offset - start) - Math.abs(b.offset - start)) / input.length);
  // identical blocks may produce different reports in CSSLint
  // so we need to either hijack an older generation block or make a clone
  const block = blocks.find(b => b.generation !== generation);
  return block || deepCopy(blocks[0]);
}

// Shifts positions of the block and its events, also fires the events
function shiftBlock(block, cursor, line, col, input) {
  // extracted to prevent V8 deopt
  const deltaLines = line - block.line;
  const deltaCols = block.col === 1 && col === 1 ? 0 : col - block.col;
  const deltaOffs = cursor - block.offset;
  const hasDelta = deltaLines || deltaCols || deltaOffs;
  const shifted = new Set();
  for (const e of block.events) {
    if (hasDelta) {
      applyDelta(e, shifted, block.line, deltaLines, deltaCols, deltaOffs, input);
    }
    parser.fire(e, false);
  }
  block.generation = generation;
  block.col2 += block.line2 === block.line ? deltaCols : 0;
  block.line2 += deltaLines;
  block.offset2 = cursor + block.text.length;
  block.line += deltaLines;
  block.col += deltaCols;
  block.offset = cursor;
}

// Recursively applies the delta to the event and all its nested parts
function applyDelta(obj, seen, line, lines, cols, offs, input) {
  if (seen.has(obj)) return;
  seen.add(obj);
  if (Array.isArray(obj)) {
    for (let i = 0, v; i < obj.length; i++) {
      if ((v = obj[i]) && typeof v === 'object') {
        applyDelta(v, seen, line, lines, cols, offs, input);
      }
    }
    return;
  }
  for (let i = 0, keys = Object.keys(obj), k, v; i < keys.length; i++) {
    k = keys[i];
    if (k === 'col' ? (cols && obj.line === line && (obj.col += cols), 0)
      : k === 'col2' ? (cols && obj.line2 === line && (obj.col2 += cols), 0)
      : k === 'line' ? (lines && (obj.line += lines), 0)
      : k === 'line2' ? (lines && (obj.line2 += lines), 0)
      : k === 'offset' ? (offs && (obj.offset += offs), 0)
      : k === 'offset2' ? (offs && (obj.offset2 += offs), 0)
      : k === '_input' ? (obj._input = input, 0)
      : k !== 'target' && (v = obj[k]) && typeof v === 'object'
    ) {
      applyDelta(v, seen, line, lines, cols, offs, input);
    }
  }
}

// returns next token if it's already seen or the current token
function getToken() {
  return parser && (stream.peekCached() || stream.token);
}

function deepCopy(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepCopy);
  }
  const copy = Object.create(Object.getPrototypeOf(obj));
  for (let arr = Object.keys(obj), k, v, i = 0; i < arr.length; i++) {
    v = obj[k = arr[i]];
    copy[k] = !v || typeof v !== 'object' ? v : deepCopy(v);
  }
  return copy;
}
