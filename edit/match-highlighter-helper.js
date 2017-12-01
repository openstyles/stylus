/* global CodeMirror */
'use strict';

(() => {
  const HL_APPROVED = 'cm-matchhighlight-approved';
  const originalAddOverlay = CodeMirror.prototype.addOverlay;
  const originalRemoveOverlay = CodeMirror.prototype.removeOverlay;
  const originalMatchesOnScrollbar = CodeMirror.prototype.showMatchesOnScrollbar;
  CodeMirror.prototype.addOverlay = addOverlay;
  CodeMirror.prototype.removeOverlay = removeOverlay;
  CodeMirror.prototype.showMatchesOnScrollbar = matchesOnScrollbar;
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
    const helper = state.highlightHelper = state.highlightHelper || {};

    clearTimeout(helper.hookTimer);

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
      overlay.highlightHelper = {
        token: overlay.token,
        occurrences: 0,
      };
      overlay.token = tokenHook;
    }

    if (this.options.lineWrapping) {
      const originalGetOption = CodeMirror.prototype.getOption;
      CodeMirror.prototype.getOption = function (option) {
        return option !== 'lineWrapping' && originalGetOption.apply(this, arguments);
      };
      setTimeout(() => {
        CodeMirror.prototype.getOption = originalGetOption;
      });
    }
  }

  function tokenHook(stream) {
    const style = this.highlightHelper.token.call(this, stream);
    if (style !== 'matchhighlight') {
      return style;
    }
    const num = ++this.highlightHelper.occurrences;
    if (num === 1) {
      stream.lineOracle.doc.cm.display.wrapper.classList.remove(HL_APPROVED);
    } else if (num === 2) {
      stream.lineOracle.doc.cm.display.wrapper.classList.add(HL_APPROVED);
    }
    return style;
  }

  function removeOverlayForHighlighter() {
    const state = this.state.matchHighlighter || {};
    const {query} = state.highlightHelper || state.matchesonscroll || {};
    if (!query) {
      return;
    }
    const rx = query instanceof RegExp && query;
    const sel = this.getSelection();
    if (sel && (rx && !rx.test(sel) || sel.toLowerCase() !== query)) {
      return;
    }
    if (!sel) {
      const {line, ch} = this.getCursor();
      const queryLen = rx ? rx.source.length - 4 : query.length;
      const start = Math.max(0, ch - queryLen + 1);
      const end = ch + queryLen;
      const area = this.getLine(line).substring(start, end);
      const startInArea = rx ? (area.match(rx) || {}).index :
        (area.indexOf(query) + 1 || NaN) - 1;
      if (start + startInArea > ch) {
        return;
      }
    }
    // same token on cursor => prevent the highlighter from rerunning
    state.highlightHelper = {
      overlay: state.overlay,
      matchesonscroll: state.matchesonscroll,
      showMatchesOnScrollbar: this.showMatchesOnScrollbar,
      hookTimer: setTimeout(removeOverlayIfExpired, 0, this, state),
    };
    state.matchesonscroll = null;
    this.showMatchesOnScrollbar = scrollbarForHighlighter;
    return true;
  }

  function removeOverlayIfExpired(self, state) {
    const {overlay, matchesonscroll} = state.highlightHelper || {};
    if (overlay) {
      originalRemoveOverlay.call(self, overlay);
    }
    if (matchesonscroll) {
      matchesonscroll.clear();
    }
    self.showMatchesOnScrollbar = state.showMatchesOnScrollbar;
    state.highlightHelper = null;
  }

  function scrollbarForHighlighter(query) {
    const helper = this.state.matchHighlighter.highlightHelper;
    this.showMatchesOnScrollbar = helper.showMatchesOnScrollbar;
    helper.query = query;
  }

  function matchesOnScrollbar(query, ...args) {
    if (query instanceof RegExp) {
      query = new RegExp(/(?:^|[^\w.#\\-])/.source + query.source.slice(2, -2) + /(?:[^\w.#\\-]|$)/.source);
    }
    return originalMatchesOnScrollbar.call(this, query, ...args);
  }
})();
