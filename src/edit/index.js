import '@/js/dom-init';
import {pEditorLinter, pEditorLinterOn} from '@/js/consts';
import {subscribe} from '@/js/prefs';
import CompactHeader, {toggleSticky} from './compact-header';
import editor, {scrollInfo} from './editor';
import EditorHeader from './editor-header';
import {showLintConfig, showLintHelp} from './linter/dialogs';
import {linterPrefSubscriber} from './linter/engines';
import {loading} from './load-style';
import './on-msg-extension';
import './settings';
import SectionsEditor from './sections-editor';
import SourceEditor from './source-editor';
import './colorpicker-helper';
import USWIntegration from './usw-integration';
import './windowed-mode';
import './css/index.css';

(async () => {
  if (loading) await loading;
  if (scrollInfo.sticky) toggleSticky(true);
  const uc = editor.isUsercss;
  EditorHeader();
  USWIntegration();
  // TODO: load respective js on demand?
  $rootCL.add(uc ? 'usercss' : 'sectioned');

  (uc ? SourceEditor : SectionsEditor)();

  editor.dirty.onChange(editor.updateDirty);
  subscribe([pEditorLinter, pEditorLinterOn], linterPrefSubscriber, true);
  CompactHeader();
  // enabling after init to prevent flash of validation failure on an empty name
  $id('name').required = !uc;
  $id('save-button').onclick = editor.save;
  $id('cancel-button').onclick = editor.cancel;
  $('#lint-help').onclick = showLintHelp;
  $('#linter-settings').onclick =
  $('#lint .config').onclick = showLintConfig;
  // $id('testRE').hidden = !editor.style.sections.some(({regexps: r}) => r && r.length);
  const elSec = $id('sections-list');
  const elToc = $id('toc');
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
