/* global dirtyReporter showHelp toggleContextMenuDelete createSection
  CodeMirror linter createLivePreview showCodeMirrorPopup
  sectionsToMozFormat messageBox clipString
  rerouteHotkeys $ $$ $create t FIREFOX API
  debounce */
/* exported createSectionsEditor */
'use strict';

function createSectionsEditor({style, onTitleChanged}) {
  let INC_ID = 0; // an increment id that is used by various object to track the order
  const dirty = dirtyReporter();

  const container = $('#sections');
  const sections = [];

  container.classList.add('section-editor');

  const nameEl = $('#name');
  nameEl.addEventListener('input', () => {
    dirty.modify('name', style.name, nameEl.value);
    style.name = nameEl.value;
    onTitleChanged();
  });

  const enabledEl = $('#enabled');
  enabledEl.addEventListener('change', () => {
    dirty.modify('enabled', style.enabled, enabledEl.checked);
    style.enabled = enabledEl.checked;
    updateLivePreview();
  });

  updateHeader();
  rerouteHotkeys(true);

  $('#to-mozilla').addEventListener('click', showMozillaFormat);
  $('#to-mozilla-help').addEventListener('click', showToMozillaHelp);
  $('#from-mozilla').addEventListener('click', () => showMozillaFormatImport());
  $('#save-button').addEventListener('click', saveStyle);

  document.addEventListener('wheel', scrollEntirePageOnCtrlShift, {passive: false});
  CodeMirror.defaults.extraKeys['Shift-Ctrl-Wheel'] = 'scrollWindow';

  if (!FIREFOX) {
    $$([
      'input:not([type])',
      'input[type="text"]',
      'input[type="search"]',
      'input[type="number"]',
    ].join(','))
      .forEach(e => e.addEventListener('mousedown', toggleContextMenuDelete));
  }

  const xo = window.IntersectionObserver && new IntersectionObserver(entries => {
    for (const {isIntersecting, target} of entries) {
      if (isIntersecting) {
        target.CodeMirror.refresh();
        xo.unobserve(target);
      }
    }
  }, {rootMargin: '100%'});
  const refreshOnView = (cm, force) =>
    force || !xo ?
      cm.refresh() :
      xo.observe(cm.display.wrapper);

  let sectionOrder = '';
  let headerOffset; // in compact mode the header is at the top so it reduces the available height
  const initializing = initSections(style.sections.slice());

  const livePreview = createLivePreview();
  livePreview.show(Boolean(style.id));

  return {
    ready: () => initializing,
    replaceStyle,
    dirty,
    getStyle: () => style,
    getEditors,
    scrollToEditor,
    getStyleId: () => style.id,
    getEditorTitle: cm => {
      const index = sections.filter(s => !s.isRemoved()).findIndex(s => s.cm === cm);
      return `${t('sectionCode')} ${index + 1}`;
    },
    save: saveStyle,
    toggleStyle,
    nextEditor,
    prevEditor,
    closestVisible,
    getSearchableInputs,
  };

  function fitToContent(section) {
    const {cm, cm: {display: {wrapper, sizer}}} = section;
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
        headerOffset = wrapper.getBoundingClientRect().top;
      }
      contentHeight += 9; // border & resize grip
      cm.off('update', resize);
      const cmHeight = wrapper.offsetHeight;
      const maxHeight = (window.innerHeight - headerOffset) - (section.el.offsetHeight - cmHeight);
      cm.setSize(null, Math.min(contentHeight, maxHeight));
    }
  }

  function fitToAvailableSpace() {
    const available =
      Math.floor(container.offsetHeight - sections.reduce((h, s) => h + s.el.offsetHeight, 0)) ||
      window.innerHeight - container.offsetHeight;
    if (available <= 0) {
      return;
    }
    const cmHeights = sections.map(s => s.cm.getWrapperElement().offsetHeight);
    sections.forEach((section, i) => {
      section.cm.setSize(null, cmHeights[i] + Math.floor(available / sections.length));
    });
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

  function getSearchableInputs(cm) {
    return sections.find(s => s.cm === cm).appliesTo.map(a => a.valueEl).filter(Boolean);
  }

  // priority:
  // 1. associated CM for applies-to element
  // 2. last active if visible
  // 3. first visible
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
      const editors = getEditors();
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
        scrollToEditor(cm);
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

  function getEditors() {
    return sections.filter(s => !s.isRemoved()).map(s => s.cm);
  }

  function toggleStyle() {
    const newValue = !style.enabled;
    dirty.modify('enabled', style.enabled, newValue);
    style.enabled = newValue;
    enabledEl.checked = newValue;
    updateLivePreview();
  }

  function nextEditor(cm, cycle = true) {
    if (!cycle && findLast(sections, s => !s.isRemoved()).cm === cm) {
      return;
    }
    return nextPrevEditor(cm, 1);
  }

  function prevEditor(cm, cycle = true) {
    if (!cycle && sections.find(s => !s.isRemoved()).cm === cm) {
      return;
    }
    return nextPrevEditor(cm, -1);
  }

  function findLast(arr, match) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (match(arr[i])) {
        return arr[i];
      }
    }
  }

  function nextPrevEditor(cm, direction) {
    const editors = getEditors();
    cm = editors[(editors.indexOf(cm) + direction + editors.length) % editors.length];
    scrollToEditor(cm);
    cm.focus();
    return cm;
  }

  function scrollToEditor(cm) {
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
  }

  function getLastActivatedEditor() {
    let result;
    for (const section of sections) {
      if (section.isRemoved()) {
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

    function doImport({replaceOldStyle = false}) {
      lockPageUI(true);
      API.parseCss({code: popup.codebox.getValue().trim()})
        .then(({sections, errors}) => {
          // shouldn't happen but just in case
          if (!sections.length || errors.length) {
            throw errors;
          }
          if (replaceOldStyle) {
            return replaceSections(sections);
          }
          return initSections(sections, {focusOn: false});
        })
        .then(() => {
          $('.dismiss').dispatchEvent(new Event('click'));
        })
        .catch(showError)
        .then(() => lockPageUI(false));
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
    const validSections = sections.filter(s => !s.isRemoved());
    sectionOrder = validSections.map(s => s.id).join(',');
    dirty.modify('sectionOrder', oldOrder, sectionOrder);
    container.dataset.sectionCount = validSections.length;
    linter.refreshReport();
  }

  function getModel() {
    return Object.assign({}, style, {
      sections: sections.filter(s => !s.isRemoved()).map(s => s.getModel())
    });
  }

  function validate() {
    if (!nameEl.reportValidity()) {
      messageBox.alert(t('styleMissingName'));
      return false;
    }
    for (const section of sections) {
      for (const apply of section.appliesTo) {
        if (apply.getType() !== 'regexp') {
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

  function saveStyle() {
    if (!dirty.isDirty()) {
      return;
    }
    const newStyle = getModel();
    if (!validate(newStyle)) {
      return;
    }
    API.editSave(newStyle)
      .then(newStyle => {
        destroyRemovedSections();
        sessionStorage.justEditedStyleId = newStyle.id;
        replaceStyle(newStyle, false);
      });
  }

  function destroyRemovedSections() {
    for (let i = 0; i < sections.length;) {
      if (!sections[i].isRemoved()) {
        i++;
        continue;
      }
      sections[i].destroy();
      sections[i].el.remove();
      sections.splice(i, 1);
    }
  }

  function updateHeader() {
    nameEl.value = style.name || '';
    enabledEl.checked = style.enabled !== false;
    $('#url').href = style.url || '';
    onTitleChanged();
  }

  function updateLivePreview() {
    debounce(_updateLivePreview, 200);
  }

  function _updateLivePreview() {
    livePreview.update(getModel());
  }

  function initSections(originalSections, {
    total = originalSections.length,
    focusOn = 0,
  } = {}) {
    let done;
    return new Promise(resolve => {
      done = resolve;
      chunk(true);
    });
    function chunk(forceRefresh) {
      const t0 = performance.now();
      while (originalSections.length && performance.now() - t0 < 100) {
        insertSectionAfter(originalSections.shift(), undefined, forceRefresh);
        dirty.clear();
        if (focusOn !== false && sections[focusOn]) {
          sections[focusOn].cm.focus();
          focusOn = false;
        }
      }
      setGlobalProgress(total - originalSections.length, total);
      if (!originalSections.length) {
        setGlobalProgress();
        fitToAvailableSpace();
        done();
      } else {
        setTimeout(chunk);
      }
    }
  }

  function removeSection(section) {
    if (sections.every(s => s.isRemoved() || s === section)) {
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

  function restoreSection(section) {
    section.restore();
    updateSectionOrder();
    section.onChange(updateLivePreview);
    updateLivePreview();
  }

  function insertSectionAfter(init, base, forceRefresh) {
    if (!init) {
      init = {code: '', urlPrefixes: ['http://example.com']};
    }
    const section = createSection({
      originalSection: init,
      genId,
      dirty,
      showMozillaFormatImport,
      removeSection,
      restoreSection,
      insertSectionAfter,
      moveSectionUp,
      moveSectionDown,
      prevEditor,
      nextEditor
    });
    const {cm} = section;
    sections.splice(base ? sections.indexOf(base) + 1 : sections.length, 0, section);
    container.insertBefore(section.el, base ? base.el.nextSibling : null);
    refreshOnView(cm, forceRefresh);
    if (!base || init.code) {
      // Fit a) during startup or b) when the clone button is clicked on a section with some code
      fitToContent(section);
    }
    if (base) {
      cm.focus();
      setTimeout(scrollToEditor, 0, cm);
    }
    updateSectionOrder();
    section.onChange(updateLivePreview);
    updateLivePreview();
  }

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

  function replaceSections(originalSections) {
    for (const section of sections) {
      section.remove(true);
    }
    sections.length = 0;
    container.textContent = '';
    return initSections(originalSections);
  }

  function replaceStyle(newStyle, codeIsUpdated) {
    // FIXME: avoid recreating all editors?
    reinit().then(() => {
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
    });

    function reinit() {
      if (codeIsUpdated !== false) {
        return replaceSections(newStyle.sections.slice());
      }
      return Promise.resolve();
    }
  }
}
