/* global CodeMirror */
'use strict';

(() => {
  /*
  The original match-highlighter addon always recreates the highlight overlay
  even if the token under cursor hasn't changed, which is terribly ineffective
  (the entire view is re-rendered) and makes our animated token highlight effect
  restart on every cursor movement.

  Invocation sequence of our hooks:

  1. removeOverlayForHighlighter()
     The original addon removes the overlay unconditionally
     so this hook saves the state if the token hasn't changed.

  2. addOverlayForHighlighter()
     Restores the saved state instead of creating a new overlay,
     installs a hook to count occurrences.

  3. matchesOnScrollbar()
     Saves the query regexp passed from the original addon in our helper object,
     and in case removeOverlayForHighlighter() decided to keep the overlay
     only rewrites the regexp without invoking the original constructor.
  */

  const HL_APPROVED = 'cm-matchhighlight-approved';
  const SEARCH_MATCH_TOKEN_NAME = 'searching';

  const originalAddOverlay = CodeMirror.prototype.addOverlay;
  const originalRemoveOverlay = CodeMirror.prototype.removeOverlay;
  const originalMatchesOnScrollbar = CodeMirror.prototype.showMatchesOnScrollbar;
  const originalSetOption = CodeMirror.prototype.setOption;
  let originalGetOption;

  CodeMirror.prototype.addOverlay = addOverlay;
  CodeMirror.prototype.removeOverlay = removeOverlay;
  CodeMirror.prototype.showMatchesOnScrollbar = matchesOnScrollbar;
  CodeMirror.prototype.setOption = setOption;

  let enabled = Boolean(prefs.get('editor.matchHighlight'));

  return;

  function setOption(option, value) {
    enabled = option === 'highlightSelectionMatches' ? value : enabled;
    return originalSetOption.apply(this, arguments);
  }

  function shouldIntercept(overlay) {
    const hlState = this.state.matchHighlighter || {};
    return overlay === hlState.overlay && (hlState.options || {}).showToken;
  }

  function addOverlay() {
    return enabled && shouldIntercept.apply(this, arguments) &&
      addOverlayForHighlighter.apply(this, arguments) ||
      originalAddOverlay.apply(this, arguments);
  }

  function removeOverlay() {
    return enabled && shouldIntercept.apply(this, arguments) &&
      removeOverlayForHighlighter.apply(this, arguments) ||
      originalRemoveOverlay.apply(this, arguments);
  }

  function addOverlayForHighlighter(overlay) {
    const state = this.state.matchHighlighter || {};
    const helper = state.highlightHelper = state.highlightHelper || {};

    helper.rewriteScrollbarQuery = true;

    // since we're here the original addon decided there's something to highlight,
    // so we cancel removeOverlayIfExpired() scheduled in our removeOverlay hook
    clearTimeout(helper.hookTimer);

    // the original addon just removed its overlays, which was intercepted by removeOverlayForHighlighter,
    // which decided to restore it and saved the previous overlays in our helper object,
    // so here we are now, restoring them
    if (helper.skipMatchesOnScrollbar) {
      state.matchesonscroll = helper.matchesonscroll;
      state.overlay = helper.overlay;
      return true;
    }

    // hook the newly created overlay's token() to count the occurrences
    if (overlay.token !== tokenHook) {
      overlay.highlightHelper = {
        token: overlay.token,
        occurrences: 0,
      };
      overlay.token = tokenHook;
    }

    // speed up rendering of scrollbar marks 4 times: we don't need ultimate precision there
    // so for the duration of this event loop cycle we spoof the "lineWrapping" option
    // and restore it in the next event loop cycle
    if (this.options.lineWrapping && CodeMirror.prototype.getOption !== spoofLineWrappingOption) {
      originalGetOption = CodeMirror.prototype.getOption;
      CodeMirror.prototype.getOption = spoofLineWrappingOption;
      setTimeout(() => (CodeMirror.prototype.getOption = originalGetOption));
    }
  }

  function spoofLineWrappingOption(option) {
    return option !== 'lineWrapping' && originalGetOption.apply(this, arguments);
  }

  function tokenHook(stream) {
    // we don't highlight a single match in case 'editor.matchHighlight' option is 'token'
    // so this hook counts the occurrences and toggles HL_APPROVED class on CM's wrapper element
    const style = this.highlightHelper.token.call(this, stream);
    if (style !== 'matchhighlight') {
      return style;
    }

    const tokens = stream.lineOracle.baseTokens;
    const tokenIndex = tokens.indexOf(stream.pos, 1);
    if (tokenIndex > 0) {
      const tokenStart = tokenIndex > 2 ? tokens[tokenIndex - 2] : 0;
      const token = tokenStart === stream.start && tokens[tokenIndex + 1];
      const index = token && token.indexOf(SEARCH_MATCH_TOKEN_NAME);
      if (token && index >= 0 &&
          (token[index - 1] || ' ') === ' ' &&
          (token[index + SEARCH_MATCH_TOKEN_NAME.length] || ' ') === ' ') {
        return;
      }
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
    const helper = state.highlightHelper;
    const {query, originalToken} = helper || state.matchesonscroll || {};
    // no current query means nothing to preserve => remove the overlay
    if (!query || !originalToken) {
      return;
    }
    const sel = this.getSelection();
    // current query differs from the selected text => remove the overlay
    if (sel && sel.toLowerCase() !== originalToken.toLowerCase()) {
      helper.query = helper.originalToken = sel;
      return;
    }
    // if token under cursor has changed => remove the overlay
    if (!sel) {
      const {line, ch} = this.getCursor();
      const queryLen = originalToken.length;
      const start = Math.max(0, ch - queryLen + 1);
      const end = ch + queryLen;
      const string = this.getLine(line);
      const area = string.slice(start, end);
      const i = area.indexOf(query);
      const startInArea = i < 0 ? NaN : i;
      if (isNaN(startInArea) || start + startInArea > ch ||
          state.options.showToken.test(string[start + startInArea - 1] || '') ||
          state.options.showToken.test(string[start + startInArea + queryLen] || '')) {
        // pass the displayed instance back to the original code to remove it
        state.matchesonscroll = state.matchesonscroll || helper && helper.matchesonscroll;
        return;
      }
    }
    // since the same token is under cursor we prevent the highlighter from rerunning
    // by saving current overlays in a helper object so that it's restored in addOverlayForHighlighter()
    state.highlightHelper = {
      overlay: state.overlay,
      matchesonscroll: state.matchesonscroll || (helper || {}).matchesonscroll,
      // instruct our matchesOnScrollbar hook to preserve current scrollbar annotations
      skipMatchesOnScrollbar: true,
      // in case the original addon won't highlight anything we need to actually remove the overlays
      // by setting a timer that runs in the next event loop cycle and can be canceled in this cycle
      hookTimer: setTimeout(removeOverlayIfExpired, 0, this, state),
      originalToken,
      query,
    };
    // fool the original addon so it won't invoke state.matchesonscroll.clear()
    state.matchesonscroll = null;
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
    state.highlightHelper = null;
  }

  function matchesOnScrollbar(query, ...args) {
    if (!enabled) {
      return originalMatchesOnScrollbar.call(this, query, ...args);
    }
    const state = this.state.matchHighlighter;
    const helper = state.highlightHelper = state.highlightHelper || {};
    // rewrite the \btoken\b regexp so it matches .token and #token and --token
    if (helper.rewriteScrollbarQuery && /^\\b.*?\\b$/.test(query.source)) {
      helper.rewriteScrollbarQuery = undefined;
      helper.originalToken = query.source.slice(2, -2);
      const notToken = '(?!' + state.options.showToken.source + ').';
      query = new RegExp(`(^|${notToken})` + helper.originalToken + `(${notToken}|$)`);
    }
    // save the query for future use in removeOverlayForHighlighter
    helper.query = query;
    // if removeOverlayForHighlighter() decided to keep the overlay
    if (helper.skipMatchesOnScrollbar) {
      helper.skipMatchesOnScrollbar = undefined;
      return;
    } else {
      return originalMatchesOnScrollbar.call(this, query, ...args);
    }
  }
})();
