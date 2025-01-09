import '@/js/dom-init';
import {tBody} from '@/js/localization';
import * as prefs from '@/js/prefs';
import {CodeMirror} from '@/cm';
import CompactHeader, {toggleSticky} from './compact-header';
import editor from './editor';
import EditorHeader from './editor-header';
import * as linterMan from './linter';
import loading from './load-style';
import './on-msg-extension';
import './settings';
import SectionsEditor from './sections-editor';
import SourceEditor from './source-editor';
import './colorpicker-helper';
import './live-preview';
import USWIntegration from './usw-integration';
import './windowed-mode';
import './edit.css';
/** Loading here to avoid a separate tiny file in dist */
import './autocomplete.css';

tBody();

(async () => {
  if (loading) await loading;
  if (editor.scrollInfo.sticky) toggleSticky(true);
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
  $id('name').required = !editor.isUsercss;
  $id('save-button').onclick = editor.save;
  $id('cancel-button').onclick = editor.cancel;
  // $id('testRE').hidden = !editor.style.sections.some(({regexps: r}) => r && r.length);
  $id('testRE').onclick = async function () {
    (this.onclick = (await import('./regexp-tester')).toggle)(true);
  };
  $id('lint-help').onclick = async function () {
    (this.onclick = (await import('./linter/dialogs')).showLintHelp)();
  };
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
