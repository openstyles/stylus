/* global
  $
  $$
  $create
  API
  clipString
  CodeMirror
  createLivePreview
  createSection
  debounce
  editor
  FIREFOX
  ignoreChromeError
  linter
  messageBox
  prefs
  sectionsToMozFormat
  sessionStore
  showCodeMirrorPopup
  showHelp
  t
*/
'use strict';

/* exported SectionsEditor */

function SectionsEditor() {
  const {style, dirty} = editor;
  const container = $('#sections');
  /** @type {EditorSection[]} */
  const sections = [];
  const xo = window.IntersectionObserver &&
    new IntersectionObserver(refreshOnViewListener, {rootMargin: '100%'});
  const livePreview = createLivePreview(null, style.id);

  let INC_ID = 0; // an increment id that is used by various object to track the order
  let sectionOrder = '';
  let headerOffset; // in compact mode the header is at the top so it reduces the available height

  container.classList.add('section-editor');
  updateHeader();
  $('#to-mozilla').on('click', showMozillaFormat);
  $('#to-mozilla-help').on('click', showToMozillaHelp);
  $('#from-mozilla').on('click', () => showMozillaFormatImport());
  document.on('wheel', scrollEntirePageOnCtrlShift, {passive: false});
  CodeMirror.defaults.extraKeys['Shift-Ctrl-Wheel'] = 'scrollWindow';
  if (!FIREFOX) {
    $$('input:not([type]), input[type=text], input[type=search], input[type=number]')
      .forEach(e => e.on('mousedown', toggleContextMenuDelete));
  }

  /** @namespace SectionsEditor */
  Object.assign(editor, {

    sections,

    closestVisible,
    updateLivePreview,

    getEditors() {
      return sections.filter(s => !s.removed).map(s => s.cm);
    },

    getEditorTitle(cm) {
      const index = editor.getEditors().indexOf(cm);
      return `${t('sectionCode')} ${index + 1}`;
    },

    getSearchableInputs(cm) {
      return sections.find(s => s.cm === cm).appliesTo.map(a => a.valueEl).filter(Boolean);
    },

    jumpToEditor(i) {
      const {cm} = sections[i] || {};
      if (cm) {
        editor.scrollToEditor(cm);
        cm.focus();
      }
    },

    nextEditor(cm, cycle = true) {
      return cycle || cm !== findLast(sections, s => !s.removed).cm
        ? nextPrevEditor(cm, 1)
        : null;
    },

    prevEditor(cm, cycle = true) {
      return cycle || cm !== sections.find(s => !s.removed).cm
        ? nextPrevEditor(cm, -1)
        : null;
    },

    async replaceStyle(newStyle, codeIsUpdated) {
      dirty.clear('name');
      // FIXME: avoid recreating all editors?
      if (codeIsUpdated !== false) {
        await initSections(newStyle.sections, {replace: true, pristine: true});
      }
      Object.assign(style, newStyle);
      updateHeader();
      dirty.clear();
      // Go from new style URL to edit style URL
      if (location.href.indexOf('id=') === -1 && style.id) {
        history.replaceState({}, document.title, 'edit.html?id=' + style.id);
        $('#heading').textContent = t('editStyleHeading');
      }
      livePreview.show(Boolean(style.id));
      updateLivePreview();
    },

    async save() {
      if (!dirty.isDirty()) {
        return;
      }
      let newStyle = getModel();
      if (!validate(newStyle)) {
        return;
      }
      newStyle = await API.editSave(newStyle);
      destroyRemovedSections();
      sessionStore.justEditedStyleId = newStyle.id;
      editor.replaceStyle(newStyle, false);
    },

    scrollToEditor(cm) {
      const section = sections.find(s => s.cm === cm).el;
      const bounds = section.getBoundingClientRect();
      if (
        (bounds.bottom > window.innerHeight && bounds.top > 0) ||
        (bounds.top < 0 && bounds.bottom < window.innerHeight)
      ) {
        if (bounds.top < 0) {
          window.scrollBy(0, bounds.top - 1);
        } else {
          window.scrollBy(0, bounds.bottom - window.innerHeight + 1);
        }
      }
    },
  });

  editor.ready = initSections(style.sections, {pristine: true});

  /** @param {EditorSection} section */
  function fitToContent(section) {
    const {el, cm, cm: {display: {wrapper, sizer}}} = section;
    if (cm.display.renderedView) {
      resize();
    } else {
      cm.on('update', resize);
    }

    function resize() {
      let contentHeight = sizer.offsetHeight;
      if (contentHeight < cm.defaultTextHeight()) {
        return;
      }
      if (headerOffset == null) {
        headerOffset = el.getBoundingClientRect().top;
      }
      contentHeight += 9; // border & resize grip
      cm.off('update', resize);
      const cmHeight = wrapper.offsetHeight;
      const appliesToHeight = Math.min(section.el.offsetHeight - cmHeight, window.innerHeight / 2);
      const maxHeight = (window.innerHeight - headerOffset) - appliesToHeight;
      const fit = Math.min(contentHeight, maxHeight);
      if (Math.abs(fit - cmHeight) > 1) {
        cm.setSize(null, fit);
      }
    }
  }

  function fitToAvailableSpace() {
    const lastSectionBottom = sections[sections.length - 1].el.getBoundingClientRect().bottom;
    const delta = Math.floor((window.innerHeight - lastSectionBottom) / sections.length);
    if (delta > 1) {
      sections.forEach(({cm}) => {
        cm.setSize(null, cm.display.lastWrapHeight + delta);
      });
    }
  }

  function genId() {
    return INC_ID++;
  }

  function setGlobalProgress(done, total) {
    const progressElement = $('#global-progress') ||
      total && document.body.appendChild($create('#global-progress'));
    if (total) {
      const progress = (done / Math.max(done, total) * 100).toFixed(1);
      progressElement.style.borderLeftWidth = progress + 'vw';
      setTimeout(() => {
        progressElement.title = progress + '%';
      });
    } else {
      $.remove(progressElement);
    }
  }

  function showToMozillaHelp(event) {
    event.preventDefault();
    showHelp(t('styleMozillaFormatHeading'), t('styleToMozillaFormatHelp'));
  }

  /**
   priority:
   1. associated CM for applies-to element
   2. last active if visible
   3. first visible
   */
  function closestVisible(nearbyElement) {
    const cm =
      nearbyElement instanceof CodeMirror ? nearbyElement :
        nearbyElement instanceof Node && getAssociatedEditor(nearbyElement) || getLastActivatedEditor();
    if (nearbyElement instanceof Node && cm) {
      const {left, top} = nearbyElement.getBoundingClientRect();
      const bounds = cm.display.wrapper.getBoundingClientRect();
      if (top >= 0 && top >= bounds.top &&
          left >= 0 && left >= bounds.left) {
        return cm;
      }
    }
    // closest editor should have at least 2 lines visible
    const lineHeight = sections[0].cm.defaultTextHeight();
    const scrollY = window.scrollY;
    const windowBottom = scrollY + window.innerHeight - 2 * lineHeight;
    const allSectionsContainerTop = scrollY + $('#sections').getBoundingClientRect().top;
    const distances = [];
    const alreadyInView = cm && offscreenDistance(null, cm) === 0;
    return alreadyInView ? cm : findClosest();

    function offscreenDistance(index, cm) {
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
      const cm = editors[b];
      if (distances[b] > 0) {
        editor.scrollToEditor(cm);
      }
      return cm;
    }
  }

  function getAssociatedEditor(nearbyElement) {
    for (let el = nearbyElement; el; el = el.parentElement) {
      // added by createSection
      if (el.CodeMirror) {
        return el.CodeMirror;
      }
    }
  }

  function findLast(arr, match) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (match(arr[i])) {
        return arr[i];
      }
    }
  }

  function nextPrevEditor(cm, direction) {
    const editors = editor.getEditors();
    cm = editors[(editors.indexOf(cm) + direction + editors.length) % editors.length];
    editor.scrollToEditor(cm);
    cm.focus();
    return cm;
  }

  function getLastActivatedEditor() {
    let result;
    for (const section of sections) {
      if (section.removed) {
        continue;
      }
      // .lastActive is initiated by codemirror-factory
      if (!result || section.cm.lastActive > result.lastActive) {
        result = section.cm;
      }
    }
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
    const popup = showCodeMirrorPopup(t('styleToMozillaFormatTitle'), '', {readOnly: true});
    popup.codebox.setValue(sectionsToMozFormat(getModel()));
    popup.codebox.execCommand('selectAll');
  }

  function showMozillaFormatImport(text = '') {
    const popup = showCodeMirrorPopup(t('styleFromMozillaFormatPrompt'),
      $create('.buttons', [
        $create('button', {
          name: 'import-replace',
          textContent: t('importReplaceLabel'),
          title: 'Ctrl-Shift-Enter:\n' + t('importReplaceTooltip'),
          onclick: () => doImport({replaceOldStyle: true}),
        }),
        $create('button', {
          name: 'import-append',
          textContent: t('importAppendLabel'),
          title: 'Ctrl-Enter:\n' + t('importAppendTooltip'),
          onclick: doImport,
        }),
      ]));
    const contents = $('.contents', popup);
    contents.insertBefore(popup.codebox.display.wrapper, contents.firstElementChild);
    popup.codebox.focus();
    popup.codebox.on('changes', cm => {
      popup.classList.toggle('ready', !cm.isBlank());
      cm.markClean();
    });
    if (text) {
      popup.codebox.setValue(text);
      popup.codebox.clearHistory();
      popup.codebox.markClean();
    }
    // overwrite default extraKeys as those are inapplicable in popup context
    popup.codebox.options.extraKeys = {
      'Ctrl-Enter': doImport,
      'Shift-Ctrl-Enter': () => doImport({replaceOldStyle: true}),
    };

    async function doImport({replaceOldStyle = false}) {
      lockPageUI(true);
      try {
        const code = popup.codebox.getValue().trim();
        if (!/==userstyle==/i.test(code) ||
            !await getPreprocessor(code) ||
            await messageBox.confirm(
              t('importPreprocessor'), 'pre-line',
              t('importPreprocessorTitle'))
        ) {
          const {sections, errors} = await API.parseCss({code});
          // shouldn't happen but just in case
          if (!sections.length || errors.length) {
            throw errors;
          }
          await initSections(sections, {
            replace: replaceOldStyle,
            focusOn: replaceOldStyle ? 0 : false,
          });
          $('.dismiss').dispatchEvent(new Event('click'));
        }
      } catch (err) {
        showError(err);
      }
      lockPageUI(false);
    }

    async function getPreprocessor(code) {
      try {
        return (await API.buildUsercssMeta({sourceCode: code})).usercssData.preprocessor;
      } catch (e) {}
    }

    function lockPageUI(locked) {
      document.documentElement.style.pointerEvents = locked ? 'none' : '';
      if (popup.codebox) {
        popup.classList.toggle('ready', locked ? false : !popup.codebox.isBlank());
        popup.codebox.options.readOnly = locked;
        popup.codebox.display.wrapper.style.opacity = locked ? '.5' : '';
      }
    }

    function showError(errors) {
      messageBox({
        className: 'center danger',
        title: t('styleFromMozillaFormatError'),
        contents: $create('pre', Array.isArray(errors) ? errors.join('\n') : errors),
        buttons: [t('confirmClose')],
      });
    }
  }

  function updateSectionOrder() {
    const oldOrder = sectionOrder;
    const validSections = sections.filter(s => !s.removed);
    sectionOrder = validSections.map(s => s.id).join(',');
    dirty.modify('sectionOrder', oldOrder, sectionOrder);
    container.dataset.sectionCount = validSections.length;
    linter.refreshReport();
    editor.updateToc();
  }

  /** @returns {Style} */
  function getModel() {
    return Object.assign({}, style, {
      sections: sections.filter(s => !s.removed).map(s => s.getModel())
    });
  }

  function validate() {
    if (!$('#name').reportValidity()) {
      messageBox.alert(t('styleMissingName'));
      return false;
    }
    for (const section of sections) {
      for (const apply of section.appliesTo) {
        if (apply.type !== 'regexp') {
          continue;
        }
        if (!apply.valueEl.reportValidity()) {
          messageBox.alert(t('styleBadRegexp'));
          return false;
        }
      }
    }
    return true;
  }

  function destroyRemovedSections() {
    for (let i = 0; i < sections.length;) {
      if (!sections[i].removed) {
        i++;
        continue;
      }
      sections[i].destroy();
      sections[i].el.remove();
      sections.splice(i, 1);
    }
  }

  function updateHeader() {
    $('#name').value = style.customName || style.name || '';
    $('#enabled').checked = style.enabled !== false;
    $('#url').href = style.url || '';
    editor.updateName();
  }

  function updateLivePreview() {
    debounce(updateLivePreviewNow, editor.previewDelay);
  }

  function updateLivePreviewNow() {
    livePreview.update(getModel());
  }

  function initSections(originalSections, {
    focusOn = 0,
    replace = false,
    pristine = false,
  } = {}) {
    if (replace) {
      sections.forEach(s => s.remove(true));
      sections.length = 0;
      container.textContent = '';
    }
    let done;
    const total = originalSections.length;
    originalSections = originalSections.slice();
    return new Promise(resolve => {
      done = resolve;
      chunk(true);
    });
    function chunk(forceRefresh) {
      const t0 = performance.now();
      while (originalSections.length && performance.now() - t0 < 100) {
        insertSectionAfter(originalSections.shift(), undefined, forceRefresh);
        if (pristine) dirty.clear();
        if (focusOn !== false && sections[focusOn]) {
          sections[focusOn].cm.focus();
          focusOn = false;
        }
      }
      setGlobalProgress(total - originalSections.length, total);
      if (!originalSections.length) {
        setGlobalProgress();
        requestAnimationFrame(fitToAvailableSpace);
        done();
      } else {
        setTimeout(chunk);
      }
    }
  }

  /** @param {EditorSection} section */
  function removeSection(section) {
    if (sections.every(s => s.removed || s === section)) {
      // TODO: hide remove button when `#sections[data-section-count=1]`
      throw new Error('Cannot remove last section');
    }
    if (section.cm.isBlank()) {
      const index = sections.indexOf(section);
      sections.splice(index, 1);
      section.el.remove();
      section.remove();
      section.destroy();
    } else {
      const lines = [];
      const MAX_LINES = 10;
      section.cm.doc.iter(0, MAX_LINES + 1, ({text}) => lines.push(text) && false);
      const title = t('sectionCode') + '\n' +
                   '-'.repeat(20) + '\n' +
                   lines.slice(0, MAX_LINES).map(s => clipString(s, 100)).join('\n') +
                   (lines.length > MAX_LINES ? '\n...' : '');
      $('.deleted-section', section.el).title = title;
      section.remove();
    }
    dirty.remove(section, section);
    updateSectionOrder();
    section.off(updateLivePreview);
    updateLivePreview();
  }

  /** @param {EditorSection} section */
  function restoreSection(section) {
    section.restore();
    updateSectionOrder();
    section.onChange(updateLivePreview);
    updateLivePreview();
  }

  /**
   * @param {StyleSection} [init]
   * @param {EditorSection} [base]
   * @param {boolean} [forceRefresh]
   */
  function insertSectionAfter(init, base, forceRefresh) {
    if (!init) {
      init = {code: '', urlPrefixes: ['http://example.com']};
    }
    const section = createSection(init, genId);
    const {cm} = section;
    sections.splice(base ? sections.indexOf(base) + 1 : sections.length, 0, section);
    container.insertBefore(section.el, base ? base.el.nextSibling : null);
    refreshOnView(cm, forceRefresh);
    registerEvents(section);
    if (!base || init.code) {
      // Fit a) during startup or b) when the clone button is clicked on a section with some code
      fitToContent(section);
    }
    if (base) {
      cm.focus();
      setTimeout(editor.scrollToEditor, 0, cm);
      linter.enableForEditor(cm);
    }
    updateSectionOrder();
    section.onChange(updateLivePreview);
    updateLivePreview();
  }

  /** @param {EditorSection} section */
  function moveSectionUp(section) {
    const index = sections.indexOf(section);
    if (index === 0) {
      return;
    }
    container.insertBefore(section.el, sections[index - 1].el);
    sections[index] = sections[index - 1];
    sections[index - 1] = section;
    updateSectionOrder();
  }

  /** @param {EditorSection} section */
  function moveSectionDown(section) {
    const index = sections.indexOf(section);
    if (index === sections.length - 1) {
      return;
    }
    container.insertBefore(sections[index + 1].el, section.el);
    sections[index] = sections[index + 1];
    sections[index + 1] = section;
    updateSectionOrder();
  }

  /** @param {EditorSection} section */
  function registerEvents(section) {
    const {el, cm} = section;
    $('.applies-to-help', el).onclick = () => showHelp(t('appliesLabel'), t('appliesHelp'));
    $('.remove-section', el).onclick = () => removeSection(section);
    $('.add-section', el).onclick = () => insertSectionAfter(undefined, section);
    $('.clone-section', el).onclick = () => insertSectionAfter(section.getModel(), section);
    $('.move-section-up', el).onclick = () => moveSectionUp(section);
    $('.move-section-down', el).onclick = () => moveSectionDown(section);
    $('.restore-section', el).onclick = () => restoreSection(section);
    cm.on('paste', maybeImportOnPaste);
    if (!FIREFOX) {
      cm.on('mousedown', (cm, event) => toggleContextMenuDelete.call(cm, event));
    }
  }

  function maybeImportOnPaste(cm, event) {
    const text = event.clipboardData.getData('text') || '';
    if (/@-moz-document/i.test(text) &&
      /@-moz-document\s+(url|url-prefix|domain|regexp)\(/i
        .test(text.replace(/\/\*([^*]|\*(?!\/))*(\*\/|$)/g, ''))
    ) {
      event.preventDefault();
      showMozillaFormatImport(text);
    }
  }

  function refreshOnView(cm, force) {
    return force || !xo ?
      cm.refresh() :
      xo.observe(cm.display.wrapper);
  }

  function refreshOnViewListener(entries) {
    for (const {isIntersecting, target} of entries) {
      if (isIntersecting) {
        target.CodeMirror.refresh();
        xo.unobserve(target);
      }
    }
  }

  function toggleContextMenuDelete(event) {
    if (chrome.contextMenus && event.button === 2 && prefs.get('editor.contextDelete')) {
      chrome.contextMenus.update('editor.contextDelete', {
        enabled: Boolean(
          this.selectionStart !== this.selectionEnd ||
          this.somethingSelected && this.somethingSelected()
        ),
      }, ignoreChromeError);
    }
  }
}
