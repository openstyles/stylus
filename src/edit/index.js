import {$, $$, $create, important} from '/js/dom';
import {t} from '/js/localization';
import * as prefs from '/js/prefs';
import '/css/global.css';
import '/css/global-dark.css';
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
import 'codemirror/mode/css/css';
import 'codemirror/mode/stylus/stylus';
import '/vendor-overwrites/codemirror-addon/match-highlighter.js';
import '/js/color/color-picker.css';
import './codemirror-default.css';
import './edit.css';
import './settings.css';
import Autocomplete from './autocomplete';
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
  await (editor.isUsercss ? SourceEditor : SectionsEditor)();

  editor.dirty.onChange(editor.updateDirty);
  prefs.subscribe('editor.linter', () => linterMan.run());

  // enabling after init to prevent flash of validation failure on an empty name
  $('#name').required = !editor.isUsercss;
  $('#save-button').onclick = editor.save;
  $('#cancel-button').onclick = editor.cancel;
  $('#lint-help').onclick = showLintHelp;
  $('#testRE').hidden = !editor.style.sections.some(({regexps: r}) => r && r.length);
  $('#testRE').onclick = () => require(['/edit/regexp-tester.css'], () => regexpTester.toggle(true));
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

  Autocomplete();
  Drafts();
  GlobalSearch();
});

styleReady.then(async () => {
  // Set up mini-header on scroll
  const {isUsercss} = editor;
  const el = $create({
    style: important(`
      top: 0;
      height: 1px;
      position: absolute;
      visibility: hidden;
    `),
  });
  const scroller = isUsercss ? $('.CodeMirror-scroll') : document.body;
  const xoRoot = isUsercss ? scroller : undefined;
  const xo = new IntersectionObserver(onScrolled, {root: xoRoot});
  const elInfo = $('h1 a');
  scroller.appendChild(el);
  onCompactToggled(editor.mqCompact);
  editor.mqCompact.on('change', onCompactToggled);

  /** @param {MediaQueryList} mq */
  function onCompactToggled(mq) {
    for (const el of $$('details[data-pref]')) {
      el.open = mq.matches ? false :
        el.classList.contains('ignore-pref') ? el.open :
          prefs.get(el.dataset.pref);
    }
    if (mq.matches) {
      xo.observe(el);
      $('#basic-info-name').after(elInfo);
    } else {
      xo.disconnect();
      $('h1').append(elInfo);
    }
  }

  /** @param {IntersectionObserverEntry[]} entries */
  function onScrolled(entries) {
    const h = $('#header');
    const sticky = !entries.pop().intersectionRatio;
    if (!isUsercss) scroller.style.paddingTop = sticky ? h.offsetHeight + 'px' : '';
    h.classList.toggle('sticky', sticky);
  }
});
