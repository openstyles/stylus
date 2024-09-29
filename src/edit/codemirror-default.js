import {$} from '/js/dom';
import CodeMirror from 'codemirror';
import {UA, deepMerge} from '/js/toolbox';
import editor from './editor';
import * as prefs from '/js/prefs';
import {t} from '/js/localization';

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

prefs.ready.then(() => {
  // CodeMirror miserably fails on keyMap='' so let's ensure it's not
  if (!prefs.get('editor.keyMap')) {
    prefs.reset('editor.keyMap');
  }

  const defaults = {
    autoCloseBrackets: prefs.get('editor.autoCloseBrackets'),
    mode: 'css',
    lineNumbers: true,
    lineWrapping: prefs.get('editor.lineWrapping'),
    foldGutter: true,
    gutters: [
      ...(prefs.get('editor.linter') ? ['CodeMirror-lint-markers'] : []),
      'CodeMirror-linenumbers',
      'CodeMirror-foldgutter',
    ],
    matchBrackets: true,
    hintOptions: {},
    lintReportDelay: prefs.get('editor.lintReportDelay'),
    styleActiveLine: {nonEmpty: true},
    theme: prefs.get('editor.theme'),
    keyMap: prefs.get('editor.keyMap'),
    extraKeys,
    maxHighlightLength: 100e3,
    undoDepth: 1000,
  };

  deepMerge(prefs.get('editor.options'), Object.assign(CodeMirror.defaults, defaults));
  CodeMirror.mimeModes['text/css'].allowNested = true;

  // Adding hotkeys to some keymaps except 'basic' which is primitive by design
  {
    const KM = CodeMirror.keyMap;
    const extras = Object.values(extraKeys);
    if (!extras.includes('jumpToLine')) {
      KM.sublime['Ctrl-G'] = 'jumpToLine';
      KM.emacsy['Ctrl-G'] = 'jumpToLine';
      KM.pcDefault['Ctrl-J'] = 'jumpToLine';
      KM.macDefault['Cmd-J'] = 'jumpToLine';
    }
    if (!extras.includes('autocomplete')) {
      // will be used by 'sublime' on PC via fallthrough
      KM.pcDefault['Ctrl-Space'] = 'autocomplete';
      // OSX uses Ctrl-Space and Cmd-Space for something else
      KM.macDefault['Alt-Space'] = 'autocomplete';
      // copied from 'emacs' keymap
      KM.emacsy['Alt-/'] = 'autocomplete';
      // 'vim' and 'emacs' define their own autocomplete hotkeys
    }
    if (!extras.includes('blockComment')) {
      KM.sublime['Shift-Ctrl-/'] = 'commentSelection';
    }
    if (UA.windows) {
      // 'pcDefault' keymap on Windows should have F3/Shift-F3/Ctrl-R
      if (!extras.includes('findNext')) KM.pcDefault['F3'] = 'findNext';
      if (!extras.includes('findPrev')) KM.pcDefault['Shift-F3'] = 'findPrev';
      if (!extras.includes('replace')) KM.pcDefault['Ctrl-R'] = 'replace';
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
  }

  Object.assign(CodeMirror.prototype, {
    /**
     * @param {'less' | 'stylus' | ?} [pp] - any value besides `less` or `stylus` sets `css` mode
     * @param {boolean} [force]
     */
    setPreprocessor(pp, force) {
      const name = pp === 'less' ? 'text/x-less' : pp === 'stylus' ? pp : 'css';
      const m = this.doc.mode;
      if (force || (m.helperType ? m.helperType !== pp : m.name !== name)) {
        this.setOption('mode', name);
        this.doc.mode.lineComment = ''; // stylelint chokes on line comments a lot
      }
    },
    /** Superfast GC-friendly check that runs until the first non-space line */
    isBlank() {
      let filled;
      this.eachLine(({text}) => (filled = text && /\S/.test(text)));
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
        editor.scrollToEditor(this);
      }
      // Using prototype since our bookmark patch sets cm.setSelection to jumpToPos
      CodeMirror.prototype.setSelection.call(this, pos, end);
      if (!curOp) this.endOperation();
    },
  });

  Object.assign(CodeMirror.commands, {
    jumpToLine(cm) {
      const cur = cm.getCursor();
      const oldDialog = $('.CodeMirror-dialog', cm.display.wrapper);
      if (oldDialog) cm.focus(); // close the currently opened minidialog
      cm.openDialog(t.template.jumpToLine.cloneNode(true), str => {
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
});
