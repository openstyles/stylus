import '/content/apply.js';
import {$, $$} from '/js/dom';
import {t} from '/js/localization';
import * as prefs from '/js/prefs';
// import '/css/global.css';
// import '/css/global-dark.css';
// import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/dialog/dialog';
// import 'codemirror/addon/dialog/dialog.css';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
// import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/indent-fold';
import 'codemirror/addon/hint/anyword-hint';
import 'codemirror/addon/hint/css-hint';
import 'codemirror/addon/hint/show-hint';
// import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/addon/lint/lint';
// import 'codemirror/addon/lint/lint.css';
import 'codemirror/addon/scroll/annotatescrollbar';
import 'codemirror/addon/search/matchesonscrollbar';
// import 'codemirror/addon/search/matchesonscrollbar.css';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/selection/active-line';
import 'codemirror/keymap/emacs';
import 'codemirror/keymap/sublime';
import 'codemirror/keymap/vim';
import 'codemirror/mode/css/css';
import 'codemirror/mode/stylus/stylus';
import '/vendor-overwrites/codemirror-addon/match-highlighter.js';
// import '/js/color/color-picker.css';
// import './codemirror-default.css';
// import './edit.css';
// import './regexp-tester.css';
// import './settings.css';
import Autocomplete from './autocomplete';
import CompactHeader from './compact-header';
import Drafts from './drafts';
import editor from './editor';
import EditorHeader from './editor-header';
import GlobalSearch from './global-search';
import {showLintHelp} from './linter-dialogs';
import linterMan from './linter-manager';
import * as regexpTester from './regexp-tester';
import SectionsEditor from './sections-editor';
import SourceEditor from './source-editor';
import styleReady from './style-ready';
import './colorpicker-helper';
import './live-preview';
import './on-msg-extension';
import './settings';
import './usw-integration';
import './windowed-mode';

t.body();

styleReady.then(async () => {
  EditorHeader();
  // TODO: load respective js on demand?
  await (editor.isUsercss ? SourceEditor : SectionsEditor)();
  editor.dirty.onChange(editor.updateDirty);
  prefs.subscribe('editor.linter', () => linterMan.run());
  Autocomplete();
  CompactHeader();
  Drafts();
  GlobalSearch();
  // enabling after init to prevent flash of validation failure on an empty name
  $('#name').required = !editor.isUsercss;
  $('#save-button').onclick = editor.save;
  $('#cancel-button').onclick = editor.cancel;
  $('#lint-help').onclick = showLintHelp;
  $('#testRE').hidden = !editor.style.sections.some(({regexps: r}) => r && r.length);
  $('#testRE').onclick = () => regexpTester.toggle(true);
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
});
