/* global CodeMirror colorConverter */
'use strict';

(() => {
  //region Constants

  const COLORVIEW_CLASS = 'colorview';
  const COLORVIEW_SWATCH_CLASS = COLORVIEW_CLASS + '-swatch';
  const COLORVIEW_SWATCH_CSS = `--${COLORVIEW_SWATCH_CLASS}:`;

  const CLOSE_POPUP_EVENT = 'close-colorpicker-popup';

  const RXS_NUM = /\s*([+-]?(?:\d+\.?\d*|\d*\.\d+))(?:e[+-]?\d+)?/.source;
  const RX_COLOR = {
    hex: /#(?:[a-f\d]{3}(?:[a-f\d](?:[a-f\d]{2}){0,2})?)\b/iy,

    rgb: new RegExp([
      // num, num, num [ , num_or_pct]?
      // pct, pct, pct [ , num_or_pct]?
      `^((${RXS_NUM}\\s*(,|$)){3}|(${RXS_NUM}%\\s*(,|$)){3})(${RXS_NUM}%?)?\\s*$`,
      // num num num [ / num_or_pct]?
      // pct pct pct [ / num_or_pct]?
      `^((${RXS_NUM}\\s*(\\s|$)){3}|(${RXS_NUM}%\\s*(\\s|$)){3})(/${RXS_NUM}%?)?\\s*$`,
    ].join('|'), 'iy'),

    hsl: new RegExp([
      // num_or_angle, pct, pct [ , num_or_pct]?
      `^(${RXS_NUM}(|deg|g?rad|turn)\\s*),(${RXS_NUM}%\\s*(,|$)){2}(${RXS_NUM}%?)?\\s*$`,
      // num_or_angle pct pct [ / num_or_pct]?
      `^(${RXS_NUM}(|deg|g?rad|turn)\\s*)\\s(${RXS_NUM}%\\s*(\\s|$)){2}(/${RXS_NUM}%?)?\\s*$`,
    ].join('|'), 'iy'),

    unsupported: new RegExp([
      !CSS.supports('color', '#abcd') && /#(.{4}){1,2}$/,
      !CSS.supports('color', 'rgb(1e2,0,0)') && /\de/,
      !CSS.supports('color', 'rgb(1.5,0,0)') && /^rgba?\((([^,]+,){0,2}[^,]*\.|(\s*\S+\s+){0,2}\S*\.)/,
      !CSS.supports('color', 'rgb(1,2,3,.5)') && /[^a]\(([^,]+,){3}/,
      !CSS.supports('color', 'rgb(1,2,3,50%)') && /\((([^,]+,){3}|(\s*\S+[\s/]+){3}).*?%/,
      !CSS.supports('color', 'rgb(1 2 3 / 1)') && /^[^,]+$/,
      !CSS.supports('color', 'hsl(1turn, 2%, 3%)') && /deg|g?rad|turn/,
    ].filter(Boolean).map(rx => rx.source).join('|') || '^$', 'i'),
  };
  if (RX_COLOR.unsupported.source === '^$') {
    RX_COLOR.unsupported = null;
  }
  const RX_DETECT = new RegExp('(^|[\\s(){}[\\]:,/"=])' +
    '(' +
      RX_COLOR.hex.source + '|' +
      '(?:rgb|hsl)a?(?=\\()|(?:' + [...colorConverter.NAMED_COLORS.keys()].join('|') + ')' +
      '(?=[\\s;(){}[\\]/"!]|$)' +
    ')', 'gi');
  const RX_DETECT_FUNC = /(rgb|hsl)a?\(/iy;

  const RX_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/g;
  const SPACE1K = ' '.repeat(1000);

  // milliseconds to work on invisible colors per one run
  const TIME_BUDGET = 50;

  // on initial paint the view doesn't have a size yet
  // so we process the maximum number of lines that can fit in the window
  let maxRenderChunkSize = Math.ceil(window.innerHeight / 14);

  //endregion
  //region CodeMirror Events

  const CM_EVENTS = {
    changes(cm, info) {
      colorizeChanges(cm.state.colorpicker, info);
    },
    update(cm) {
      const textHeight = cm.display.cachedTextHeight;
      const height = cm.display.lastWrapHeight;
      if (!height || !textHeight) return;
      maxRenderChunkSize = Math.max(20, Math.ceil(height / textHeight));
      cm.off('update', CM_EVENTS.update);
    },
    mousedown(cm, event) {
      const state = cm.state.colorpicker;
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

  //endregion
  //region ColorSwatch

  const cache = new Set();

  class ColorSwatch {
    constructor(cm, options) {
      this.cm = cm;
      this.options = options;
      this.markersToRemove = [];
      this.markersToRepaint = [];
      this.popup = cm.colorpicker && cm.colorpicker();
      if (!this.popup) {
        delete CM_EVENTS.mousedown;
        document.head.appendChild(document.createElement('style')).textContent = `
          .colorview-swatch::before {
            cursor: auto;
          }
        `;
      }
      this.colorize();
      this.registerEvents();
    }

    colorize() {
      colorizeAll(this);
    }

    openPopup(color) {
      if (this.popup) openPopupForCursor(this, color);
    }

    registerEvents() {
      for (const name in CM_EVENTS) {
        this.cm.on(name, CM_EVENTS[name]);
      }
    }

    unregisterEvents() {
      for (const name in CM_EVENTS) {
        this.cm.off(name, CM_EVENTS[name]);
      }
    }

    destroy() {
      this.unregisterEvents();
      const {cm} = this;
      const {curOp} = cm;
      if (!curOp) cm.startOperation();
      cm.getAllMarks().forEach(m => m.className === COLORVIEW_CLASS && m.clear());
      if (!curOp) cm.endOperation();
      cm.state.colorpicker = null;
    }
  }

  //endregion
  //region CodeMirror registration

  CodeMirror.defineOption('colorpicker', false, (cm, value, oldValue) => {
    if (oldValue && oldValue !== CodeMirror.Init && cm.state.colorpicker) {
      cm.state.colorpicker.destroy();
    }
    if (value) {
      cm.state.colorpicker = new ColorSwatch(cm, value);
    }
  });

  CodeMirror.prototype.getStyleAtPos = getStyleAtPos;

  return;

  //endregion
  //region Colorizing

  function colorizeAll(state) {
    const {cm} = state;
    const {curOp} = cm;
    if (!curOp) cm.startOperation();

    const viewFrom = cm.display.viewFrom;
    const viewTo = (cm.display.viewTo || maxRenderChunkSize - 1) + 1;

    state.line = viewFrom;
    state.inComment = null;
    state.now = performance.now();
    state.stopAt = state.stopped = null;

    cm.doc.iter(viewFrom, viewTo, lineHandle => colorizeLine(state, lineHandle));

    updateMarkers(state);
    if (!curOp) cm.endOperation();

    if (viewFrom > 0 || viewTo < cm.doc.size) {
      clearTimeout(state.colorizeTimer);
      state.line = 0;
      state.colorizeTimer = setTimeout(colorizeInvisible, 100, state, viewFrom, viewTo);
    }
  }


  function colorizeInvisible(state, viewFrom, viewTo) {
    const {cm} = state;
    const {curOp} = cm;
    if (!curOp) cm.startOperation();

    state.now = performance.now();
    state.stopAt = state.now + TIME_BUDGET;
    state.stopped = null;

    // before the visible range
    cm.eachLine(state.line, viewFrom, lineHandle => colorizeLine(state, lineHandle));

    // after the visible range
    if (!state.stopped && viewTo < cm.doc.size) {
      state.line = Math.max(viewTo, state.line);
      cm.eachLine(state.line, cm.doc.size, lineHandle => colorizeLine(state, lineHandle));
    }

    updateMarkers(state);
    if (!curOp) cm.endOperation();

    if (state.stopped) {
      state.colorizeTimer = setTimeout(colorizeInvisible, 0, state, viewFrom, viewTo);
    }
  }


  function colorizeChanges(state, changes) {
    const queue = [];
    const postponed = [];
    const viewFrom = state.cm.display.viewFrom || 0;
    const viewTo = state.cm.display.viewTo || viewFrom + maxRenderChunkSize;

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
    if (postponed.length) setTimeout(colorizeChangesNow, 0, state, postponed, true);
  }


  function colorizeChangesNow(state, changes, canPostpone) {
    const {cm} = state;
    const {curOp} = cm;
    if (!curOp) cm.startOperation();

    state.now = performance.now();
    const stopAt = canPostpone && state.now + TIME_BUDGET;
    let stopped = null;

    let change, changeFromLine;
    let changeToLine = -1;
    let queueIndex = -1;

    changes = changes.sort((a, b) => a.from.line - b.from.line || a.from.ch - b.from.ch);
    const first = changes[0].from.line;
    const last = CodeMirror.changeEnd(changes[changes.length - 1]).line;
    let line = state.line = first;

    cm.doc.iter(first, last + 1, lineHandle => {
      if (line > changeToLine) {
        change = changes[++queueIndex];
        if (!change) return true;
        changeFromLine = change.from.line;
        changeToLine = CodeMirror.changeEnd(change).line;
      }
      if (changeFromLine <= line && line <= changeToLine) {
        state.line = line;
        if (!lineHandle.styles) state.cm.getTokenTypeAt({line, ch: 0});
        colorizeLineViaStyles(state, lineHandle);
      }
      if (canPostpone && (state.now = performance.now()) > stopAt) {
        stopped = true;
        return true;
      }
      line++;
    });

    updateMarkers(state);
    if (!curOp) cm.endOperation();

    if (stopped) {
      const stoppedInChange = line >= changeFromLine && line < changeToLine;
      if (stoppedInChange) {
        changes.splice(0, queueIndex);
        changes[0] = Object.assign({}, changes[0], {from: {line}});
      } else {
        changes.splice(0, queueIndex + 1);
      }
      state.colorizeTimer = setTimeout(colorizeChangesNow, 0, state, changes, true);
    }
  }


  function colorizeLine(state, lineHandle) {
    if (state.stopAt && (state.now = performance.now()) > state.stopAt) {
      state.stopped = true;
      return true;
    }
    const {text, styles} = lineHandle;
    const {cm} = state;

    if (state.inComment === null && !styles) {
      cm.getTokenTypeAt({line: state.line, ch: 0});
      colorizeLineViaStyles(state, lineHandle);
      return;
    }

    if (styles) {
      colorizeLineViaStyles(state, lineHandle);
      return;
    }

    let cmtStart = 0;
    let cmtEnd = 0;
    do {
      if (state.inComment) {
        cmtEnd = text.indexOf('*/', cmtStart);
        if (cmtEnd < 0) break;
        state.inComment = false;
        cmtEnd += 2;
      }
      cmtStart = (text.indexOf('/*', cmtEnd) + 1 || text.length + 1) - 1;
      const chunk = !cmtEnd && cmtStart === text.length ? text : text.slice(cmtEnd, cmtStart);

      RX_DETECT.lastIndex = 0;
      const m = RX_DETECT.exec(chunk);
      if (m) {
        cmtEnd += m.index + m[1].length;
        cm.getTokenTypeAt({line: state.line, ch: 0});
        const {index} = getStyleAtPos({styles: lineHandle.styles, pos: cmtEnd}) || {};
        colorizeLineViaStyles(state, lineHandle, Math.max(1, index || 0));
        return;
      }
      state.inComment = cmtStart < text.length;
    } while (state.inComment);
    state.line++;
  }


  function colorizeLineViaStyles(state, lineHandle, styleIndex = 1) {
    const {styles} = lineHandle;
    let {text} = lineHandle;
    let spanIndex = 0;
    let uncommented = false;
    let span, style, start, end, len, isHex, isFunc, color;

    let {markedSpans} = lineHandle;
    let spansSorted = false;
    let spansZombies = markedSpans && markedSpans.length;
    const spanGeneration = state.now;

    // all comments may get blanked out in the loop
    const endsWithComment = text.endsWith('*/');

    for (let i = styleIndex; i + 1 < styles.length; i += 2) {
      style = styles[i + 1];
      const styleSupported = style && (
        // old CodeMirror
        style.includes('atom') || style.includes('keyword') ||
        // new CodeMirror since 5.48
        style.includes('variable callee')
      );
      if (!styleSupported) continue;

      start = i > 2 ? styles[i - 2] : 0;
      end = styles[i];
      len = end - start;
      isHex = text[start] === '#';
      isFunc = text[end] === '(';

      if (isFunc && (len < 3 || len > 4 || !testAt(RX_DETECT_FUNC, start, text))) continue;
      if (isFunc && !uncommented) {
        text = blankOutComments(text, start);
        uncommented = true;
      }

      color = text.slice(start, isFunc ? text.indexOf(')', end) + 1 : end);
      const j = !isHex && !isFunc && color.indexOf('!');
      if (j > 0) {
        color = color.slice(0, j);
        end = start + j;
      }
      const spanState = markedSpans && checkSpan();
      if (spanState === 'same') continue;
      if (checkColor()) {
        (spanState ? redeem : mark)(getSafeColorValue());
      }
    }

    removeDeadSpans();

    state.inComment = style && style.includes('comment') && !endsWithComment;
    state.line++;
    return;

    function checkColor() {
      if (isHex) return testAt(RX_COLOR.hex, 0, color);
      if (!isFunc) return colorConverter.NAMED_COLORS.has(color.toLowerCase());

      const colorLower = color.toLowerCase();
      if (cache.has(colorLower)) return true;

      const type = color.substr(0, 3);
      const value = color.slice(len + 1, -1);
      if (!testAt(RX_COLOR[type], 0, value)) return false;

      cache.add(colorLower);
      return true;
    }

    function mark(colorValue) {
      const {line} = state;
      state.cm.markText({line, ch: start}, {line, ch: end}, {
        className: COLORVIEW_CLASS,
        startStyle: COLORVIEW_SWATCH_CLASS,
        css: COLORVIEW_SWATCH_CSS + colorValue,
        color,
      });
    }

    function getSafeColorValue() {
      if (isHex && color.length !== 5 && color.length !== 9) return color;
      if (!RX_COLOR.unsupported || !RX_COLOR.unsupported.test(color)) return color;
      const value = colorConverter.parse(color);
      return colorConverter.format(value, 'rgb');
    }

    // update or skip or delete existing swatches
    function checkSpan() {
      if (!spansSorted) {
        markedSpans = markedSpans.sort((a, b) => a.from - b.from);
        spansSorted = true;
      }
      while (spanIndex < markedSpans.length) {
        span = markedSpans[spanIndex];
        if (span.from <= start) {
          spanIndex++;
        } else {
          break;
        }
        if (span.from === start && span.marker.className === COLORVIEW_CLASS) {
          spansZombies--;
          span.generation = spanGeneration;
          const same = color === span.marker.color &&
            (isFunc || /\W|^$/i.test(text.substr(start + color.length, 1)));
          if (same) return 'same';
          state.markersToRemove.push(span.marker);
          return 'redeem';
        }
      }
    }

    function redeem(colorValue) {
      spansZombies++;
      state.markersToRemove.pop();
      state.markersToRepaint.push(span);
      span.to = end;
      span.line = state.line;
      span.index = spanIndex - 1;
      span.marker.color = color;
      span.marker.css = COLORVIEW_SWATCH_CSS + colorValue;
    }

    function removeDeadSpans() {
      if (!spansZombies) return;
      for (const span of markedSpans) {
        if (span.generation !== spanGeneration &&
            span.marker.className === COLORVIEW_CLASS) {
          state.markersToRemove.push(span.marker);
        }
      }
    }
  }

  //endregion
  //region Popup

  function openPopupForCursor(state, defaultColor) {
    const {line, ch} = state.cm.getCursor();
    const lineHandle = state.cm.getLineHandle(line);
    const data = {
      line, ch,
      color: defaultColor,
      isShortCut: true,
    };

    let found;
    for (const {from, marker} of lineHandle.markedSpans || []) {
      if (marker.className === COLORVIEW_CLASS &&
          from <= ch && ch < from + marker.color.length) {
        found = {color: marker.color, ch: from};
        break;
      }
    }
    found = found || findNearestColor(lineHandle, ch);
    doOpenPopup(state, Object.assign(data, found));
    if (found) highlightColor(state, data);
  }


  function openPopupForSwatch(state, swatch) {
    const cm = state.cm;
    const lineDiv = swatch.closest('div');
    const {line: {markedSpans} = {}} = cm.display.renderedView.find(v => v.node === lineDiv) || {};
    if (!markedSpans) return;

    let swatchIndex = [...lineDiv.getElementsByClassName(COLORVIEW_SWATCH_CLASS)].indexOf(swatch);
    for (const {marker} of markedSpans.sort((a, b) => a.from - b.from)) {
      if (marker.className === COLORVIEW_CLASS && swatchIndex-- === 0) {
        const data = Object.assign({color: marker.color}, marker.find().from);
        highlightColor(state, data);
        doOpenPopup(state, data);
        break;
      }
    }
  }


  function doOpenPopup(state, data) {
    const {left, bottom: top} = state.cm.charCoords(data, 'window');
    state.popup.show(Object.assign(state.options.popup, data, {
      top,
      left,
      cm: state.cm,
      color: data.color,
      prevColor: data.color || '',
      callback: popupOnChange,
    }));
  }


  function popupOnChange(newColor) {
    if (!newColor) {
      return;
    }
    const {cm, line, ch, embedderCallback} = this;
    const to = {line, ch: ch + this.prevColor.length};
    if (cm.getRange(this, to) !== newColor) {
      cm.replaceRange(newColor, this, to, '*colorpicker');
      this.prevColor = newColor;
    }
    if (typeof embedderCallback === 'function') {
      embedderCallback(this);
    }
  }

  //endregion
  //region Utility

  function updateMarkers(state) {
    state.markersToRemove.forEach(m => m.clear());
    state.markersToRemove.length = 0;

    const {cm: {display: {viewFrom, viewTo, view}}} = state;
    let viewIndex = 0;
    let lineView = view[0];
    let lineViewLine = viewFrom;
    for (const {line, index, marker} of state.markersToRepaint) {
      if (line < viewFrom || line >= viewTo) continue;
      while (lineViewLine < line && lineView) {
        lineViewLine += lineView.size;
        lineView = view[++viewIndex];
      }
      if (!lineView) break;
      const el = lineView.text.getElementsByClassName(COLORVIEW_SWATCH_CLASS)[index];
      if (el) el.style = marker.css;
    }
    state.markersToRepaint.length = 0;
  }


  function findNearestColor({styles, text}, pos) {
    const ALLOWED_STYLES = ['atom', 'keyword', 'callee', 'comment', 'string'];
    let start, color, prevStart, prevColor, m;
    RX_DETECT.lastIndex = Math.max(0, pos - 1000);

    while ((m = RX_DETECT.exec(text))) {
      start = m.index + m[1].length;
      color = getColor(m[2].toLowerCase());
      if (!color) continue;
      if (start >= pos) break;
      prevStart = start;
      prevColor = color;
    }

    if (prevColor && pos - (prevStart + prevColor.length) < start - pos) {
      return {color: prevColor, ch: prevStart};
    } else if (color) {
      return {color, ch: start};
    }

    function getColor(token) {
      const {style} = getStyleAtPos({styles, pos: start + 1}) || {};
      const allowed = !style || ALLOWED_STYLES.includes(style.split(' ', 1)[0]);
      if (!allowed) return;

      if (text[start + token.length] === '(') {
        const tail = blankOutComments(text.slice(start), 0);
        const color = tail.slice(0, tail.indexOf(')') + 1);
        const type = color.slice(0, 3);
        const value = color.slice(token.length + 1, -1);
        return testAt(RX_COLOR[type], 0, value) && color;
      }
      return (token[0] === '#' || colorConverter.NAMED_COLORS.has(token)) && token;
    }
  }


  function highlightColor(state, data) {
    const {line} = data;
    const {cm} = state;
    const {viewFrom, viewTo} = cm.display;
    if (line < viewFrom || line > viewTo) {
      return;
    }
    const first = cm.charCoords(data, 'window');
    const colorEnd = data.ch + data.color.length - 1;
    let last = cm.charCoords({line, ch: colorEnd}, 'window');
    if (last.top !== first.top) {
      const funcEnd = data.ch + data.color.indexOf('(') - 1;
      last = cm.charCoords({line, ch: funcEnd}, 'window');
    }
    const el = document.createElement('div');
    const DURATION_SEC = 1;
    el.style = `
      position: fixed;
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


  function testAt(rx, index, text) {
    if (!rx) return false;
    rx.lastIndex = index;
    return rx.test(text);
  }


  function getStyleAtPos({
    line,
    styles = this.getLineHandle(line).styles,
    pos,
  }) {
    if (pos < 0) return;
    const len = styles.length;
    const end = styles[len - 2];
    if (pos > end) return;
    if (pos === end) {
      return {
        style: styles[len - 1],
        index: len - 2,
      };
    }
    const mid = (pos / end * (len - 1) & ~1) + 1;
    let a = mid;
    let b;
    while (a > 1 && styles[a] > pos) {
      b = a;
      a = (a / 2 & ~1) + 1;
    }
    if (!b) b = mid;
    while (b < len && styles[b] < pos) b = ((len + b) / 2 & ~1) + 1;
    while (a < b - 3) {
      const c = ((a + b) / 2 & ~1) + 1;
      if (styles[c] > pos) b = c; else a = c;
    }
    while (a < len && styles[a] < pos) a += 2;
    return {
      style: styles[a + 1],
      index: a,
    };
  }


  function blankOutComments(text, start) {
    const cmtStart = text.indexOf('/*', start);
    return cmtStart < 0 ? text : (
      text.slice(0, cmtStart) +
      text.slice(cmtStart)
        .replace(RX_COMMENT, s =>
          SPACE1K.repeat(s.length / 1000 | 0) + SPACE1K.slice(0, s.length % 1000))
    );
  }

  function hitTest({button, target, offsetX, offsetY}) {
    if (button) return;
    const swatch = target.closest('.' + COLORVIEW_CLASS);
    if (!swatch) return;
    const {left, width, height} = getComputedStyle(swatch, '::before');
    const bounds = swatch.getBoundingClientRect();
    const swatchClicked =
      offsetX >= parseFloat(left) - 1 &&
      offsetX <= parseFloat(left) + parseFloat(width) + 1 &&
      offsetY >= parseFloat(height) / 2 - bounds.height / 2 - 1 &&
      offsetY <= parseFloat(height) / 2 + bounds.height / 2 + 1;
    return swatchClicked && swatch;
  }

  //endregion
})();
