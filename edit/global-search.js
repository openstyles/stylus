/* global CodeMirror editors makeSectionVisible */
/* global focusAccessibility */
/* global colorMimicry */
'use strict';

onDOMready().then(() => {

  //region Constants and state

  const INCREMENTAL_SEARCH_DELAY = 0;
  const ANNOTATE_SCROLLBAR_DELAY = 350;
  const ANNOTATE_SCROLLBAR_OPTIONS = {maxMatches: 10e3};
  const STORAGE_UPDATE_DELAY = 500;
  const SCROLL_REVEAL_MIN_PX = 50;

  const DIALOG_SELECTOR = '#search-replace-dialog';
  const TARGET_CLASS = 'search-target-editor';
  const MATCH_CLASS = 'search-target-match';
  const MATCH_TOKEN_NAME = 'searching';
  const OWN_STYLE_SELECTOR = '#global-search-style';
  const APPLIES_VALUE_CLASS = 'applies-value';

  const RX_MAYBE_REGEXP = /^\s*\/(.+?)\/([simguy]*)\s*$/;

  const NARROW_WIDTH = [...document.styleSheets]
    .filter(({href}) => href && href.endsWith('global-search.css'))
    .map(sheet =>
      [...sheet.cssRules]
        .filter(r => r.media && r.conditionText.includes('max-width'))
        .map(r => r.conditionText.match(/\d+/) | 0)
        .sort((a, b) => a - b)
        .pop())
    .pop() || 800;

  const state = {
    // used for case-sensitive matching directly
    find: '',
    // used when /re/ is detected or for case-insensitive matching
    rx: null,
    // used by overlay and doSearchInApplies, equals to rx || stringAsRegExp(find)
    rx2: null,

    icase: true,
    reverse: false,
    lastFind: '',

    numFound: 0,
    numApplies: -1,

    replace: '',
    lastReplace: null,

    cm: null,
    input: null,
    input2: null,
    dialog: null,
    tally: null,
    originalFocus: null,

    undo: null,
    undoHistory: [],

    searchInApplies: !document.documentElement.classList.contains('usercss'),
  };

  //endregion
  //region Events

  const ACTIONS = {
    key: {
      'Enter': event => {
        if (event.target.closest(focusAccessibility.ELEMENTS.join(','))) {
          return false;
        }
        destroyDialog();
        doSearch({canAdvance: false});
      },
      'Esc': () => {
        destroyDialog({restoreFocus: true});
      },
    },
    click: {
      next: () => doSearch({reverse: false}),
      prev: () => doSearch({reverse: true}),
      close: () => destroyDialog({restoreFocus: true}),
      replace: () => doReplace(),
      replaceAll: () => doReplaceAll(),
      undo: () => doUndo(),
      clear() {
        this._input.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
      },
      case() {
        state.icase = !state.icase;
        state.lastFind = '';
        toggleDataset(this, 'enabled', !state.icase);
        doSearch({canAdvance: false});
      }
    },
  };

  const EVENTS = {
    oninput() {
      state.find = state.input.value;
      debounce(doSearch, INCREMENTAL_SEARCH_DELAY, {canAdvance: false});
      adjustTextareaSize(this);
      if (!state.find) enableReplaceButtons(false);
    },
    onkeydown(event) {
      const action = ACTIONS.key[CodeMirror.keyName(event)];
      if (action && action(event) !== false) {
        event.preventDefault();
      }
    },
    onclick(event) {
      const el = event.target.closest('[data-action]');
      const action = el && ACTIONS.click[el.dataset.action];
      if (action && action.call(el, event) !== false) {
        event.preventDefault();
      }
    }
  };

  const DIALOG_PROPS = {
    dialog: {
      onclick: EVENTS.onclick,
      onkeydown: EVENTS.onkeydown,
    },
    input: {
      oninput: EVENTS.oninput,
    },
    input2: {
      oninput() {
        state.replace = this.value;
        adjustTextareaSize(this);
        debounce(writeStorage, STORAGE_UPDATE_DELAY);
      }
    },
  };

  //endregion
  //region Commands

  const COMMANDS = {
    find(cm, {reverse = false} = {}) {
      state.reverse = reverse;
      focusDialog('find', cm);
    },
    findNext: cm => doSearch({reverse: false, cm}),
    findPrev: cm => doSearch({reverse: true, cm}),
    replace(cm) {
      state.reverse = false;
      focusDialog('replace', cm);
    }
  };
  COMMANDS.replaceAll = COMMANDS.replace;

  //endregion

  Object.assign(CodeMirror.commands, COMMANDS);
  readStorage();
  return;

  //region Find

  function initState({initReplace} = {}) {
    const text = state.find;
    const textChanged = text !== state.lastFind;
    if (textChanged) {
      state.numFound = 0;
      state.numApplies = -1;
      state.lastFind = text;
      const match = text && text.match(RX_MAYBE_REGEXP);
      const unicodeFlag = 'unicode' in RegExp.prototype ? 'u' : '';
      const string2regexpFlags = (state.icase ? 'gi' : 'g') + unicodeFlag;
      state.rx = match && tryRegExp(match[1], 'g' + match[2].replace(/[guy]/g, '') + unicodeFlag) ||
        text && (state.icase || text.includes('\n')) && stringAsRegExp(text, string2regexpFlags);
      state.rx2 = state.rx || text && stringAsRegExp(text, string2regexpFlags);
      state.cursorOptions = {
        caseFold: !state.rx && state.icase,
        multiline: true,
      };
      debounce(writeStorage, STORAGE_UPDATE_DELAY);
    }
    if (initReplace && state.replace !== state.lastReplace) {
      state.lastReplace = state.replace;
      state.replaceValue = state.replace.replace(/(\\r)?\\n/g, '\n').replace(/\\t/g, '\t');
      state.replaceHasRefs = /\$[$&`'\d]/.test(state.replaceValue);
    }
    state.activeAppliesTo = $(`.${APPLIES_VALUE_CLASS}:focus, .${APPLIES_VALUE_CLASS}.${TARGET_CLASS}`);
    state.cmStart = CodeMirror.closestVisible(
      document.activeElement && document.activeElement.closest('.CodeMirror') && document.activeElement ||
      state.activeAppliesTo || state.cm);
  }


  function doSearch({
    reverse = state.reverse,
    canAdvance = true,
    inApplies = true,
    cm,
  } = {}) {
    if (cm) setActiveEditor(cm);
    state.reverse = reverse;
    if (!state.find && !dialogShown()) {
      focusDialog('find', state.cm);
      return;
    }
    initState();
    if (!state.find) {
      clearMarker();
      makeTargetVisible(null);
      setupOverlay(editors.slice());
      showTally(0, 0);
      return;
    }
    const {cmStart} = state;
    const {index, found, foundInCode} = doSearchInEditors({cmStart, canAdvance, inApplies}) || {};
    if (!foundInCode) clearMarker();
    if (!found) makeTargetVisible(null);
    const radiateFrom = foundInCode ? index : editors.indexOf(cmStart);
    setupOverlay(radiateArray(editors, radiateFrom));
    enableReplaceButtons(foundInCode);
    debounce(showTally, 0, found && !state.numFound ? 1 : undefined);
  }


  function doSearchInEditors({cmStart, canAdvance, inApplies}) {
    const query = state.rx || state.find;
    const reverse = state.reverse;
    const BOF = {line: 0, ch: 0};
    const EOF = getEOF(cmStart);

    const start = editors.indexOf(cmStart);
    const total = editors.length;
    let i = 0;
    let wrapAround = 0;
    let pos, index, cm;

    if (inApplies && state.activeAppliesTo) {
      if (doSearchInApplies(state.cmStart, canAdvance)) {
        return {found: true};
      }
      if (reverse) pos = EOF; else i++;
    } else {
      pos = getContinuationPos({cm: cmStart, reverse: !canAdvance || reverse});
      wrapAround = !reverse ?
        CodeMirror.cmpPos(pos, BOF) > 0 :
        CodeMirror.cmpPos(pos, EOF) < 0;
    }

    for (; i < total + wrapAround; i++) {
      index = (start + i * (reverse ? -1 : 1) + total) % total;
      cm = editors[index];
      if (i) {
        pos = !reverse ? BOF : {line: cm.doc.size, ch: 0};
      }
      const cursor = cm.getSearchCursor(query, pos, state.cursorOptions);
      if (cursor.find(reverse)) {
        makeMatchVisible(cm, cursor);
        return {found: true, foundInCode: true, index};
      }
      const cmForNextApplies = !reverse ? cm : editors[index ? index - 1 : total - 1];
      if (inApplies && doSearchInApplies(cmForNextApplies)) {
        return {found: true};
      }
    }
  }


  function doSearchInApplies(cm, canAdvance) {
    if (!state.searchInApplies) return;
    const inputs = [...cm.getSection().getElementsByClassName(APPLIES_VALUE_CLASS)];
    if (state.reverse) inputs.reverse();
    inputs.splice(0, inputs.indexOf(state.activeAppliesTo));
    for (const input of inputs) {
      const value = input.value;
      if (input === state.activeAppliesTo) {
        state.rx2.lastIndex = input.selectionStart + canAdvance;
      } else {
        state.rx2.lastIndex = 0;
      }
      const match = state.rx2.exec(value);
      if (!match) {
        continue;
      }
      const end = match.index + match[0].length;
      // scroll selected part into view in long inputs,
      // works only outside of current event handlers chain, hence timeout=0
      setTimeout(() => {
        input.setSelectionRange(end, end);
        input.setSelectionRange(match.index, end);
      });
      const canFocus = !state.dialog || !state.dialog.contains(document.activeElement);
      makeTargetVisible(!canFocus && input);
      makeSectionVisible(cm);
      if (canFocus) input.focus();
      state.cm = cm;
      clearMarker();
      return true;
    }
  }

  //endregion
  //region Replace

  function doReplace() {
    initState({initReplace: true});
    const cm = state.cmStart;
    const pos = getContinuationPos({cm, reverse: true});
    const cursor = doReplaceInEditor({cm, pos});
    if (!cursor) {
      return;
    }

    if (cursor.findNext()) {
      clearMarker();
      makeMatchVisible(cm, cursor);
    } else {
      doSearchInEditors({cmStart: getNextEditor(cm)});
    }

    getStateSafe(cm).unclosedOp = false;
    if (cm.curOp) cm.endOperation();

    if (cursor) {
      state.undoHistory.push([cm]);
      state.undo.disabled = false;
    }
  }


  function doReplaceAll() {
    initState({initReplace: true});
    clearMarker();
    const found = editors.filter(cm => doReplaceInEditor({cm, all: true}));
    if (found.length) {
      state.lastFind = null;
      state.undoHistory.push(found);
      state.undo.disabled = false;
      doSearch({canAdvance: false});
    }
  }


  function doReplaceInEditor({cm, pos, all = false}) {
    const cursor = cm.getSearchCursor(state.rx || state.find, pos, state.cursorOptions);
    const replace = state.replaceValue;
    let found;

    cursor.find();
    while (cursor.atOccurrence) {
      found = true;
      if (!cm.curOp) {
        cm.startOperation();
        getStateSafe(cm).unclosedOp = true;
      }
      if (state.rx) {
        const text = cm.getRange(cursor.pos.from, cursor.pos.to);
        cursor.replace(state.replaceHasRefs ? text.replace(state.rx, replace) : replace);
      } else {
        cursor.replace(replace);
      }
      if (!all) {
        makeMatchVisible(cm, cursor);
        return cursor;
      }
      cursor.findNext();
    }
    if (all) {
      getStateSafe(cm).searchPos = null;
    }
    return found;
  }


  function doUndo() {
    let undoneSome;
    saveWindowScrollPos();
    for (const cm of state.undoHistory.pop() || []) {
      if (document.body.contains(cm.display.wrapper) && !cm.isClean()) {
        cm.undo();
        cm.getAllMarks().forEach(marker =>
          marker !== state.marker &&
          marker.className === MATCH_CLASS &&
          marker.clear());
        undoneSome = true;
      }
    }
    state.undo.disabled = !state.undoHistory.length;
    (state.undo.disabled ? state.input : state.undo).focus();
    if (undoneSome) {
      state.lastFind = null;
      restoreWindowScrollPos();
      doSearch({
        reverse: false,
        canAdvance: false,
        inApplies: false,
      });
    }
  }

  //endregion
  //region Overlay


  function setupOverlay(queue, debounced) {
    if (!queue.length) {
      return;
    }
    if (queue.length > 1 || !debounced) {
      debounce(setupOverlay, 0, queue, true);
      if (!debounced) {
        return;
      }
    }

    let canContinue = true;
    while (queue.length && canContinue) {
      const cm = queue.shift();
      if (!document.body.contains(cm.display.wrapper)) {
        continue;
      }

      const cmState = getStateSafe(cm);
      const query = state.rx2;

      if ((cmState.overlay || {}).query === query) {
        if (cmState.unclosedOp && cm.curOp) cm.endOperation();
        cmState.unclosedOp = false;
        continue;
      }

      if (cmState.overlay) {
        if (!cm.curOp) cm.startOperation();
        cm.removeOverlay(cmState.overlay);
        cmState.overlay = null;
        canContinue = false;
      }

      const hasMatches = query && cm.getSearchCursor(query, null, state.cursorOptions).find();
      if (hasMatches) {
        if (!cm.curOp) cm.startOperation();
        cmState.overlay = {
          query,
          token: tokenize,
          numFound: 0,
          tallyShownTime: 0,
        };
        cm.addOverlay(cmState.overlay);
        canContinue = false;
      }

      if (cmState.annotate) {
        if (!cm.curOp) cm.startOperation();
        cmState.annotate.clear();
        cmState.annotate = null;
        canContinue = false;
      }
      if (cmState.annotateTimer) {
        clearTimeout(cmState.annotateTimer);
        cmState.annotateTimer = 0;
      }
      if (hasMatches) {
        if (cmState.annotateTimer) clearTimeout(cmState.annotateTimer);
        cmState.annotateTimer = setTimeout(annotateScrollbar, ANNOTATE_SCROLLBAR_DELAY,
          cm, query, state.icase);
      }

      cmState.unclosedOp = false;
      if (cm.curOp) cm.endOperation();
    }

    if (!queue.length) debounce.unregister(setupOverlay);
  }


  function tokenize(stream) {
    this.query.lastIndex = stream.pos;
    const match = this.query.exec(stream.string);
    if (match && match.index === stream.pos) {
      this.numFound++;
      //state.numFound++;
      const t = performance.now();
      if (t - this.tallyShownTime > 10) {
        debounce(showTally);
        this.tallyShownTime = t;
      }
      stream.pos += match[0].length || 1;
      return MATCH_TOKEN_NAME;
    } else if (match) {
      stream.pos = match.index;
    } else {
      stream.skipToEnd();
    }
  }


  function annotateScrollbar(cm, query, icase) {
    getStateSafe(cm).annotate = cm.showMatchesOnScrollbar(query, icase, ANNOTATE_SCROLLBAR_OPTIONS);
    debounce(showTally);
  }

  //endregion
  //region Dialog

  function focusDialog(type, cm) {
    setActiveEditor(cm);

    const dialogFocused = state.dialog && state.dialog.contains(document.activeElement);
    let sel = dialogFocused ? '' : getSelection().toString();
    sel = !sel.includes('\n') && !sel.includes('\r') && sel;
    if (sel) state.find = sel;

    if (!dialogShown(type)) {
      destroyDialog();
      createDialog(type);
    } else if (sel) {
      state.input.focus();
      state.input.select();
      document.execCommand('insertText', false, sel);
    }

    state.input.focus();
    state.input.select();
    if (state.find) {
      doSearch({canAdvance: false});
    }
  }


  function dialogShown(type) {
    return document.body.contains(state.input) &&
      (!type || state.dialog.dataset.type === type);
  }


  function createDialog(type) {
    state.originalFocus = document.activeElement;

    const dialog = state.dialog = template.searchReplaceDialog.cloneNode(true);
    Object.assign(dialog, DIALOG_PROPS.dialog);
    dialog.dataset.type = type;

    const content = $('[data-type="content"]', dialog);
    content.parentNode.replaceChild(template[type].cloneNode(true), content);

    createInput(0, 'input', state.find);
    createInput(1, 'input2', state.replace);
    toggleDataset($('[data-action="case"]', dialog), 'enabled', !state.icase);
    state.tally = $('[data-type="tally"]', dialog);

    const colors = {
      body: colorMimicry.get(document.body, {bg: 'backgroundColor'}),
      input: colorMimicry.get($('input:not(:disabled)'), {bg: 'backgroundColor'}),
      icon: colorMimicry.get($$('svg.info')[1], {fill: 'fill'}),
    };
    document.documentElement.appendChild(
      $(OWN_STYLE_SELECTOR) ||
      $create('style' + OWN_STYLE_SELECTOR)
    ).textContent = `
      #search-replace-dialog { 
        background-color: ${colors.body.bg};
      }
      #search-replace-dialog textarea { 
        color: ${colors.body.fore};
        background-color: ${colors.input.bg};
      }
      #search-replace-dialog svg {
        fill: ${colors.icon.fill};
      }
      #search-replace-dialog [data-action="case"] {
        color: ${colors.icon.fill};
      }
      #search-replace-dialog svg:hover {
        fill: inherit;
      }
      #search-replace-dialog [data-action="case"]:hover {
        color: inherit;
      }
      #search-replace-dialog [data-action="clear"] {
        background-color: ${colors.input.bg.replace(/[^,]+$/, '') + '.75)'};
      }
    `;

    document.body.appendChild(dialog);
    dispatchEvent(new Event('showHotkeyInTooltip'));

    measureInput(state.input);
    adjustTextareaSize(state.input);
    if (type === 'replace') {
      measureInput(state.input2);
      adjustTextareaSize(state.input2);
      enableReplaceButtons(state.find !== '');

      addEventListener('resize', toggleReplaceButtonTooltips, {passive: true});
      toggleReplaceButtonTooltips(true);

      state.undo = $('[data-action="undo"]');
      state.undo.disabled = !state.undoHistory.length;
    } else {
      removeEventListener('resize', toggleReplaceButtonTooltips, {passive: true});
    }

    return dialog;
  }


  function createInput(index, name, value) {
    const input = state[name] = $$('textarea', state.dialog)[index];
    if (!input) {
      return;
    }
    input.value = value;
    Object.assign(input, DIALOG_PROPS[name]);

    input.parentElement.appendChild(template.clearSearch.cloneNode(true));
    $('[data-action]', input.parentElement)._input = input;
  }


  function measureInput(input) {
    const style = getComputedStyle(input);
    input._padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    input._maxWidth = parseFloat(style.maxWidth);
    input._rowHeight = input.clientHeight - input._padding;
  }


  function destroyDialog({restoreFocus = false} = {}) {
    state.input = null;
    $.remove(DIALOG_SELECTOR);
    debounce.unregister(doSearch);
    makeTargetVisible(null);
    removeEventListener('resize', toggleReplaceButtonTooltips, {passive: true});
    if (restoreFocus) setTimeout(focusNoScroll, 0, state.originalFocus);
  }


  function adjustTextareaSize(el) {
    const oldWidth = parseFloat(el.style.width) || el.clientWidth;
    const widthHistory = el._widthHistory = el._widthHistory || new Map();
    const knownWidth = widthHistory.get(el.value);
    let newWidth;
    if (knownWidth) {
      newWidth = knownWidth;
    } else {
      const hasVerticalScrollbar = el.scrollHeight > el.clientHeight;
      newWidth = el.scrollWidth + (hasVerticalScrollbar ? el.scrollWidth - el.clientWidth : 0);
      newWidth += newWidth > oldWidth ? 50 : 0;
      widthHistory.set(el.value, newWidth);
    }
    if (newWidth !== oldWidth) {
      const dialogRightOffset = parseFloat(getComputedStyle(state.dialog).right);
      const dialogRight = state.dialog.getBoundingClientRect().right;
      const textRight = (state.input2 || state.input).getBoundingClientRect().right;
      newWidth = Math.min(newWidth,
        (window.innerWidth - dialogRightOffset - (dialogRight - textRight)) / (state.input2 ? 2 : 1) - 20);
      el.style.width = newWidth + 'px';
    }
    const numLines = el.value.split('\n').length;
    if (numLines !== parseInt(el.rows)) {
      el.rows = numLines;
    }
    el.style.overflowX = el.scrollWidth > el.clientWidth ? '' : 'hidden';
  }


  function enableReplaceButtons(enabled) {
    if (state.dialog && state.dialog.dataset.type === 'replace') {
      for (const el of $$('[data-action^="replace"]', state.dialog)) {
        el.disabled = !enabled;
      }
    }
  }


  function toggleReplaceButtonTooltips(debounced) {
    if (debounced !== true) {
      debounce(toggleReplaceButtonTooltips, 0, true);
    } else {
      const addTitle = window.innerWidth <= NARROW_WIDTH;
      for (const el of state.dialog.getElementsByTagName('button')) {
        if (addTitle && !el.title) {
          el.title = el.textContent;
        } else if (!addTitle && el.title) {
          el.title = '';
        } else {
          break;
        }
      }
    }
  }

  //endregion
  //region Utility

  function getStateSafe(cm) {
    return cm.state.search || (cm.state.search = {});
  }


  // determines search start position:
  // the cursor if it was moved or the last match
  function getContinuationPos({cm, reverse}) {
    const cmSearchState = getStateSafe(cm);
    const posType = reverse ? 'from' : 'to';
    const searchPos = (cmSearchState.searchPos || {})[posType];
    const cursorPos = cm.getCursor(posType);
    const preferCursor = !searchPos || CodeMirror.cmpPos(cursorPos, cmSearchState.cursorPos[posType]);
    return preferCursor ? cursorPos : searchPos;
  }


  function getEOF(cm) {
    const line = cm.doc.size - 1;
    return {line, ch: cm.getLine(line).length};
  }


  function getNextEditor(cm, step = 1) {
    return editors[(editors.indexOf(cm) + step + editors.length) % editors.length];
  }


  // sets the editor to start the search in
  // e.g. when the user switched to another editor and invoked a search command
  function setActiveEditor(cm) {
    if (cm.display.wrapper.contains(document.activeElement)) {
      state.cm = cm;
      state.originalFocus = cm;
    }
  }


  // adds a class on the editor that contains the active match
  // instead of focusing it (in order to keep the minidialog focused)
  function makeTargetVisible(element) {
    const old = $('.' + TARGET_CLASS);
    if (old !== element) {
      if (old) old.classList.remove(TARGET_CLASS);
      if (element) element.classList.add(TARGET_CLASS);
    }
  }


  // scrolls the editor to reveal the match
  function makeMatchVisible(cm, searchCursor) {
    const canFocus = !state.dialog || !state.dialog.contains(document.activeElement);
    state.cm = cm;

    // scroll within the editor
    Object.assign(getStateSafe(cm), {
      cursorPos: {
        from: cm.getCursor('from'),
        to: cm.getCursor('to'),
      },
      searchPos: searchCursor.pos,
      unclosedOp: !cm.curOp,
    });
    if (!cm.curOp) cm.startOperation();
    if (canFocus) cm.setSelection(searchCursor.pos.from, searchCursor.pos.to);
    cm.scrollIntoView(searchCursor.pos, SCROLL_REVEAL_MIN_PX);

    // scroll to the editor itself
    makeSectionVisible(cm);

    // focus or expose as the current search target
    clearMarker();
    if (canFocus) {
      cm.focus();
      makeTargetVisible(null);
    } else {
      makeTargetVisible(cm.display.wrapper);
      // mark the match
      const pos = searchCursor.pos;
      state.marker = cm.state.search.marker = cm.markText(pos.from, pos.to, {
        className: MATCH_CLASS,
        clearOnEnter: true,
      });
    }
  }


  function clearMarker() {
    if (state.marker) state.marker.clear();
  }


  function showTally(num, numApplies) {
    if (num === undefined) {
      num = 0;
      for (const cm of editors) {
        const {annotate, overlay} = getStateSafe(cm);
        num +=
          ((annotate || {}).matches || []).length ||
          (overlay || {}).numFound ||
          0;
      }
      state.numFound = num;
    }
    if (numApplies === undefined && state.searchInApplies && state.numApplies < 0) {
      numApplies = 0;
      const elements = state.find ? document.getElementsByClassName(APPLIES_VALUE_CLASS) : [];
      for (const el of elements) {
        const value = el.value;
        if (state.rx) {
          state.rx.lastIndex = 0;
          while (state.rx.exec(value)) numApplies++;
        } else {
          let i = -1;
          while ((i = value.indexOf(state.find, i + 1)) >= 0) numApplies++;
        }
      }
      state.numApplies = numApplies;
    } else {
      numApplies = state.numApplies;
    }
    const newText = num + (numApplies > 0 ? '+' + numApplies : '');
    if (state.tally.textContent !== newText) {
      state.tally.textContent = newText;
      const newTitle = t('searchNumberOfResults' + (numApplies ? '2' : ''));
      if (state.tally.title !== newTitle) state.tally.title = newTitle;
    }
  }


  function focusNoScroll(el) {
    if (el) {
      saveWindowScrollPos();
      el.focus({preventScroll: true});
      restoreWindowScrollPos({immediately: false});
    }
  }


  function toggleDataset(el, prop, state) {
    if (state) {
      el.dataset[prop] = '';
    } else {
      delete el.dataset[prop];
    }
  }


  function saveWindowScrollPos() {
    state.scrollX = window.scrollX;
    state.scrollY = window.scrollY;
  }


  function restoreWindowScrollPos({immediately = true} = {}) {
    if (window.scrollX !== state.scrollX || window.scrollY !== state.scrollY) {
      invokeOrPostpone(immediately, window.scrollTo, 0, state.scrollX, state.scrollY);
    }
  }


  // produces [i, i+1, i-1, i+2, i-2, i+3, i-3, ...]
  function radiateArray(arr, focalIndex) {
    const result = [arr[focalIndex]];
    const len = arr.length;
    for (let i = 1; i < len; i++) {
      if (focalIndex + i < len) {
        result.push(arr[focalIndex + i]);
      }
      if (focalIndex - i >= 0) {
        result.push(arr[focalIndex - i]);
      }
    }
    return result;
  }


  function readStorage() {
    chrome.storage.local.get('editor', ({editor = {}}) => {
      state.find = editor.find || '';
      state.replace = editor.replace || '';
      state.icase = editor.icase || state.icase;
    });
  }


  function writeStorage() {
    chrome.storage.local.get('editor', ({editor}) =>
      chrome.storage.local.set({
        editor: Object.assign(editor || {}, {
          find: state.find,
          replace: state.replace,
          icase: state.icase,
        })
      }));
  }
});
