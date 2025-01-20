import colorMimicry from '@/js/color/color-mimicry';
import {kCodeMirror} from '@/js/consts';
import {cssFieldSizing, $toggleDataset, $create} from '@/js/dom';
import {setInputValue} from '@/js/dom-util';
import {htmlToTemplateCache, templateCache} from '@/js/localization';
import {chromeLocal} from '@/js/storage-util';
import {debounce, stringAsRegExp, t, tryRegExp} from '@/js/util';
import {CodeMirror} from '@/cm';
import editor from './editor';
import html from './global-search.html';

htmlToTemplateCache(html);

//region Constants and state

const INCREMENTAL_SEARCH_DELAY = 0;
const ANNOTATE_SCROLLBAR_DELAY = 350;
const ANNOTATE_SCROLLBAR_OPTIONS = {maxMatches: 10e3};
const STORAGE_UPDATE_DELAY = 500;

const DLG_ID = 'search-replace-dialog';
const DLG_STYLE_ID = 'search-replace-dialog-style';
const TARGET_CLASS = 'search-target-editor';
const MATCH_CLASS = 'search-target-match';
const MATCH_TOKEN_NAME = 'searching';
const APPLIES_VALUE_CLASS = 'applies-value';

const RX_MAYBE_REGEXP = /^\s*\/(.+?)\/([simguy]*)\s*$/;

let stateFirstRun = true;
/** used for case-sensitive matching directly */
let stateFind = '';
/** used when /re/ is detected or for case-insensitive matching */
let stateRX;
/** used by overlay and doSearchInApplies, equals to rx || stringAsRegExp(find) */
let stateRX2;

let stateIcase = true;
let stateReverse = false;
let stateLastFind = '';

let stateNumFound = 0;
let stateNumApplies = -1;

let stateReplace = '';
let stateLastReplace;

let stateActiveAppliesTo;
let stateCm;
let stateCmStart;
let stateCursorOptions;
let stateDialog;
let stateEditors;
let stateInput2;
let stateInput;
let stateMarker;
let stateOriginalFocus;
let stateReplaceHasRefs;
let stateReplaceValue;
let stateScrollX;
let stateScrollY;
let stateTally;

const stateUndoHistory = [];
const stateSearchInApplies = !editor.isUsercss;

//endregion
//region Events

const ACTIONS = {
  key: {
    'Enter': () => {
      switch (document.activeElement) {
        case stateInput:
        case stateInput2:
          if (stateDialog.dataset.type === 'find') {
            doSearch({reverse: false});
          } else {
            doReplace();
          }
      }
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
      setInputValue(this._input, '');
    },
    case() {
      stateIcase = !stateIcase;
      stateLastFind = '';
      $toggleDataset(this, 'enabled', !stateIcase);
      doSearch({canAdvance: false});
    },
  },
};

const EVENTS = {
  oninput() {
    stateFind = stateInput.value;
    debounce(doSearch, INCREMENTAL_SEARCH_DELAY, {canAdvance: false});
    if (!__.MV3 && !cssFieldSizing) adjustTextareaSize(this);
    if (!stateFind) enableReplaceButtons(false);
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
  },
  onfocusout() {
    if (!stateDialog.contains(document.activeElement)) {
      stateDialog.on('focusin', EVENTS.onfocusin);
      stateDialog.off('focusout', EVENTS.onfocusout);
    }
  },
  onfocusin() {
    stateDialog.on('focusout', EVENTS.onfocusout);
    stateDialog.off('focusin', EVENTS.onfocusin);
    trimUndoHistory();
    enableUndoButton(stateUndoHistory.length);
    if (stateFind) doSearch({canAdvance: false});
  },
};

const DIALOG_PROPS = {
  onclick: EVENTS.onclick,
  onkeydown: EVENTS.onkeydown,
};
const INPUT_PROPS = {
  oninput: EVENTS.oninput,
};
const INPUT2_PROPS = {
  oninput() {
    stateReplace = this.value;
    if (!__.MV3 && !cssFieldSizing) adjustTextareaSize(this);
    debounce(writeStorage, STORAGE_UPDATE_DELAY);
  },
};

//endregion
//region Commands

const COMMANDS = {
  find(cm, {reverse = false} = {}) {
    stateReverse = reverse;
    focusDialog('find', cm);
  },
  findNext: cm => doSearch({reverse: false, cm}),
  findPrev: cm => doSearch({reverse: true, cm}),
  replace(cm) {
    stateReverse = false;
    focusDialog('replace', cm);
  },
};
COMMANDS.replaceAll = COMMANDS.replace;

//endregion

Object.assign(CodeMirror.commands, COMMANDS);
readStorage();

//region Find

function initState({initReplace} = {}) {
  const text = stateFind;
  const textChanged = text !== stateLastFind;
  if (textChanged) {
    stateNumFound = 0;
    stateNumApplies = -1;
    stateLastFind = text;
    const match = text && text.match(RX_MAYBE_REGEXP);
    const unicodeFlag = 'unicode' in RegExp.prototype ? 'u' : '';
    const string2regexpFlags = (stateIcase ? 'gi' : 'g') + unicodeFlag;
    stateRX = match && tryRegExp(match[1], 'g' + match[2].replace(/[guy]/g, '') + unicodeFlag) ||
      text && (stateIcase || text.includes('\n')) && stringAsRegExp(text, string2regexpFlags);
    stateRX2 = stateRX || text && stringAsRegExp(text, string2regexpFlags);
    stateCursorOptions = {
      caseFold: !stateRX && stateIcase,
      multiline: true,
    };
    debounce(writeStorage, STORAGE_UPDATE_DELAY);
  }
  if (initReplace && stateReplace !== stateLastReplace) {
    stateLastReplace = stateReplace;
    stateReplaceValue = stateReplace.replace(/(\\r)?\\n/g, '\n').replace(/\\t/g, '\t');
    stateReplaceHasRefs = /\$[$&`'\d]/.test(stateReplaceValue);
  }
  const cmFocused = document.activeElement && document.activeElement.closest('.CodeMirror');
  stateActiveAppliesTo =
    $(`.${APPLIES_VALUE_CLASS}:focus, .${APPLIES_VALUE_CLASS}.${TARGET_CLASS}`);
  stateCmStart = editor.closestVisible(
    cmFocused && document.activeElement ||
    stateActiveAppliesTo ||
    stateCm);
  const cmExtra = $('body > :not(#sections) .CodeMirror');
  stateEditors = cmExtra ? [cmExtra[kCodeMirror]] : editor.getEditors();
}

function doSearch({
  reverse = stateReverse,
  canAdvance = true,
  inApplies = true,
  cm,
} = {}) {
  if (cm) setActiveEditor(cm);
  stateReverse = reverse;
  if (!stateFind && !dialogShown()) {
    focusDialog('find', stateCm);
    return;
  }
  initState();
  const cmStart = stateCmStart;
  const {index, found, foundInCode} =
    stateFind && doSearchInEditors({cmStart, canAdvance, inApplies}) || {};
  if (!foundInCode) clearMarker();
  if (!found) makeTargetVisible(null);
  const radiateFrom = foundInCode ? index : stateEditors.indexOf(cmStart);
  setupOverlay(radiateArray(stateEditors, radiateFrom));
  enableReplaceButtons(foundInCode);
  if (stateFind) {
    const firstSuccessfulSearch = foundInCode && !stateNumFound;
    debounce(showTally, 0, firstSuccessfulSearch ? 1 : undefined);
  } else {
    showTally(0, 0);
  }
  stateFirstRun = false;
  return found;
}

function doSearchInEditors({cmStart, canAdvance, inApplies}) {
  const query = stateRX || stateFind;
  const reverse = stateReverse;
  const BOF = {line: 0, ch: 0};
  const EOF = getEOF(cmStart);

  const start = stateEditors.indexOf(cmStart);
  const total = stateEditors.length;
  let i = 0;
  let wrapAround = 0;
  let pos, index, cm;

  if (inApplies && stateActiveAppliesTo) {
    if (doSearchInApplies(stateCmStart, canAdvance)) {
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
    cm = stateEditors[index];
    if (i) {
      pos = !reverse ? BOF : {line: cm.doc.size, ch: 0};
    }
    const cursor = cm.getSearchCursor(query, pos, stateCursorOptions);
    if (cursor.find(reverse)) {
      makeMatchVisible(cm, cursor);
      return {found: true, foundInCode: true, index};
    }
    const cmForNextApplies = !reverse ? cm : stateEditors[index ? index - 1 : total - 1];
    if (inApplies && doSearchInApplies(cmForNextApplies)) {
      return {found: true};
    }
  }
}

function doSearchInApplies(cm, canAdvance) {
  if (!stateSearchInApplies) return;
  const inputs = editor.getSearchableInputs(cm);
  if (stateReverse) inputs.reverse();
  inputs.splice(0, inputs.indexOf(stateActiveAppliesTo));
  for (const input of inputs) {
    const value = input.value;
    if (input === stateActiveAppliesTo) {
      stateRX2.lastIndex = input.selectionStart + canAdvance;
    } else {
      stateRX2.lastIndex = 0;
    }
    const match = stateRX2.exec(value);
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
    const canFocus = !stateDialog || !stateDialog.contains(document.activeElement);
    makeTargetVisible(!canFocus && input);
    editor.scrollToEditor(cm);
    if (canFocus) input.focus();
    stateCm = cm;
    clearMarker();
    return true;
  }
}

//endregion
//region Replace

function doReplace() {
  initState({initReplace: true});
  const cm = stateCmStart;
  const generation = cm.changeGeneration();
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
    stateUndoHistory.push([[cm, generation]]);
    enableUndoButton(true);
  }
}

function doReplaceAll() {
  initState({initReplace: true});
  clearMarker();
  const generations = new Map(stateEditors.map(cm => [cm, cm.changeGeneration()]));
  const found = stateEditors.filter(cm => doReplaceInEditor({cm, all: true}));
  if (found.length) {
    stateLastFind = null;
    stateUndoHistory.push(found.map(cm => [cm, generations.get(cm)]));
    enableUndoButton(true);
    doSearch({canAdvance: false});
  }
}

function doReplaceInEditor({cm, pos, all = false}) {
  const cursor = cm.getSearchCursor(stateRX || stateFind, pos, stateCursorOptions);
  const replace = stateReplaceValue;
  let found;

  cursor.find();
  while (cursor.atOccurrence) {
    found = true;
    if (!cm.curOp) {
      cm.startOperation();
      getStateSafe(cm).unclosedOp = true;
    }
    if (stateRX) {
      const text = cm.getRange(cursor.pos.from, cursor.pos.to);
      cursor.replace(stateReplaceHasRefs ? text.replace(stateRX, replace) : replace);
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
  for (const [cm, generation] of stateUndoHistory.pop() || []) {
    if (document.body.contains(cm.display.wrapper) && !cm.isClean(generation)) {
      cm.undo();
      cm.getAllMarks().forEach(marker =>
        marker !== stateMarker &&
        marker.className === MATCH_CLASS &&
        marker.clear());
      undoneSome = true;
    }
  }
  enableUndoButton(stateUndoHistory.length);
  if (stateUndoHistory.length) {
    focusUndoButton();
  } else {
    stateInput.focus();
  }
  if (undoneSome) {
    stateLastFind = null;
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
    const query = stateRX2;

    if (cmState.overlay?.query === query) {
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

    const hasMatches = query && cm.getSearchCursor(query, null, stateCursorOptions).find();
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
      cmState.annotateTimer = setTimeout(annotateScrollbar, ANNOTATE_SCROLLBAR_DELAY,
        cm, query, stateIcase);
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
    const now = performance.now();
    if (now - this.tallyShownTime > 10) {
      this.tallyShownTime = now;
      debounce(showTally);
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

async function focusDialog(type, cm) {
  await import(/*webpackMode:"eager"*/'./global-search.css');
  setActiveEditor(cm);

  const dialogFocused = stateDialog && stateDialog.contains(document.activeElement);
  let sel = dialogFocused ? '' : getSelection().toString() || cm && cm.getSelection();
  sel = !sel.includes('\n') && !sel.includes('\r') && sel;
  if (sel) stateFind = sel;

  if (!dialogShown(type)) {
    destroyDialog();
    createDialog(type);
    if (stateTally.textContent === '0') stateTally.textContent = '';
  } else if (sel) {
    setInputValue(stateInput, sel);
  }

  stateInput.focus();
  stateInput.select();
  if (stateFind) {
    doSearch({canAdvance: false});
  }
}

function dialogShown(type) {
  return document.body.contains(stateInput) &&
    (!type || stateDialog.dataset.type === type);
}

function createDialog(type) {
  stateOriginalFocus = document.activeElement;
  stateFirstRun = true;

  const dialog = stateDialog = templateCache.searchReplaceDialog.cloneNode(true);
  Object.assign(dialog, DIALOG_PROPS);
  dialog.on('focusout', EVENTS.onfocusout);
  dialog.dataset.type = type;
  dialog.style.pointerEvents = 'auto';

  const content = dialog.$('[data-type="content"]');
  content.parentNode.replaceChild(templateCache[type].cloneNode(true), content);

  stateInput = createInput(0, INPUT_PROPS, stateFind);
  stateInput2 = createInput(1, INPUT2_PROPS, stateReplace);
  $toggleDataset(dialog.$('[data-action="case"]'), 'enabled', !stateIcase);
  stateTally = dialog.$('[data-type="tally"]');

  const colors = {
    body: colorMimicry(document.body, {bg: 'backgroundColor'}),
    input: colorMimicry($('input:not(:disabled)'), {bg: 'backgroundColor'}),
    icon: colorMimicry($$('i.i-info')[1]),
  };
  $root.appendChild(
    $id(DLG_STYLE_ID) ||
    $create('style#' + DLG_STYLE_ID)
  ).textContent = `
    #search-replace-dialog {
      background-color: ${colors.body.bg};
    }
    #search-replace-dialog textarea {
      color: ${colors.body.fore};
      background-color: ${colors.input.bg};
    }
    #search-replace-dialog i {
      color: ${colors.icon.fore};
    }
    #search-replace-dialog [data-action="case"] {
      color: ${colors.icon.fore};
    }
    #search-replace-dialog[data-type="replace"] button:hover i,
    #search-replace-dialog i:hover {
      color: var(--cmin);
    }
    #search-replace-dialog [data-action="case"]:hover {
      color: var(--cmin);
    }
    #search-replace-dialog [data-action="clear"] {
      background-color: ${colors.input.bg.replace(/[^,]+$/, '') + '.75)'};
    }
  `;

  document.body.appendChild(dialog);
  dispatchEvent(new Event('showHotkeyInTooltip'));

  if (!__.MV3 && !cssFieldSizing) adjustTextareaSize(stateInput);
  if (type === 'replace') {
    if (!__.MV3 && !cssFieldSizing) adjustTextareaSize(stateInput2);
    enableReplaceButtons(stateFind !== '');
    enableUndoButton(stateUndoHistory.length);
  }

  return dialog;
}

function createInput(index, props, value) {
  const input = stateDialog.$$('textarea')[index];
  if (!input) {
    return;
  }
  input.value = value;
  Object.assign(input, props);

  input.parentElement.appendChild(templateCache.clearSearch.cloneNode(true));
  input.parentElement.$('[data-action]')._input = input;
  return input;
}

function destroyDialog({restoreFocus = false} = {}) {
  stateInput = null;
  $id(DLG_ID)?.remove();
  debounce.unregister(doSearch);
  makeTargetVisible(null);
  if (restoreFocus) {
    setTimeout(focusNoScroll, 0, stateOriginalFocus);
  } else {
    saveWindowScrollPos();
    restoreWindowScrollPos({immediately: false});
  }
}

function adjustTextareaSize(el) {
  const sw = el.scrollWidth;
  const cw = el.clientWidth;
  const w = sw > cw && ((sw / 50 | 0) + 1) * 50;
  if (!w || w === cw) return;
  el.style.width = w + 'px';
  const ovrX = el.scrollWidth > el.clientWidth; // recalculate
  const numLines = el.value.split('\n').length + ovrX;
  if (numLines !== Number(el.rows)) {
    el.rows = numLines;
  }
  el.style.overflowX = ovrX ? '' : 'hidden';
}

function enableReplaceButtons(enabled) {
  if (stateDialog && stateDialog.dataset.type === 'replace') {
    for (const el of stateDialog.$$('[data-action^="replace"]')) {
      el.disabled = !enabled;
    }
  }
}

function enableUndoButton(enabled) {
  if (stateDialog && stateDialog.dataset.type === 'replace') {
    for (const el of stateDialog.$$('[data-action="undo"]')) {
      el.disabled = !enabled;
    }
  }
}

function focusUndoButton() {
  for (const btn of stateDialog.$$('[data-action="undo"]')) {
    if (getComputedStyle(btn).display !== 'none') {
      btn.focus();
      break;
    }
  }
}

//endregion
//region Utility

function getStateSafe(cm) {
  return cm.stateSearch || (cm.stateSearch = {});
}

// determines search start position:
// the cursor if it was moved or the last match
function getContinuationPos({cm, reverse}) {
  const cmSearchState = getStateSafe(cm);
  const posType = reverse ? 'from' : 'to';
  const searchPos = cmSearchState.searchPos?.[posType];
  const cursorPos = cm.getCursor(posType);
  const preferCursor = !searchPos ||
    CodeMirror.cmpPos(cursorPos, cmSearchState.cursorPos[posType]);
  return preferCursor ? cursorPos : searchPos;
}

function getEOF(cm) {
  const line = cm.doc.size - 1;
  return {line, ch: cm.getLine(line).length};
}

function getNextEditor(cm, step = 1) {
  const editors = stateEditors;
  return editors[(editors.indexOf(cm) + step + editors.length) % editors.length];
}

// sets the editor to start the search in
// e.g. when the user switched to another editor and invoked a search command
function setActiveEditor(cm) {
  if (cm.display.wrapper.contains(document.activeElement)) {
    stateCm = cm;
    stateOriginalFocus = cm;
  }
}

// adds a class on the editor that contains the active match
// instead of focusing it (in order to keep the minidialog focused)
function makeTargetVisible(element) {
  const old = $('.' + TARGET_CLASS);
  if (old !== element) {
    if (old) {
      old.classList.remove(TARGET_CLASS);
      document.body.classList.remove('find-open');
    }
    if (element) {
      element.classList.add(TARGET_CLASS);
      document.body.classList.add('find-open');
    }
  }
}

// scrolls the editor to reveal the match
function makeMatchVisible(cm, searchCursor) {
  const canFocus = !stateFirstRun &&
    (!stateDialog || !stateDialog.contains(document.activeElement));
  stateCm = cm;
  // scroll within the editor
  const pos = searchCursor.pos;
  Object.assign(getStateSafe(cm), {
    cursorPos: {
      from: cm.getCursor('from'),
      to: cm.getCursor('to'),
    },
    searchPos: pos,
    unclosedOp: !cm.curOp,
  });
  if (!cm.curOp) cm.startOperation();
  if (!stateFirstRun) {
    cm.jumpToPos(pos.from, pos.to);
  }
  // focus or expose as the current search target
  clearMarker();
  if (canFocus) {
    cm.focus();
    makeTargetVisible(null);
  } else {
    makeTargetVisible(cm.display.wrapper);
    // mark the match
    stateMarker = cm.stateSearch.marker = cm.markText(pos.from, pos.to, {
      className: MATCH_CLASS,
      clearOnEnter: true,
    });
  }
}

function clearMarker() {
  if (stateMarker) stateMarker.clear();
}

function showTally(num, numApplies) {
  if (!stateTally) return;
  if (num === undefined) {
    num = 0;
    for (const cm of stateEditors) {
      const {annotate, overlay} = getStateSafe(cm);
      num +=
        annotate?.matches?.length ||
        overlay?.numFound ||
        0;
    }
    stateNumFound = num;
  }
  if (numApplies === undefined && stateSearchInApplies && stateNumApplies < 0) {
    numApplies = 0;
    const elements = stateFind ? document.getElementsByClassName(APPLIES_VALUE_CLASS) : [];
    for (const el of elements) {
      const value = el.value;
      if (stateRX) {
        stateRX.lastIndex = 0;
        // preventing an infinite loop if matched an empty string and didn't advance
        for (let m; (m = stateRX.exec(value)) && ++numApplies && stateRX.lastIndex > m.index;) {
          /* NOP */
        }
      } else {
        let i = -1;
        while ((i = value.indexOf(stateFind, i + 1)) >= 0) numApplies++;
      }
    }
    stateNumApplies = numApplies;
  } else {
    numApplies = stateNumApplies;
  }
  const newText = num + (numApplies > 0 ? '+' + numApplies : '');
  if (stateTally.textContent !== newText) {
    stateTally.textContent = newText;
    const newTitle = t('searchNumberOfResults' + (numApplies ? '2' : ''));
    if (stateTally.title !== newTitle) stateTally.title = newTitle;
  }
}

function trimUndoHistory() {
  const history = stateUndoHistory;
  for (let last; (last = history[history.length - 1]);) {
    const undoables = last.filter(([cm, generation]) =>
      document.body.contains(cm.display.wrapper) && !cm.isClean(generation));
    if (undoables.length) {
      history[history.length - 1] = undoables;
      break;
    }
    history.length--;
  }
}

function focusNoScroll(el) {
  if (el) {
    saveWindowScrollPos();
    el.focus({preventScroll: true});
    restoreWindowScrollPos({immediately: false});
  }
}

function saveWindowScrollPos() {
  stateScrollX = scrollX;
  stateScrollY = scrollY;
}

function restoreWindowScrollPos({immediately = true} = {}) {
  if (!immediately) {
    // run in the next microtask cycle
    Promise.resolve().then(restoreWindowScrollPos);
    return;
  }
  if (scrollX !== stateScrollX || scrollY !== stateScrollY) {
    scrollTo(stateScrollX, stateScrollY);
  }
}

// produces [i, i+1, i-1, i+2, i-2, i+3, i-3, ...]
function radiateArray(arr, focalIndex) {
  const focus = arr[focalIndex];
  if (!focus) return arr;
  const result = [focus];
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
  chromeLocal.getValue('editor').then((val = {}) => {
    stateFind = val.find || '';
    stateReplace = val.replace || '';
    stateIcase = val.icase || stateIcase;
  });
}

function writeStorage() {
  chromeLocal.getValue('editor').then((val = {}) => {
    val.find = stateFind;
    val.replace = stateReplace;
    val.icase = stateIcase;
    chromeLocal.set({editor: val});
  });
}

//endregion
