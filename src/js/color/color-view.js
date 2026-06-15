import {CodeMirror} from '@/cm';
import {COLOR_HSL, COLOR_HWB, COLOR_RGB, CP, SWATCH_CLS, SWATCH_PROP} from '@/js/consts';
import {CHROME, FIREFOX} from '@/js/ua';
import Color, {parseColorFunc} from './color-converter';
import ColorPicker from './color-picker';

//#region Constants

const DUMB = 'Modern color support is not implemented yet...';
const DUMB_ATTRS = {title: DUMB};
const CLOSE_POPUP_EVENT = 'close-colorpicker-popup';

const jobsChanges = [];
const jobsInvisible = [];
const cmHighlightWorkers = new WeakMap();
const rxNonWord = /\W|$/iy;
let timerChanges, timerInvisible;
let generation = 0;
/** @type {RegExp} */
let RX_PARENS, RX_UNSUPPORTED;
// on initial paint the view doesn't have a size yet
// so we process the maximum number of lines that can fit in the window
let maxRenderChunkSize = Math.ceil(window.innerHeight / 14);

//#endregion
//#region CodeMirror Events

const CM_EVENTS = {
  changes(cm, info) {
    const state = cm.state[CP];
    if (info.length === 1 && info[0].origin === 'setValue') {
      colorizeAll(state);
    } else {
      colorizeChanges(state, info);
    }
  },
  update(cm) {
    const state = cm.state[CP];
    const {cachedTextHeight, lastWrapHeight} = cm.display;
    if (!lastWrapHeight || !cachedTextHeight)
      return;
    cm.off('update', CM_EVENTS.update);
    maxRenderChunkSize = Math.max(20, Math.ceil(lastWrapHeight / cachedTextHeight));
    if (state.colorizeOnUpdate) {
      state.colorizeOnUpdate = false;
      colorizeAll(state);
    }
  },
  mousedown(cm, event) {
    const state = cm.state[CP];
    const swatch = hitTest(event);
    dispatchEvent(new CustomEvent(CLOSE_POPUP_EVENT, {
      detail: swatch && state.popup,
    }));
    if (swatch) {
      event.preventDefault();
      openPopupForSwatch(state, swatch);
    }
  },
};

//#endregion
//#region ColorSwatcher

class ColorSwatcher {
  constructor(cm, options = {}) {
    this.cm = cm;
    this.options = options;
    this.markersToRemove = [];
    this.markersToRepaint = [];
    this.popup = ColorPicker(cm);
    if (!RX_PARENS) {
      RX_PARENS = /[()]|\/\*(?:[^*]+|\*(?!\/))*(?:\*\/|$)/g;
      if (!__.MV3 && (CHROME < 125 || FIREFOX < 128)) {
        RX_UNSUPPORTED = [
          ['#abcd', '#(.{4}){1,2}$'],
          ['hwb(1 0% 0%)', '^hwb\\('],
          ['rgb(1e2,0,0)', '\\de'],
          ['rgb(1.5,0,0)', String.raw`^rgba?\((([^,]+,){0,2}[^,]*\.|(\s*\S+\s+){0,2}\S*\.)`],
          ['rgb(1,2,3,.5)', '[^a]\\(([^,]+,){3}'],
          ['rgb(1,2,3,50%)', String.raw`\((([^,]+,){3}|(\s*\S+[\s/]+){3}).*?%`],
          ['rgb(1 2 3 / 1)', '^[^,]+$'],
          ['hsl(1turn, 2%, 3%)', 'deg|g?rad|turn'],
        ].map(e => !CSS.supports('color', e[0]) && e[1]).filter(Boolean).join('|') || null;
        RX_UNSUPPORTED &&= new RegExp(RX_UNSUPPORTED, 'i');
      }
    }
    this.colorize();
    for (const name in CM_EVENTS)
      cm.on(name, CM_EVENTS[name]);
    cm.state.highlight.set = (time, fn) => {
      cmHighlightWorkers.set(cm, fn);
      if (!jobsInvisible.includes(this))
        jobsInvisible.push(this);
      timerInvisible ||= setTimeout(colorizeInvisible, time);
    };
  }

  colorize() {
    colorizeAll(this);
  }

  openPopup() {
    if (this.popup) openPopupForCursor(this);
  }
  destroy() {
    const {cm} = this;
    const {curOp} = cm;
    for (const name in CM_EVENTS)
      cm.off(name, CM_EVENTS[name]);
    delete cm.state.highlight.set;
    if (!curOp) cm.startOperation();
    cm.getAllMarks().forEach(m => m.className === SWATCH_CLS && m.clear());
    if (!curOp) cm.endOperation();
    cm.state[CP] = null;
  }
}

//#endregion
//#region CodeMirror registration

CodeMirror.defineOption('colorpicker', false, (cm, value, oldValue) => {
  if (oldValue && oldValue !== CodeMirror.Init && cm.state[CP]) {
    cm.state[CP].destroy();
  }
  if (value) {
    cm.state[CP] = new ColorSwatcher(cm, value);
  }
});

//#endregion
//#region Colorizing

function colorizeAll(state) {
  const {cm} = state;
  const {curOp} = cm;
  const {viewFrom, viewTo} = cm.display;
  if (!viewTo) {
    state.colorizeOnUpdate = true;
    return;
  }
  if (!curOp) cm.startOperation();
  state.inComment = null;
  state.cnt = 0;
  state.stopAt = 0;
  generation++;
  let line = viewFrom;
  cm.eachLine(viewFrom, viewTo, lh => colorizeLineViaStyles(state, line++, lh));
  updateMarkers(state);
  if (!curOp) cm.endOperation();
  if (viewFrom > 0 || viewTo < cm.doc.size) {
    state.line = viewFrom ? 0 : line;
    if (!jobsInvisible.includes(state))
      jobsInvisible.push(state);
    timerInvisible ||= cmHighlightWorkers.has(cm) && setTimeout(colorizeInvisible, 100);
  }
}

function colorizeInvisible() {
  timerInvisible = 0;
  const cmsStarted = [];
  while (jobsInvisible.length) {
    const state = jobsInvisible.shift();
    const {cm} = state;
    const {display, doc} = cm;
    const {viewFrom, viewTo} = display;
    const size = doc.size;
    const hlw = cmHighlightWorkers.get(cm);
    let line = state.line || 0;
    let stopped;
    if (!cm.curOp) {
      cmsStarted.push(cm);
      cm.startOperation();
    }
    generation++;
    state.stopAt = performance.now() + cm.options.workTime;
    cm.eachLine(line--, size, lh => {
      ++line;
      if (line < viewFrom || line >= viewTo || line > doc.highlightFrontier)
        return (lh.styles || (stopped = hlw()))
          && colorizeLineViaStyles(state, line, lh) && (stopped = true);
    });
    updateMarkers(state);
    if (stopped) {
      state.line = line;
      const i = jobsInvisible.indexOf(state);
      if (i > 0) jobsInvisible.splice(i, 1);
      if (i) jobsInvisible.unshift(state);
      timerInvisible = hlw && setTimeout(colorizeInvisible);
      break;
    }
  }
  for (const cm of cmsStarted)
    cm.endOperation();
}


function colorizeChanges(state, changes) {
  const queue = [];
  const postponed = [];
  const display = state.cm.display;
  const viewFrom = display.viewFrom || 0;
  const viewTo = display.viewTo || viewFrom + maxRenderChunkSize;

  for (let change of changes) {
    const {from} = change;
    const to = CodeMirror.changeEnd(change);
    const offscreen = from.line > viewTo || to.line < viewFrom;
    if (offscreen) {
      postponed.push(change);
      continue;
    }
    if (from.line < viewFrom) {
      postponed.push(Object.assign({}, change, {to: {line: viewFrom - 1}}));
      change = Object.assign({}, change, {from: {line: viewFrom}});
    }
    if (to.line > viewTo) {
      postponed.push(Object.assign({}, change, {from: {line: viewTo + 1}}));
      change = Object.assign({}, change, {to: {line: viewTo}});
    }
    queue.push(change);
  }

  if (queue.length) colorizeChangesNow(state, queue);
  if (postponed.length) {
    jobsChanges.push(state, postponed);
    timerChanges ||= setTimeout(colorizeChangesLater);
  }
}


function colorizeChangesNow(state, changes, canPostpone) {
  const {cm} = state;
  const {curOp} = cm;
  if (!curOp) cm.startOperation();

  state.stopAt = canPostpone && performance.now() + cm.options.workTime;
  generation++;
  let stopped;
  let change, changeFromLine;
  let changeToLine = -1;
  let queueIndex = -1;

  changes = changes.sort((a, b) => a.from.line - b.from.line || a.from.ch - b.from.ch);
  let line = changes[0].from.line;
  cm.eachLine(line--, CodeMirror.changeEnd(changes[changes.length - 1]).line + 1, lh => {
    ++line;
    if (line > changeToLine) {
      change = changes[++queueIndex];
      if (!change) return true;
      changeFromLine = change.from.line;
      changeToLine = CodeMirror.changeEnd(change).line;
    }
    if (changeFromLine <= line && line <= changeToLine) {
      if (!lh.styles)
        state.cm.getTokenTypeAt({line, ch: 0});
      if (colorizeLineViaStyles(state, line, lh))
        stopped = true;
    }
    return stopped && canPostpone;
  });

  updateMarkers(state);
  if (!curOp) cm.endOperation();

  if (stopped) {
    const stoppedInChange = line >= changeFromLine && line <= changeToLine;
    if (stoppedInChange) {
      changes.splice(0, queueIndex);
      changes[0] = Object.assign({}, changes[0], {from: {line}});
    } else {
      changes.splice(0, queueIndex + 1);
    }
    jobsChanges.push(state, changes);
    timerChanges ||= setTimeout(colorizeChangesLater);
  }
  return stopped;
}

function colorizeChangesLater() {
  timerChanges = 0;
  while (
    !colorizeChangesNow(jobsChanges.shift(), jobsChanges.shift(), true) &&
    jobsChanges.length
  ) {/*NOP*/}
}

function colorizeLineViaStyles(state, line, lineHandle) {
  const {styles, text} = lineHandle;
  const stylesLen = styles.length;
  // all comments may get blanked out in the loop
  const endsWithComment = text.endsWith('*/');
  let spanIndex = 0;
  let span, style;
  let {markedSpans} = lineHandle;
  let spansSorted;
  let spansZombies = markedSpans && markedSpans.length;
  nextStyle:
  for (
    let i = 1, v, spanState, marker, start, end, len, hex, funcType;
    i + 1 < stylesLen;
    i += 2
  ) {
    style = styles[i + 1];
    if (!style || !(v = style.indexOf('overlay ')))
      continue;
    if (v > 0) style = style.slice(0, v);
    if (style !== 'atom' && style !== 'keyword' && style !== 'variable callee')
      continue;
    start = i > 2 ? styles[i - 2] : 0;
    while (i + 3 < stylesLen && (end = styles[i + 3]) && end.startsWith(style))
      i += 2;
    end = styles[i];
    len = end - start;
    if (len < 3)
      continue;
    let func = !(hex = text.charCodeAt(start) === 35/* # */)
      && text.charCodeAt(end) === 40/* ( */;
    if (func) {
      const hasA = len === 4 && text.charCodeAt(end - 1) === 97/* a */;
      func = len >= 3 && len <= 10 && (v = text.charCodeAt(start)) && (
        len === 3 || hasA ? v === 114/* r */ || v === 104/* h */ || v === 108/* l */
          : len === 5 ? v === 111/* o */ || v === 99/* c */
            : len === 9 ? v === 99/* c */ : len === 10 && v === 108/* l */
      ) && text.slice(start, end - hasA).toLowerCase();
      if (!func || !(
        hasA || len === 3 ? (
          funcType = func === 'rgb' ? COLOR_RGB
            : func === 'hsl' ? COLOR_HSL
              : func === 'hwb' && !hasA && COLOR_HWB
        ) || !hasA && (func === 'lab' || func === 'lch') :
        len === 5 ? func === 'color' || func === 'oklab' || func === 'oklch' :
        len === 9 ? func === 'color-mix' : len === 10 && func === 'light-dark'
      )) continue;
      let num = 1;
      let a = end;
      let b = end;
      while (num && ~a && ~(b = text.indexOf(')', b + 1))) {
        num--;
        while (~(v = text.indexOf('(', a + 1)) && v < b) {
          a = v;
          num++;
        }
      }
      if (b < 0) // the function doesn't end on this line but maybe there are simple colors inside
        continue;
      end = b + 1;
    }
    let color = text.slice(start, end);
    if (!hex && !func && (v = color.indexOf('!')) > 0) { // red!important
      color = color.slice(0, v);
      end = start + v;
      len = end - start;
    }
    if (markedSpans) { // update or skip or delete existing swatches
      spansSorted ||= markedSpans = markedSpans.sort((a, b) => a.from - b.from);
      while (spanIndex < markedSpans.length) {
        span = markedSpans[spanIndex];
        if (span.from > start)
          break;
        spanIndex++;
        if (span.from === start && span.marker.className === SWATCH_CLS) {
          spansZombies--;
          span.generation = generation;
          if (color === span.marker.color && (
            func || (rxNonWord.lastIndex = start + color.length, rxNonWord.test(text))
          )) continue nextStyle;
          state.markersToRemove.push(span.marker);
          spanState = true;
          break;
        }
      }
    }
    const parsedColor = func
      ? (v = color.slice(len + 1, -1).trim()) &&
        (!funcType || parseColorFunc(funcType, funcType === COLOR_RGB ? v : v.toLowerCase()))
      : Color.parse(color, end - start, hex);
    if (!parsedColor && !func/*colorConverter doesn't support many modern funcs*/)
      continue;
    if (spanState) {
      ++spansZombies;
      state.markersToRemove.pop();
      state.markersToRepaint.push(span);
      span.to = start + len;
      span.line = line;
      span.index = spanIndex - 1;
      marker = span.marker;
    } else {
      marker = {className: SWATCH_CLS};
    }
    marker.attributes = func && !parsedColor && DUMB_ATTRS;
    marker.color = color;
    marker.css = SWATCH_PROP + ':' + (
      parsedColor && RX_UNSUPPORTED?.test(color)
        ? parsedColor.toString(COLOR_RGB)
        : color
    );
    marker.len = end - start;
    if (!spanState)
      state.cm.markText({line, ch: start}, {line, ch: start + 1}, marker);
  }

  if (spansZombies)
    for (const m of markedSpans)
      if (m.generation !== generation &&
          m.marker.className === SWATCH_CLS)
        state.markersToRemove.push(m.marker);

  state.inComment = style?.includes('comment') && !endsWithComment;
  if (state.stopAt
  && (state.cnt += stylesLen) > 2 * 100 // only waste time on performance.now() every ~100 tokens
  && (state.cnt = 0, performance.now() > state.stopAt)) {
    return true;
  }
}

//#endregion
//#region Popup

function openPopupForCursor(state) {
  const {line, ch} = state.cm.getCursor();
  const lineHandle = state.cm.getLineHandle(line);
  let distance = 1e9;
  let marker, markerStart;
  for (const {from, marker: m} of lineHandle.markedSpans || []) {
    if (m.className === SWATCH_CLS) {
      const gapL = from - ch;
      const gapR = ch - from - m.color.length;
      if (gapL <= 0 && gapR < 0) {
        marker = m;
        markerStart = from;
        break;
      } else if (gapL < distance || gapR < distance) {
        marker = m;
        markerStart = from;
        distance = gapL < gapR ? gapL : gapR;
      }
    }
  }
  doOpenPopup(state, line, markerStart ?? ch, marker);
}

function openPopupForSwatch(state, swatch) {
  const lineDiv = swatch.closest('div');
  const {renderedView, viewFrom} = state.cm.display;
  const line = renderedView.findIndex(rv => rv.node === lineDiv);
  let v;
  if (line >= 0 && (v = renderedView[line].line.markedSpans)
  && (swatch = [].indexOf.call(lineDiv.getElementsByClassName(SWATCH_CLS), swatch)) >= 0
  && (v = v.filter(ms => ms.marker.className === SWATCH_CLS)).length > swatch) {
    v = v.sort((a, b) => a.from - b.from)[swatch];
    doOpenPopup(state, viewFrom + line, v.from, v.marker);
  }
}

function doOpenPopup(state, line, ch, marker) {
  const {cm} = state;
  const data = Object.assign(state.options.popup, {line, ch});
  const {left, bottom: top} = cm.charCoords(data, 'window');
  const color = marker?.color || data.defaultColor;
  state.popup.show(Object.assign(data, {
    cm,
    top,
    left,
    color: color || data.defaultColor,
    prevColor: color || '',
    callback: popupOnChange,
    palette: makePalette(state),
    paletteCallback,
  }));
  highlightColor(cm, line, ch, data);
}


function popupOnChange(newColor) {
  if (!newColor) {
    return;
  }
  const {cm, line, ch, embedderCallback} = this;
  const to = {line, ch: ch + this.prevColor.length};
  const from = {line, ch};
  if (cm.getRange(from, to) !== newColor) {
    cm.replaceRange(newColor, from, to, '*colorpicker');
    this.prevColor = newColor;
  }
  if (typeof embedderCallback === 'function') {
    embedderCallback(this);
  }
}

function makePalette({cm, options}) {
  const palette = new Map();
  let i = 0;
  let nums;
  cm.eachLine(({markedSpans}) => {
    ++i;
    if (!markedSpans) return;
    for (const {from, marker: m} of markedSpans) {
      if (from == null || m.className !== SWATCH_CLS) continue;
      const color = m.color.toLowerCase();
      nums = palette.get(color);
      if (!nums) palette.set(color, (nums = []));
      nums.push(i);
    }
  });
  const res = [];
  if (palette.size > 1 || nums && nums.length > 1) {
    const old = new Map(options.popup.palette?.map(el => [el.__color, el]));
    for (const [color, data] of palette) {
      const str = data.join(', ');
      let el = old.get(color);
      if (!el) {
        el = $tag('div');
        el.__color = color; // also used in color-picker.js
        el.className = SWATCH_CLS;
        el.style.setProperty(SWATCH_PROP, color);
      }
      if (el.__str !== str) {
        el.__str = str;
        // break down long lists: 10 per line
        el.title = `${color}\n${options.popup.paletteLine} ${
          str.length > 50 ? str.replace(/([^,]+,\s){10}/g, '$&\n') : str
        }`;
      }
      res.push(el);
    }
    res.push(Object.assign($tag('span'), {
      className: 'colorpicker-palette-hint',
      title: options.popup.paletteHint,
      textContent: '?',
    }));
  }
  return res;
}

function paletteCallback(el) {
  const {cm} = this;
  const lines = el.title.split('\n')[1].match(/\d+/g).map(Number);
  const i = lines.indexOf(cm.getCursor().line + 1) + 1;
  const line = (lines[i] || lines[0]) - 1;
  cm.jumpToPos({line, ch: 0});
}

//#endregion
//#region Utility

function updateMarkers(state) {
  for (const m of state.markersToRemove)
    m.clear();
  state.markersToRemove.length = 0;

  const {cm: {display: {viewFrom, viewTo, view}}} = state;
  let viewIndex = 0;
  let lineView = view[0];
  let lineViewLine = viewFrom;
  let el;
  for (const {line, index, marker} of state.markersToRepaint) {
    if (line < viewFrom || line >= viewTo) continue;
    while (lineViewLine < line && lineView) {
      lineViewLine += lineView.size;
      lineView = view[++viewIndex];
    }
    if (lineView && (el = lineView.text.getElementsByClassName(SWATCH_CLS)[index])) {
      el.style = marker.css;
      el.title = marker.attributes ? DUMB : '';
    }
  }
  state.markersToRepaint.length = 0;
}


function highlightColor(cm, line, ch, data) {
  const {viewFrom, viewTo} = cm.display;
  if (line < viewFrom || line > viewTo) {
    return;
  }
  const first = cm.charCoords(data);
  const colorEnd = data.ch + data.len - 1;
  let last = cm.charCoords({line, ch: colorEnd});
  if (last.top !== first.top) {
    const funcEnd = data.ch + data.color.indexOf('(') - 1;
    last = cm.charCoords({line, ch: funcEnd});
  }
  const el = $tag('div');
  const DURATION_SEC = .5;
  el.style = `
    position: absolute;
    display: block;
    top: ${first.top}px;
    left: ${first.left}px;
    width: ${last.right - first.left}px;
    height: ${last.bottom - first.top}px;
    animation: highlight ${DURATION_SEC}s;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), DURATION_SEC * 1000);
}


function hitTest({button, target, offsetX, offsetY}) {
  if (button) return;
  /** @type {HTMLElement} */
  const swatch = target.closest('.' + SWATCH_CLS);
  if (!swatch)
    return;
  const {left, width, height} = getComputedStyle(swatch, '::before');
  const bounds = swatch.getBoundingClientRect();
  const swatchClicked =
    offsetX >= parseFloat(left) - 1 &&
    offsetX <= parseFloat(left) + parseFloat(width) + 1 &&
    offsetY >= parseFloat(height) / 2 - bounds.height / 2 - 1 &&
    offsetY <= parseFloat(height) / 2 + bounds.height / 2 + 1;
  return swatchClicked && swatch;
}

//#endregion
