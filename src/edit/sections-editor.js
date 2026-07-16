import {CodeMirror, extraKeys} from '@/cm';
import {kCodeMirror, pArrowKeysTraverse, pFavicons} from '@/js/consts';
import {$create, $root} from '@/js/dom';
import {messageBox, setInputValue} from '@/js/dom-util';
import {template} from '@/js/localization';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {getMetaComment, styleSectionsEqual, styleToCss} from '@/js/style-util';
import {clipString, sleep0, t} from '@/js/util';
import {iconize} from './applies-to';
import editor, {scrollInfo} from './editor';
import * as linterMan from './linter';
import livePreview from './live-preview';
import EditorSection from './sections-editor-section';
import {helpPopup, rerouteHotkeys, showCodeMirrorPopup, worker} from './util';

export default function SectionsEditor() {
  const {style, /** @type {DirtyReporter} */dirty} = editor;
  const container = $id('sections');
  /** @type {EditorSection[]} */
  const sections = [];
  /** @type {EditorSection[]} */
  const liveSections = [];
  const getLineHeight = () => liveSections.find(s => !s.init).cm.defaultTextHeight();
  const xo = new IntersectionObserver(refreshOnViewListener, {rootMargin: '100%'});
  const reifySection = /** @type {ProxyHandler} */ {
    get(obj, i) {
      const sec = this.src[i];
      return (obj[i] = sec.init ? sec.create() : sec.cm);
    },
  };
  let INC_ID = 0; // an increment id that is used by various object to track the order
  let arrayProps;
  /** @type {EditorSection[]} */
  let sectionOrder = '';

  updateMeta();
  rerouteHotkeys.toggle(true); // enabled initially because we don't always focus a CodeMirror
  $id('to-mozilla').on('click', showMozillaFormat);
  $id('from-mozilla').on('click', () => showMozillaFormatImport());
  document.on('wheel', scrollEntirePageOnCtrlShift, {passive: false});
  extraKeys['Shift-Ctrl-Wheel'] = 'scrollWindow';
  prefs.subscribe(pArrowKeysTraverse, (_, val) => {
    for (const s of sections) s.toggleTraverse(val);
  }, true);
  prefs.subscribe('editor.targetsFirst', (_, val) => {
    for (const sec of sections) {
      (val ? sec.elLabel : sec.targetsEl.nextSibling).after(sec.targetsEl);
    }
  });
  prefs.subscribe(pFavicons, (key, val) => {
    if (val) iconize(sections.map(sec => sec.targetsEl));
  });
  container.moveBefore ||= container.insertBefore;

  /** @namespace Editor */
  Object.assign(editor, {

    cm: {defaultTextHeight: getLineHeight},
    sections: liveSections,
    sectionsRaw: sections,

    closestVisible,
    importOnPaste,
    updateMeta,

    /** @return {EditorSection[] & {lazy?: true}} */
    getEditors(liveOnly) {
      if (liveOnly)
        return liveSections.map(s => !s.init && s.cm);
      let lazy;
      const res = Array(liveSections.length);
      for (let i = 0, sec; i < liveSections.length; i++) {
        sec = sections[i];
        if (sec.init) lazy = true;
        else res[i] = sec.cm;
      }
      if (lazy) {
        if (!arrayProps) {
          arrayProps = Object.getOwnPropertyDescriptors(Array.prototype);
          delete arrayProps.length;
        }
        Object.setPrototypeOf(res, new Proxy([], {...reifySection, src: [...liveSections]}));
        Object.defineProperties(res, arrayProps);
        res.lazy = true;
      }
      return res;
    },

    getEditorSibling(cm, direction) {
      return liveSections[(
        liveSections.indexOf(cm.editorSection) + direction + liveSections.length
      ) % liveSections.length].cm; // creates the editor if lazy
    },

    getEditorTitle(cm) {
      const index = liveSections.indexOf(cm.editorSection) + 1;
      return {
        textContent: `#${index}`,
        title: `${t('sectionCode')} ${index}`,
      };
    },

    getValue(asObject) {
      const st = getModel();
      return asObject ? st : styleToCss(st);
    },

    getSearchableInputs(cm) {
      const sec = cm.editorSection;
      return sec ? sec.targets.map(a => a.valueEl).filter(Boolean) : [];
    },

    isSame(styleObj) {
      return styleSectionsEqual(styleObj, getModel());
    },

    jumpToEditor(i) {
      const {cm} = liveSections[i] || {};
      editor.scrollToEditor(cm);
      cm.focus();
    },

    nextEditor(cm, upDown) {
      return !upDown || cm.editorSection !== liveSections[liveSections.length - 1]
        ? nextPrevEditor(cm, 1, upDown)
        : null;
    },

    prevEditor(cm, upDown) {
      return !upDown || cm.editorSection !== liveSections[0]
        ? nextPrevEditor(cm, -1, upDown)
        : null;
    },

    async replaceStyle(newStyle, draft) {
      const sameCode = editor.isSame(newStyle);
      if (!sameCode && !draft && !await messageBox.confirm(t('styleUpdateDiscardChanges'))) {
        return;
      }
      if (!draft) {
        dirty.clear();
      }
      // FIXME: avoid recreating all editors?
      if (!sameCode) {
        await initSections(newStyle.sections, {
          keepDirty: draft,
          replace: true,
          si: draft && draft.si,
        });
      }
      editor.useSavedStyle(newStyle);
      livePreview();
    },

    async saveImpl() {
      try {
        if (!$id('name').reportValidity()) throw t('styleMissingName');
        const res = await API.styles.editSave(getModel(), editor.msg);
        dirty.clear(); // cleaning only after saving has succeeded
        editor.useSavedStyle(res);
      } catch (err) {
        messageBox.alert(err.message || err);
      }
    },

    scrollToEditor(cm, partial) {
      const cc = partial && cm.cursorCoords(true, 'window');
      const {top: y1, bottom: y2} = cm.el.getBoundingClientRect();
      const rc = container.getBoundingClientRect();
      const rcY1 = Math.max(rc.top, 0);
      const rcY2 = Math.min(rc.bottom, innerHeight);
      const bad = partial
        ? cc.top < rcY1 || cc.top > rcY2 - 30
        : y1 >= rcY1 ^ y2 <= rcY2;
      if (bad) window.scrollBy(0, (y1 + y2 - rcY2 + rcY1) / 2 | 0);
    },
  });

  return initSections(style.sections);

  function fitToAvailableSpace() {
    const lastSectionBottom = Math.ceil(container.getBoundingClientRect().bottom);
    const delta = Math.floor((window.innerHeight - lastSectionBottom) / sections.length);
    if (delta > 1) {
      sections.forEach(s => {
        if (!s.init) s.cm.setSize(null, s.cm.display.lastWrapHeight + delta);
      });
    }
  }

  function genId() {
    return INC_ID++;
  }

  /**
   priority:
   1. associated CM for applies-to element
   2. last active if visible
   3. first visible
   */
  function closestVisible(el) {
    // closest editor should have at least 2 lines visible
    const lineHeight = getLineHeight();
    const margin = 2 * lineHeight;
    const cm = el instanceof CodeMirror ? el :
      el instanceof Node && getAssociatedEditor(el) || getLastActivatedEditor();
    if (el === cm) el = document.body;
    if (el instanceof Node && cm) {
      const {wrapper} = cm.display;
      if (!container.contains(el) || wrapper.closest('.section').contains(el)) {
        const rect = wrapper.getBoundingClientRect();
        if (rect.top < window.innerHeight - margin && rect.bottom > margin) {
          return cm;
        }
      }
    }
    const scrollY = window.scrollY;
    const windowBottom = scrollY + window.innerHeight - margin;
    const allSectionsContainerTop = scrollY + container.getBoundingClientRect().top;
    const distances = [];
    const alreadyInView = cm && offscreenDistance() === 0;
    return alreadyInView ? cm : findClosest();

    function offscreenDistance(index) {
      if (index >= 0 && distances[index] !== undefined) {
        return distances[index];
      }
      const section = cm && cm.display.wrapper.closest('.section');
      if (!section) {
        return 1e9;
      }
      const top = allSectionsContainerTop + section.offsetTop;
      if (top < scrollY + lineHeight) {
        return Math.max(0, scrollY - top - lineHeight);
      }
      if (top < windowBottom) {
        return 0;
      }
      const distance = top - windowBottom + section.offsetHeight;
      if (index >= 0) {
        distances[index] = distance;
      }
      return distance;
    }

    function findClosest() {
      const editors = editor.getEditors();
      const last = editors.length - 1;
      let a = 0;
      let b = last;
      let c;
      let distance;
      while (a < b - 1) {
        c = (a + b) / 2 | 0;
        distance = offscreenDistance(c);
        if (!distance || !c) {
          break;
        }
        const distancePrev = offscreenDistance(c - 1);
        const distanceNext = c < last ? offscreenDistance(c + 1) : 1e20;
        if (distancePrev <= distance && distance <= distanceNext) {
          b = c;
        } else {
          a = c;
        }
      }
      while (b && offscreenDistance(b - 1) <= offscreenDistance(b)) {
        b--;
      }
      const closest = editors[b];
      if (distances[b] > 0) {
        editor.scrollToEditor(closest);
      }
      return closest;
    }
  }

  function getAssociatedEditor(nearbyElement) {
    for (let el = nearbyElement; el; el = el.parentElement) {
      // added by EditorSection
      if (el[kCodeMirror]) {
        return el[kCodeMirror];
      }
    }
  }

  function nextPrevEditor(cm, direction, upDown) {
    cm = editor.getEditorSibling(cm, direction);
    editor.scrollToEditor(cm, upDown);
    cm.focus();
    return cm;
  }

  function getLastActivatedEditor() {
    let result;
    for (const s of liveSections)
      // .lastActive is initiated by codemirror-factory
      if (!result || !s.init && s.cm.lastActive > result.lastActive)
        result = s.cm;
    return result;
  }

  function scrollEntirePageOnCtrlShift(event) {
    // make Shift-Ctrl-Wheel scroll entire page even when mouse is over a code editor
    if (event.shiftKey && event.ctrlKey && !event.altKey && !event.metaKey) {
      // Chrome scrolls horizontally when Shift is pressed but on some PCs this might be different
      window.scrollBy(0, event.deltaX || event.deltaY);
      event.preventDefault();
    }
  }

  function showMozillaFormat() {
    const value = editor.getValue();
    const popup = showCodeMirrorPopup(
      t('styleToMozillaFormatTitle'),
      t('styleToMozillaFormatHelp'),
      {readOnly: true, value});
    const contents = popup._contents;
    const cm = popup.codebox;
    const copy = () => {
      navigator.clipboard.writeText(value);
      helpPopup.close();
    };
    contents.append($create('.buttons', [
      $create('button', {onclick: copy}, t('copy')),
      $create('button', {onclick: helpPopup.close}, t('confirmClose')),
    ]));
    cm.execCommand('selectAll');
  }

  function showMozillaFormatImport(text, newSections) {
    const popup = showCodeMirrorPopup(t('styleFromMozillaFormatPrompt'), '', {readOnly: !!text});
    const contents = popup._contents;
    const cm = popup.codebox;
    contents.append($create('.buttons', [
      $create('button', {
        title: 'Ctrl-Shift-Enter:\n' + t('importReplaceTooltip'),
        onclick: () => doImport({replaceOldStyle: true}),
      }, t('importReplaceLabel')),
      $create('button', {
        title: 'Ctrl-Enter:\n' + t('importAppendTooltip'),
        onclick: doImport,
      }, t('importAppendLabel')),
    ]));
    cm.focus();
    cm.on('changes', () => {
      popup.classList.toggle('ready', !cm.isBlank());
      cm.markClean();
    });
    if (text) {
      cm.setValue(text);
      cm.clearHistory();
      cm.markClean();
    }
    // overwrite default extraKeys as those are inapplicable in popup context
    cm.options.extraKeys = {
      'Ctrl-Enter': doImport,
      'Shift-Ctrl-Enter': () => doImport({replaceOldStyle: true}),
    };

    async function doImport({replaceOldStyle = false}) {
      lockPageUI(true);
      try {
        const code = text || cm.getValue().trim();
        const meta = getMetaComment(code);
        if (!meta.match(/[\r\n]\s*@preprocessor\s+\S/) ||
          await messageBox.alert(t('importPreprocessor'))
        ) {
          let name;
          newSections ||= await worker.extractSections(code);
          if (!newSections.length)
            throw t('emptyStyle');
          if (meta
          && (replaceOldStyle || !style.id)
          && (name = meta.match(/[\r\n]\s*@name\s+(.+)|$/)[1].trim())) {
            setInputValue($id('name'), name); // allows Ctrl-Z to undo
            editor.updateName(true);
          }
          await initSections(newSections, {
            replace: replaceOldStyle,
            focusOn: replaceOldStyle ? 0 : sections.length,
            keepDirty: true,
          });
          helpPopup.close();
        }
      } catch (err) {
        if (err) showError(err);
      }
      lockPageUI(false);
    }
    function lockPageUI(locked) {
      $root.style.pointerEvents = locked ? 'none' : '';
      if (popup.codebox === cm) {
        popup.classList.toggle('ready', locked ? false : !cm.isBlank());
        cm.options.readOnly = locked;
        cm.display.wrapper.style.opacity = locked ? '.5' : '';
      }
    }
    function showError(e) {
      messageBox.alert($create('pre', e.message || `${e}`), 'danger',
        t('styleFromMozillaFormatError'));
    }
  }

  function updateSectionOrder() {
    const oldOrder = sectionOrder;
    sectionOrder = liveSections.map(s => s.id).join(',');
    dirty.modify('sectionOrder', oldOrder, sectionOrder);
    container.dataset.sectionCount = liveSections.length;
    linterMan.refreshReport();
    editor.updateToc();
  }

  /** @returns {StyleObj} */
  function getModel() {
    return {
      ...style,
      sections: liveSections.map(s => s.getModel()),
    };
  }

  function updateMeta() {
    $id('name').value = style.customName || style.name || '';
    $id('enabled').checked = style.enabled !== false;
    $id('url').href = style.url || '';
    editor.updateName();
  }

  async function initSections(src, {
    focusOn = 0,
    replace = false,
    keepDirty = false,
    si = scrollInfo,
  } = {}) {
    if (replace) {
      for (const s of liveSections) s.toggle();
      liveSections.length = sections.length = 0;
      container.textContent = '';
    }
    if (si.cms && si.cms.length === src.length) {
      si.scrollY2 = si.scrollY + window.innerHeight;
      container.style.height = si.scrollY2 + 'px';
      scrollTo(0, si.scrollY);
      // only restore focus if it's the first CM to avoid derpy quirks
      focusOn = si.cms[0].focus && 0;
    } else {
      si = null;
    }
    let forceRefresh = true;
    let y = 0;
    let tPrev;
    editor.loading = dirty.paused = !keepDirty;
    for (let i = 0, iSec = sections.length; i < src.length; i++, iSec++) {
      const now = performance.now();
      if (!tPrev) {
        tPrev = now;
      } else if (now - tPrev > 100) {
        tPrev = 0;
        forceRefresh = false;
        await sleep0();
      }
      if (si) forceRefresh = y < si.scrollY2 && (y += si.cms[i].parentHeight) > si.scrollY;
      insertSectionAfter(src[i], null, forceRefresh, si && si.cms[i]);
      if (iSec === focusOn) setTimeout(editor.jumpToEditor, 0, iSec);
    }
    if (!si || si.cms.every(cm => !cm?.height)) {
      requestAnimationFrame(fitToAvailableSpace); // avoids FOUC, unlike IntersectionObserver
    }
    if (!forceRefresh) updateSectionOrder();
    container.style.removeProperty('height');
    editor.loading = dirty.paused = false;
  }

  /** @param {EditorSection} section */
  function removeSection(section) {
    if (liveSections.length === 1) {
      // TODO: hide remove button when `#sections[data-section-count=1]`
      throw new Error('Cannot remove last section');
    }
    if (section.cm.isBlank()) {
      sections.splice(sections.indexOf(section), 1);
      section.el.remove();
      section.toggle();
      section.destroy();
    } else {
      const lines = [];
      const MAX_LINES = 10;
      section.cm.doc.iter(0, MAX_LINES + 1, ({text}) => lines.push(text) && false);
      const title = t('sectionCode') + '\n' +
                   '-'.repeat(20) + '\n' +
                   lines.slice(0, MAX_LINES).map(s => clipString(s, 100)).join('\n') +
                   (lines.length > MAX_LINES ? '\n...' : '');
      const del = section.elDel = template.deletedSection.cloneNode(true);
      del.$('button').onclick = () => restoreSection(section);
      del.title = title;
      section.el.prepend(del);
      section.toggle();
    }
    liveSections.splice(liveSections.indexOf(section), 1);
    dirty.remove(section, section);
    updateSectionOrder();
    livePreview();
  }

  /** @param {EditorSection} section */
  function restoreSection(section) {
    section.elDel.remove();
    section.toggle(true);
    updateSectionOrder();
    livePreview();
  }

  /**
   * @param {StyleSection} [init]
   * @param {EditorSection} [base]
   * @param {boolean} [forceRefresh]
   * @param {EditorScrollInfo} [si]
   */
  function insertSectionAfter(init, base, forceRefresh, si) {
    if (!init) {
      init = {code: '', urlPrefixes: ['https://example.com/']};
    }
    forceRefresh ||= base;
    const section = new EditorSection(init, genId, si);
    const {code} = init;
    sections.splice(base ? sections.indexOf(base) + 1 : sections.length, 0, section);
    liveSections.splice(base ? liveSections.indexOf(base) + 1 : liveSections.length, 0, section);
    container.insertBefore(section.el, base ? base.el.nextSibling : null);
    if (forceRefresh) {
      // Fit a) during startup or b) when the clone button is clicked on a section with some code
      section.fit = (!si || !si.height) && (!base || !!code);
      refreshOnViewNow(section);
    } else {
      xo.observe(section.el);
    }
    if (base) {
      section.cm.focus();
      editor.scrollToEditor(section.cm);
    }
    if (forceRefresh) {
      updateSectionOrder();
      livePreview();
    }
  }

  /** @param {EditorSection} section
   * @param {-1 | 1} dir */
  function moveSection(section, dir) {
    let index = sections.indexOf(section);
    if (index === (dir < 0 ? 0 : sections.length - 1)) {
      return;
    }
    container.moveBefore(section.el, sections[index + (dir < 0 ? -1 : 2)]?.el);
    sections[index] = sections[index + dir];
    sections[index + dir] = section;
    index = liveSections.indexOf(section);
    liveSections[index] = liveSections[index + dir];
    liveSections[index + dir] = section;
    updateSectionOrder();
    editor.scrollToEditor(section.cm);
    section.cm.focus();
  }

  /** @param {UIEvent} evt */
  function onActionClick(evt) {
    const el = evt.target;
    const section = (/**@type{EditorSectionElement}*/el.closest('.section')).me;
    switch (el.classList.item(0)) {
      case 'remove-section': return removeSection(section);
      case 'add-section': return insertSectionAfter(undefined, section);
      case 'clone-section': return insertSectionAfter(section.getModel(), section);
      case 'move-section-up': return moveSection(section, -1);
      case 'move-section-down': return moveSection(section, 1);
    }
  }

  function importOnPaste(cm, event, text) {
    if (/@-moz-document/i.test(text) &&
        /@-moz-document\s+(url|url-prefix|domain|regexp)\(/i
          .test(text.replace(/\/\*([^*]+|\*(?!\/))*(\*\/|$)/g, ''))
    ) {
      event.preventDefault();
      showMozillaFormatImport(text);
    }
  }

  /** @param {IntersectionObserverEntry[]} entries */
  function refreshOnViewListener(entries) {
    for (const e of entries) {
      const r = e.intersectionRatio && e.intersectionRect;
      if (r) {
        const el = /**@type{EditorSectionElement}*/e.target;
        const section = el.me;
        xo.unobserve(el);
        if (r.bottom > 0 && r.top < innerHeight) {
          refreshOnViewNow(section);
        } else {
          setTimeout(refreshOnViewNow, 0, section);
        }
      }
    }
  }

  /** @param {EditorSection} section */
  async function refreshOnViewNow(section) {
    if (section.init) {
      section.create(true);
      section.el.$('.edit-actions').on('click', onActionClick);
    }
  }
}
