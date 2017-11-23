/* global CodeMirror */
'use strict';

(() => {
  const HL_APPROVED = 'cm-matchhighlight-approved';
  const originalAddOverlay = CodeMirror.prototype.addOverlay;
  const originalRemoveOverlay = CodeMirror.prototype.removeOverlay;
  CodeMirror.prototype.addOverlay = addOverlay;
  CodeMirror.prototype.removeOverlay = removeOverlay;
  return;

  function shouldIntercept(overlay) {
    const hlState = this.state.matchHighlighter || {};
    return overlay === hlState.overlay && (hlState.options || {}).showToken;
  }

  function addOverlay() {
    return shouldIntercept.apply(this, arguments) &&
      addOverlayForHighlighter.apply(this, arguments) ||
      originalAddOverlay.apply(this, arguments);
  }

  function removeOverlay() {
    return shouldIntercept.apply(this, arguments) &&
      removeOverlayForHighlighter.apply(this, arguments) ||
      originalRemoveOverlay.apply(this, arguments);
  }

  function addOverlayForHighlighter(overlay) {
    const state = this.state.matchHighlighter || {};
    const helper = state.stylusMHLHelper || {};
    if (helper.matchesonscroll) {
      // restore the original addon's unwanted removeOverlay effects
      // (in case the token under cursor hasn't changed)
      state.matchesonscroll = helper.matchesonscroll;
      state.overlay = helper.overlay;
      helper.matchesonscroll = null;
      helper.overlay = null;
      return true;
    }
    if (overlay.token !== tokenHook) {
      overlay.stylusMHLHelper = {
        token: overlay.token,
        occurrences: 0,
      };
      overlay.token = tokenHook;
    }
    clearTimeout(helper.hookTimer);
  }

  function tokenHook(stream) {
    const style = this.stylusMHLHelper.token.call(this, stream);
    if (style !== 'matchhighlight') {
      return style;
    }
    const num = ++this.stylusMHLHelper.occurrences;
    if (num === 1) {
      stream.lineOracle.doc.cm.display.wrapper.classList.remove(HL_APPROVED);
    } else if (num === 2) {
      stream.lineOracle.doc.cm.display.wrapper.classList.add(HL_APPROVED);
    }
    return style;
  }

  function removeOverlayForHighlighter() {
    const state = this.state.matchHighlighter || {};
    const {query} = state.matchesonscroll || {};
    if (!query) {
      return;
    }
    const {line, ch} = this.getCursor();
    const rx = query instanceof RegExp && query;
    const queryLen = rx ? rx.source.length - 4 : query.length;
    const start = Math.max(0, ch - queryLen + 1);
    const end = ch + queryLen;
    const area = this.getLine(line).substring(start, end);
    const startInArea = rx ? (area.match(rx) || {}).index :
      (area.indexOf(query) + 1 || NaN) - 1;
    if (start + startInArea <= ch) {
      // same token on cursor => prevent the highlighter from rerunning
      state.stylusMHLHelper = {
        overlay: state.overlay,
        matchesonscroll: state.matchesonscroll,
        hookTimer: setTimeout(removeOverlayIfExpired, 0, this, state),
      };
      state.matchesonscroll = null;
      return true;
    }
  }

  function removeOverlayIfExpired(self, state) {
    const {overlay, matchesonscroll} = state.stylusMHLHelper || {};
    if (overlay) {
      originalRemoveOverlay.call(self, overlay);
    }
    if (matchesonscroll) {
      matchesonscroll.clear();
    }
    state.stylusMHLHelper = null;
  }
})();
