/* global template cmFactory $ propertyToCss CssToProperty linter regExpTester
  FIREFOX toggleContextMenuDelete beautify showHelp t tryRegExp */
/* exported createSection */
'use strict';

function createResizeGrip(cm) {
  const wrapper = cm.display.wrapper;
  wrapper.classList.add('resize-grip-enabled');
  const resizeGrip = template.resizeGrip.cloneNode(true);
  wrapper.appendChild(resizeGrip);
  let lastClickTime = 0;
  let initHeight;
  let initY;
  resizeGrip.onmousedown = event => {
    initHeight = wrapper.offsetHeight;
    initY = event.pageY;
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
      const height = Math.max(minHeight, initHeight + e.pageY - initY);
      if (height !== wrapper.offsetHeight) {
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

function createSection({
  // data model
  originalSection,
  dirty,
  // util
  nextEditor,
  prevEditor,
  genId,
  // emit events
  // TODO: better names like `onRemoved`? Or make a real event emitter.
  showMozillaFormatImport,
  removeSection,
  insertSectionAfter,
  moveSectionUp,
  moveSectionDown,
  restoreSection,
}) {
  const sectionId = genId();
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

  const section = {
    id: sectionId,
    el,
    cm,
    render,
    getModel,
    remove,
    destroy,
    restore,
    isRemoved: () => removed,
    onChange,
    off,
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
        showMozillaFormatImport(text);
      }
    });
    if (!FIREFOX) {
      cm.on('mousedown', (cm, event) => toggleContextMenuDelete.call(cm, event));
    }
    cm.display.wrapper.addEventListener('keydown', event =>
      handleKeydown(cm, event), true);

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

  function handleKeydown(cm, event) {
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
        cm = line === 0 && prevEditor(cm, false);
        if (!cm) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
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
        cm = line === cm.doc.size - 1 && nextEditor(cm, false);
        if (!cm) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
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

  function showAppliesToHelp(event) {
    event.preventDefault();
    showHelp(t('appliesLabel'), t('appliesHelp'));
  }

  function remove() {
    linter.disableForEditor(cm);
    el.classList.add('removed');
    removed = true;
    appliesTo.forEach(a => a.remove());
  }

  function destroy() {
    cmFactory.destroy(cm);
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
    const applyId = genId();
    const dirtyPrefix = `section.${sectionId}.apply.${applyId}`;
    const el = all ? template.appliesToEverything.cloneNode(true) :
      template.appliesTo.cloneNode(true);

    const selectEl = !all && $('.applies-type', el);
    if (selectEl) {
      selectEl.value = type;
      selectEl.addEventListener('change', () => {
        const oldType = type;
        dirty.modify(`${dirtyPrefix}.type`, type, selectEl.value);
        type = selectEl.value;
        if (oldType === 'regexp' || type === 'regexp') {
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

    restore();

    const apply = {
      id: applyId,
      all,
      remove,
      restore,
      el,
      getType: () => type,
      getValue: () => value,
      valueEl // used by validator
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
      if (all) {
        return;
      }
      dirty.remove(`${dirtyPrefix}.type`, type);
      dirty.remove(`${dirtyPrefix}.value`, value);
    }

    function restore() {
      if (all) {
        return;
      }
      dirty.add(`${dirtyPrefix}.type`, type);
      dirty.add(`${dirtyPrefix}.value`, value);
    }
  }
}
