import '/js/dom-init';
import styleReady from './style-ready';
import {$, $$} from '/js/dom';
import {tBody, template} from '/js/localization';
import * as prefs from '/js/prefs';
import CodeMirror from 'codemirror';
import CompactHeader from './compact-header';
import editor from './editor';
import EditorHeader from './editor-header';
import * as linterMan from './linter';
import SectionsEditor from './sections-editor';
import SourceEditor from './source-editor';
import './edit.css';
import './colorpicker-helper';
import './live-preview';
import './on-msg-extension';
import './settings';
import USWIntegration from './usw-integration';
import './windowed-mode';

tBody();

(async () => {
  if (styleReady.then) await styleReady;
  EditorHeader();
  USWIntegration();
  // TODO: load respective js on demand?
  (editor.isUsercss ? SourceEditor : SectionsEditor)();
  editor.dirty.onChange(editor.updateDirty);
  prefs.subscribe('editor.linter', () => linterMan.run());
  CompactHeader();
  import('./lazy-init');
  const cmCommands = CodeMirror.commands;
  for (const cmd of ['find', 'findNext', 'findPrev', 'replace', 'replaceAll']) {
    cmCommands[cmd] = async (...args) => {
      await import('./global-search');
      cmCommands[cmd](...args);
    };
  }
  // enabling after init to prevent flash of validation failure on an empty name
  $('#name').required = !editor.isUsercss;
  $('#save-button').onclick = editor.save;
  $('#cancel-button').onclick = editor.cancel;
  // $('#testRE').hidden = !editor.style.sections.some(({regexps: r}) => r && r.length);
  $('#testRE').onclick = async function () {
    (this.onclick = (await import('./regexp-tester')).toggle)(true);
  };
  $('#lint-help').onclick = async function () {
    (this.onclick = (await import('./linter/dialogs')).showLintHelp)();
  };
  $('#linter-settings', template.editorSettings).onclick = async function () {
    (this.onclick = (await import('./linter/dialogs')).showLintConfig)();
  };
  $('#keyMap-help', template.editorSettings).onclick = async function () {
    (this.onclick = (await import('./show-keymap-help')).default)();
  };
  const elSec = $('#sections-list');
  const elToc = $('#toc');
  const moDetails = new MutationObserver(([{target: sec}]) => {
    if (!sec.open) return;
    if (sec === elSec) editor.updateToc();
    const el = sec.lastElementChild;
    const s = el.style;
    const x2 = sec.getBoundingClientRect().left + el.getBoundingClientRect().width;
    if (x2 > innerWidth - 30) s.right = '0';
    else if (s.right) s.removeProperty('right');
  });
  // editor.toc.expanded pref isn't saved in compact-layout so prefs.subscribe won't work
  if (elSec.open) editor.updateToc();
  // and we also toggle `open` directly in other places e.g. in detectLayout()
  for (const el of $$('#details-wrapper > details')) {
    moDetails.observe(el, {attributes: true, attributeFilter: ['open']});
  }
  elToc.onclick = e =>
    editor.jumpToEditor([].indexOf.call(elToc.children, e.target));
})();
