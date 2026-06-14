import {pEditorLinter, pKeyMap} from '@/js/consts';
import {template} from '@/js/localization';
import {swController} from '@/js/msg-init';
import * as prefs from '@/js/prefs';
import {WINDOWS} from '@/js/ua';
import {deepMerge} from '@/js/util';
import CM from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/dialog/dialog';
import 'codemirror/addon/dialog/dialog.css';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/indent-fold';
import 'codemirror/addon/hint/anyword-hint';
import 'codemirror/addon/hint/css-hint';
import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/addon/lint/lint';
import 'codemirror/addon/lint/lint.css';
import 'codemirror/addon/scroll/annotatescrollbar';
import 'codemirror/addon/search/matchesonscrollbar';
import 'codemirror/addon/search/matchesonscrollbar.css';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/selection/active-line';
import 'codemirror/keymap/emacs';
import 'codemirror/keymap/sublime';
import 'codemirror/keymap/vim';
import 'codemirror/mode/stylus/stylus';
import '@/vendor-overwrites/codemirror-addon/match-highlighter.js';
import './css';
import {THEME_KEY} from './themes';
import {getPreprocessorMode} from './util';
import './index.css';

export const CodeMirror = CM; // workaround for webpack's `codemirror_default()` import
export * from './themes';

export const extraKeys = Object.assign(CodeMirror.defaults.extraKeys || {}, {
  // independent of current keyMap; some are implemented only for the edit page
  'Alt-Enter': 'toggleStyle',
  'Alt-PageDown': 'nextEditor',
  'Alt-PageUp': 'prevEditor',
  'Alt-Home': 'showCurrentLineAtTop',
  'Alt-End': 'showCurrentLineAtBottom',
  'Alt-Down': 'minus1',
  'Alt-Up': 'plus1',
  'Shift-Alt-Down': 'minus10',
  'Shift-Alt-Up': 'plus10',
  'Shift-Ctrl-Alt-Down': 'minus100',
  'Shift-Ctrl-Alt-Up': 'plus100',
  // Adding dummy Wheel shortcuts to show it in keymap (i) popup
  'Ctrl-Alt-WheelDown': 'minus100',
  'Ctrl-Alt-WheelUp': 'plus100',
  'Ctrl-Pause': 'toggleEditorFocus',
});
const rxNonSpace = /\S/;

(async () => {
  if (!__.MV3 || !swController)
    await prefs.ready;
  // CodeMirror miserably fails on keyMap='' so let's ensure it's not
  if (!prefs.__values[pKeyMap])
    prefs.reset(pKeyMap);
  deepMerge(prefs.__values['editor.options'], Object.assign(CodeMirror.defaults, {
    autoCloseBrackets: prefs.__values['editor.autoCloseBrackets'],
    mode: 'css',
    lineNumbers: true,
    lineWrapping: prefs.__values['editor.lineWrapping'],
    foldGutter: true,
    gutters: [
      ...prefs.__values[pEditorLinter] ? ['CodeMirror-lint-markers'] : [],
      'CodeMirror-linenumbers',
      'CodeMirror-foldgutter',
    ],
    matchBrackets: true,
    hintOptions: {},
    styleActiveLine: {nonEmpty: true},
    theme: prefs.__values[THEME_KEY],
    keyMap: prefs.__values[pKeyMap],
    extraKeys,
    maxHighlightLength: 100e3,
    workTime: 50,
    undoDepth: 1000,
  }));
})();

// Adding hotkeys to some keymaps except 'basic' which is primitive by design
const KM = CodeMirror.keyMap;
const extras = new Set(Object.values(extraKeys));
if (!extras.has('jumpToLine')) {
  KM.sublime['Ctrl-G'] =
  KM.emacsy['Ctrl-G'] =
  KM.pcDefault['Ctrl-J'] =
  KM.macDefault['Cmd-J'] = 'jumpToLine';
}
if (!extras.has('autocomplete')) {
  // will be used by 'sublime' on PC via fallthrough
  KM.pcDefault['Ctrl-Space'] =
  // OSX uses Ctrl-Space and Cmd-Space for something else
  KM.macDefault['Alt-Space'] =
  // copied from 'emacs' keymap
  KM.emacsy['Alt-/'] = 'autocomplete';
  // 'vim' and 'emacs' define their own autocomplete hotkeys
}
if (!extras.has('blockComment')) {
  KM.sublime['Shift-Ctrl-/'] = 'commentSelection';
}
if (WINDOWS) {
  // 'pcDefault' keymap on Windows should have F3/Shift-F3/Ctrl-R
  if (!extras.has('findNext')) KM.pcDefault['F3'] = 'findNext';
  if (!extras.has('findPrev')) KM.pcDefault['Shift-F3'] = 'findPrev';
  if (!extras.has('replace')) KM.pcDefault['Ctrl-R'] = 'replace';
  // try to remap non-interceptable (Shift-)Ctrl-N/T/W hotkeys
  // Note: modifier order in CodeMirror is S-C-A
  for (const char of ['N', 'T', 'W']) {
    for (const remap of [
      {from: 'Ctrl-', to: ['Alt-', 'Ctrl-Alt-']},
      {from: 'Shift-Ctrl-', to: ['Ctrl-Alt-', 'Shift-Ctrl-Alt-']},
    ]) {
      const oldKey = remap.from + char;
      for (const km of Object.values(KM)) {
        const command = km[oldKey];
        if (!command) continue;
        for (const newMod of remap.to) {
          const newKey = newMod + char;
          if (newKey in km) continue;
          km[newKey] = command;
          delete km[oldKey];
          break;
        }
      }
    }
  }
}

/** @namespace CM */
Object.assign(CodeMirror.prototype, {
  /**
   * @param {UsercssData} meta
   * @param {boolean} [force]
   */
  setPreprocessor(meta, force) {
    const pp = meta.preprocessor;
    const name = getPreprocessorMode(pp);
    const m = this.doc.mode;
    const {helperType} = m;
    if (force || (helperType ? helperType !== pp : m.name !== name)) {
      this.setOption('mode', name);
    }
    return name;
  },
  /** Superfast GC-friendly check that runs until the first non-space line */
  isBlank() {
    let filled;
    this.eachLine(({text}) => (filled = text && rxNonSpace.test(text)));
    return !filled;
  },
  /**
   * Sets cursor and centers it in view if `pos` was out of view
   * @param {CodeMirror.Pos} pos
   * @param {CodeMirror.Pos} [end] - will set a selection from `pos` to `end`
   */
  jumpToPos(pos, end = pos) {
    const {curOp} = this;
    if (!curOp) this.startOperation();
    const y = this.cursorCoords(pos, 'window').top;
    const rect = this.display.wrapper.getBoundingClientRect();
    // case 1) outside of CM viewport or too close to edge so tell CM to render a new viewport
    if (y < rect.top + 50 || y > rect.bottom - 100) {
      this.scrollIntoView(pos, rect.height / 2);
    // case 2) inside CM viewport but outside of window viewport so just scroll the window
    } else if (y < 0 || y > innerHeight) {
      self.editor?.scrollToEditor(this);
    }
    // Using prototype since our bookmark patch sets cm.setSelection to jumpToPos
    CodeMirror.prototype.setSelection.call(this, pos, end);
    if (!curOp) this.endOperation();
  },
});

Object.assign(CodeMirror.commands, {
  jumpToLine(cm) {
    const cur = cm.getCursor();
    const oldDialog = cm.display.wrapper.$('.CodeMirror-dialog');
    if (oldDialog) cm.focus(); // close the currently opened minidialog
    cm.openDialog(template.jumpToLine.cloneNode(true), str => {
      const [line, ch] = str.match(/^\s*(\d+)(?:\s*:\s*(\d+))?\s*$|$/);
      if (line) cm.setCursor(line - 1, ch ? ch - 1 : cur.ch);
    }, {value: cur.line + 1});
  },
  showCurrentLineAtTop(cm) {
    cm.scrollTo(null, 1e99);
    cm.scrollIntoView();
  },
  showCurrentLineAtBottom(cm) {
    cm.scrollTo(null, 0);
    cm.scrollIntoView();
  },
});
