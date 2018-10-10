/* global dirtyReporter showToMozillaHelp
  showSectionHelp toggleContextMenuDelete setGlobalProgress maximizeCodeHeight
  CodeMirror nextPrevEditorOnKeydown showAppliesToHelp propertyToCss
  regExpTester linter createLivePreview showCodeMirrorPopup
  sectionsToMozFormat editorWorker messageBox clipString beautify
  rerouteHotkeys cmFactory CssToProperty
*/
'use strict';

function createResizeGrip(cm) {
  const wrapper = cm.display.wrapper;
  wrapper.classList.add('resize-grip-enabled');
  const resizeGrip = template.resizeGrip.cloneNode(true);
  wrapper.appendChild(resizeGrip);
  let lastClickTime = 0;
  resizeGrip.onmousedown = event => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (Date.now() - lastClickTime < 500) {
      lastClickTime = 0;
      toggleSectionHeight(cm);
      return;
    }
    lastClickTime = Date.now();
    const minHeight = cm.defaultTextHeight() +
      /* .CodeMirror-lines padding */
      cm.display.lineDiv.offsetParent.offsetTop +
      /* borders */
      wrapper.offsetHeight - wrapper.clientHeight;
    wrapper.style.pointerEvents = 'none';
    document.body.style.cursor = 's-resize';
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', resizeStop);

    function resize(e) {
      const cmPageY = wrapper.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(minHeight, e.pageY - cmPageY);
      if (height !== wrapper.clientHeight) {
        cm.setSize(null, height);
      }
    }

    function resizeStop() {
      document.removeEventListener('mouseup', resizeStop);
      document.removeEventListener('mousemove', resize);
      wrapper.style.pointerEvents = '';
      document.body.style.cursor = '';
    }
  };

  function toggleSectionHeight(cm) {
    if (cm.state.toggleHeightSaved) {
      // restore previous size
      cm.setSize(null, cm.state.toggleHeightSaved);
      cm.state.toggleHeightSaved = 0;
    } else {
      // maximize
      const wrapper = cm.display.wrapper;
      const allBounds = $('#sections').getBoundingClientRect();
      const pageExtrasHeight = allBounds.top + window.scrollY +
        parseFloat(getComputedStyle($('#sections')).paddingBottom);
      const sectionEl = wrapper.parentNode;
      const sectionExtrasHeight = sectionEl.clientHeight - wrapper.offsetHeight;
      cm.state.toggleHeightSaved = wrapper.clientHeight;
      cm.setSize(null, window.innerHeight - sectionExtrasHeight - pageExtrasHeight);
      const bounds = sectionEl.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
        window.scrollBy(0, bounds.top);
      }
    }
  }
}

function createSectionsEditor(style) {
  let INC_ID = 0; // an increment id that is used by various object to track the order
  const dirty = dirtyReporter();
  dirty.onChange(updateTitle);

  const container = $('#sections');
  const sections = [];

  const nameEl = $('#name');
  nameEl.addEventListener('change', () => {
    dirty.modify('name', style.name, nameEl.value);
    style.name = nameEl.value;
  });

  const enabledEl = $('#enabled');
  enabledEl.addEventListener('change', () => {
    dirty.modify('enabled', style.enabled, enabledEl.checked);
    style.enabled = enabledEl.checked;
    updateLivePreview();
  });

  $('#to-mozilla').addEventListener('click', showMozillaFormat);
  $('#to-mozilla-help').addEventListener('click', showToMozillaHelp);
  $('#from-mozilla').addEventListener('click', () => fromMozillaFormat());
  $('#save-button').addEventListener('click', saveStyle);
  $('#sections-help').addEventListener('click', showSectionHelp);

  document.addEventListener('wheel', scrollEntirePageOnCtrlShift);

  if (!FIREFOX) {
    $$([
      'input:not([type])',
      'input[type="text"]',
      'input[type="search"]',
      'input[type="number"]',
    ].join(','))
      .forEach(e => e.addEventListener('mousedown', toggleContextMenuDelete));
  }

  let sectionOrder = '';
  const initializing = new Promise(resolve => initSection({
    sections: style.sections.slice(),
    done:() => {
      // FIXME: implement this with CSS?
      // https://github.com/openstyles/stylus/commit/2895ce11e271788df0e4f7314b3b981fde086574
      dirty.clear();
      rerouteHotkeys(true);
      resolve();
      updateHeader();
    }
  }));

  const livePreview = createLivePreview();
  livePreview.show(Boolean(style.id));

  return {
    ready: () => initializing,
    replaceStyle,
    isDirty: dirty.isDirty,
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
      nearbyElement instanceof Node &&
        (nearbyElement.closest('#sections > .section') || {}).CodeMirror ||
      getLastActivatedEditor();
    console.log(cm);
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
      const section = cm.display.wrapper.closest('.section');
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

  function getEditors() {
    return sections.filter(s => !s.isRemoved()).map(s => s.cm);
  }

  function toggleStyle() {
    const newValue = !style.enabled;
    dirty.modify('enabled', style.enabled, newValue);
    style.enabled = newValue;
    enabledEl.checked = newValue;
  }

  function nextEditor(cm) {
    return nextPrevEditor(cm, 1);
  }

  function prevEditor(cm) {
    return nextPrevEditor(cm, -1);
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

  function nextPrevEditorOnKeydown(cm, event) {
    const key = event.which;
    if (key < 37 || key > 40 || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }
    const {line, ch} = cm.getCursor();
    switch (key) {
      case 37:
        // arrow Left
        if (line || ch) {
          return;
        }
      // fallthrough to arrow Up
      case 38:
        // arrow Up
        if (line > 0 || cm === sections[0].cm) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        cm = prevEditor(cm);
        cm.setCursor(cm.doc.size - 1, key === 37 ? 1e20 : ch);
        break;
      case 39:
        // arrow Right
        if (line < cm.doc.size - 1 || ch < cm.getLine(line).length - 1) {
          return;
        }
      // fallthrough to arrow Down
      case 40:
        // arrow Down
        if (line < cm.doc.size - 1 || cm === sections[sections.length - 1].cm) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        cm = nextEditor(cm);
        cm.setCursor(0, 0);
        break;
    }
    // FIXME: what is this?
    // const animation = (cm.getSection().firstElementChild.getAnimations() || [])[0];
    // if (animation) {
      // animation.playbackRate = -1;
      // animation.currentTime = 2000;
      // animation.play();
    // }
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

  function fromMozillaFormat(text = '') {
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
      editorWorker.parseMozFormat({code: popup.codebox.getValue().trim()})
        .then(({sections, errors}) => {
          // shouldn't happen but just in case
          if (!sections.length || errors.length) {
            throw errors;
          }
          if (replaceOldStyle) {
            return replaceSections(sections);
          }
          return new Promise(resolve => initSection({sections, done: resolve, focusOn: false}));
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
        sessionStorage.justEditedStyleId = newStyle.id;
        replaceStyle(newStyle);
      });
  }

  function updateHeader() {
    nameEl.value = style.name || '';
    enabledEl.checked = style.enabled !== false;
    $('#url').href = style.url || '';
    updateTitle();
  }

  function updateLivePreview() {
    debounce(_updateLivePreview, 200);
  }

  function _updateLivePreview() {
    livePreview.update(getModel());
  }

  function updateTitle() {
    const name = style.name;
    const clean = !dirty.isDirty();
    const title = !style.id ? t('addStyleTitle') : name;
    document.title = (clean ? '' : '* ') + title;
    $('#save-button').disabled = clean;
  }

  function initSection({
    sections: originalSections,
    total = originalSections.length,
    focusOn = 0,
    done
  }) {
    if (!originalSections.length) {
      setGlobalProgress();
      if (focusOn !== false) {
        sections[focusOn].cm.focus();
      }
      if (done) {
        done();
      }
      return;
    }
    insertSectionAfter(originalSections.shift());
    setGlobalProgress(total - originalSections.length, total);
    setTimeout(initSection, 0, {
      sections: originalSections,
      total,
      focusOn,
      done
    });
  }

  function removeSection(section) {
    if (sections.every(s => s.isRemoved() || s === section)) {
      throw new Error('Cannot remove last section');
    }
    if (!section.getCode()) {
      const index = sections.indexOf(section);
      sections.splice(index, 1);
      section.el.remove();
      section.remove(true);
    } else {
      const lines = [];
      const MAX_LINES = 10;
      section.cm.doc.iter(0, MAX_LINES + 1, ({text}) => lines.push(text) && false);
      const title = t('sectionCode') + '\n' +
                   '-'.repeat(20) + '\n' +
                   lines.slice(0, MAX_LINES).map(s => clipString(s, 100)).join('\n') +
                   (lines.length > MAX_LINES ? '\n...' : '');
      $('.deleted-section', section.el).title = title;
      section.remove(false);
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

  function insertSectionAfter(init, base) {
    if (!init) {
      init = {code: '', urlPrefixes: ['http://example.com']};
    }
    const section = createSection(init);
    if (base) {
      const index = sections.indexOf(base);
      sections.splice(index + 1, 0, section);
      container.insertBefore(section.el, base.el.nextSibling);
    } else {
      sections.push(section);
      container.appendChild(section.el);
    }
    section.render();
    // maximizeCodeHeight(section.el);
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

  function createSection(originalSection) {
    const sectionId = INC_ID++;
    const el = template.section.cloneNode(true);
    const cm = cmFactory.create(wrapper => {
      el.insertBefore(wrapper, $('.code-label', el).nextSibling);
    }, {value: originalSection.code});

    const changeListeners = new Set();

    const appliesToContainer = $('.applies-to-list', el);
    const appliesTo = [];
    for (const [key, fnName] of Object.entries(propertyToCss)) {
      if (originalSection[key]) {
        originalSection[key].forEach(value =>
          insertApplyAfter({type: fnName, value})
        );
      }
    }
    if (!appliesTo.length) {
      insertApplyAfter({all: true});
    }

    let changeGeneration = cm.changeGeneration();
    let removed = false;

    registerEvents();
    updateRegexpTester();
    createResizeGrip(cm);

    linter.enableForEditor(cm);

    let lastActive = 0;

    const section = {
      id: sectionId,
      el,
      cm,
      render,
      getCode,
      getModel,
      remove,
      restore,
      isRemoved: () => removed,
      onChange,
      off,
      getLastActive: () => lastActive,
      appliesTo
    };
    return section;

    function onChange(fn) {
      changeListeners.add(fn);
    }

    function off(fn) {
      changeListeners.delete(fn);
    }

    function emitSectionChange() {
      for (const fn of changeListeners) {
        fn();
      }
    }

    function getModel() {
      const section = {
        code: cm.getValue()
      };
      for (const apply of appliesTo) {
        if (apply.all) {
          continue;
        }
        const key = CssToProperty[apply.getType()];
        if (!section[key]) {
          section[key] = [];
        }
        section[key].push(apply.getValue());
      }
      return section;
    }

    function registerEvents() {
      cm.on('changes', () => {
        const newGeneration = cm.changeGeneration();
        dirty.modify(`section.${sectionId}.code`, changeGeneration, newGeneration);
        changeGeneration = newGeneration;
        emitSectionChange();
      });
      cm.on('paste', (cm, event) => {
        const text = event.clipboardData.getData('text') || '';
        if (
          text.includes('@-moz-document') &&
          text.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')
            .match(/@-moz-document[\s\r\n]+(url|url-prefix|domain|regexp)\(/)
        ) {
          event.preventDefault();
          fromMozillaFormat(text);
        }
        // FIXME: why?
        // if (editors.length === 1) {
          // setTimeout(() => {
            // if (cm.display.sizer.clientHeight > cm.display.wrapper.clientHeight) {
              // maximizeCodeHeight.stats = null;
              // maximizeCodeHeight(cm.getSection(), true);
            // }
          // });
        // }
      });
      if (!FIREFOX) {
        cm.on('mousedown', (cm, event) => toggleContextMenuDelete.call(cm, event));
      }
      cm.on('focus', () => {
        lastActive = Date.now();
      });

      cm.display.wrapper.addEventListener('keydown', event =>
        nextPrevEditorOnKeydown(cm, event), true);

      $('.applies-to-help', el).addEventListener('click', showAppliesToHelp);
      $('.remove-section', el).addEventListener('click', () => removeSection(section));
      $('.add-section', el).addEventListener('click', () => insertSectionAfter(undefined, section));
      $('.clone-section', el).addEventListener('click', () => insertSectionAfter(getModel(), section));
      $('.move-section-up', el).addEventListener('click', () => moveSectionUp(section));
      $('.move-section-down', el).addEventListener('click', () => moveSectionDown(section));
      $('.beautify-section', el).addEventListener('click', () => beautify([cm]));
      $('.restore-section', el).addEventListener('click', () => restoreSection(section));
      $('.test-regexp', el).addEventListener('click', () => {
        regExpTester.toggle();
        updateRegexpTester();
      });
    }

    function getCode() {
      return cm.getValue();
    }

    function remove(destroy = false) {
      linter.disableForEditor(cm);
      el.classList.add('removed');
      removed = true;
      appliesTo.forEach(a => a.remove());
      if (destroy) {
        cmFactory.destroy(cm);
      }
    }

    function restore() {
      linter.enableForEditor(cm);
      el.classList.remove('removed');
      removed = false;
      appliesTo.forEach(a => a.restore());
      render();
    }

    function render() {
      cm.refresh();
    }

    function updateRegexpTester() {
      const regexps = appliesTo.filter(a => a.getType() === 'regexp')
        .map(a => a.getValue());
      if (regexps.length) {
        el.classList.add('has-regexp');
        regExpTester.update(regexps);
      } else {
        el.classList.remove('has-regexp');
        regExpTester.toggle(false);
      }
    }

    function insertApplyAfter(init, base) {
      const apply = createApply(init);
      if (base) {
        const index = appliesTo.indexOf(base);
        appliesTo.splice(index + 1, 0, apply);
        appliesToContainer.insertBefore(apply.el, base.el.nextSibling);
      } else {
        appliesTo.push(apply);
        appliesToContainer.appendChild(apply.el);
      }
      dirty.add(apply, apply);
      if (appliesTo.length > 1 && appliesTo[0].all) {
        removeApply(appliesTo[0]);
      }
      emitSectionChange();
    }

    function removeApply(apply) {
      const index = appliesTo.indexOf(apply);
      appliesTo.splice(index, 1);
      apply.remove();
      apply.el.remove();
      dirty.remove(apply, apply);
      if (!appliesTo.length) {
        insertApplyAfter({all: true});
      }
      emitSectionChange();
    }

    function createApply({type = 'url', value, all = false}) {
      const applyId = INC_ID++;
      const dirtyPrefix = `section.${sectionId}.apply.${applyId}`;
      const el = all ? template.appliesToEverything.cloneNode(true) :
        template.appliesTo.cloneNode(true);

      const selectEl = !all && $('.applies-type', el);
      if (selectEl) {
        selectEl.value = type;
        selectEl.addEventListener('change', () => {
          const oldKey = type;
          dirty.modify(`${dirtyPrefix}.type`, type, selectEl.value);
          type = selectEl.value;
          if (oldKey === 'regexp' || type === 'regexp') {
            updateRegexpTester();
          }
          emitSectionChange();
          validate();
        });
      }

      const valueEl = !all && $('.applies-value', el);
      if (valueEl) {
        valueEl.value = value;
        valueEl.addEventListener('input', () => {
          dirty.modify(`${dirtyPrefix}.value`, value, valueEl.value);
          value = valueEl.value;
          if (type === 'regexp') {
            updateRegexpTester();
          }
          emitSectionChange();
        });
        valueEl.addEventListener('change', validate);
      }

      const apply = {
        id: applyId,
        all,
        remove,
        restore,
        el,
        getType: () => type,
        getValue: () => value,
        valueEl
      };

      const removeButton = $('.remove-applies-to', el);
      if (removeButton) {
        removeButton.addEventListener('click', e => {
          e.preventDefault();
          removeApply(apply);
        });
      }
      $('.add-applies-to', el).addEventListener('click', e => {
        e.preventDefault();
        insertApplyAfter({type, value: ''}, apply);
      });

      return apply;

      function validate() {
        if (type !== 'regexp' || tryRegExp(value)) {
          valueEl.setCustomValidity('');
        } else {
          valueEl.setCustomValidity(t('styleBadRegexp'));
          setTimeout(() => valueEl.reportValidity());
        }
      }

      function remove() {
        dirty.remove(`${dirtyPrefix}.type`, type);
        dirty.remove(`${dirtyPrefix}.value`, value);
      }

      function restore() {
        dirty.add(`${dirtyPrefix}.type`, type);
        dirty.add(`${dirtyPrefix}.value`, value);
      }
    }
  }

  function replaceSections(originalSections) {
    for (const section of sections) {
      section.remove(true);
    }
    sections.length = 0;
    container.textContent = '';
    return new Promise(resolve => initSection({sections: originalSections, done: resolve}));
  }

  function replaceStyle(newStyle, codeIsUpdated) {
    // FIXME: avoid recreating all editors?
    reinit().then(() => {
      style = newStyle;
      updateHeader();
      dirty.clear();
      // Go from new style URL to edit style URL
      if (location.href.indexOf('id=') === -1 && style.id) {
        history.replaceState({}, document.title, 'edit.html?id=' + style.id);
        $('#heading').textContent = t('editStyleHeading');
      }
      livePreview.show(Boolean(style.id));
    });

    function reinit() {
      if (codeIsUpdated !== false) {
        return replaceSections(newStyle.sections.slice());
      }
      return Promise.resolve();
    }
  }
}
