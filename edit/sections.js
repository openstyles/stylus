/*
global CodeMirror
global editors propertyToCss CssToProperty
global onChange indicateCodeChange initHooks setCleanGlobal
global fromMozillaFormat maximizeCodeHeight toggleContextMenuDelete
global setCleanItem updateTitle updateLintReportIfEnabled renderLintReport
global showAppliesToHelp beautify regExpTester setGlobalProgress setCleanSection
global clipString
*/
'use strict';

function initWithSectionStyle(style, codeIsUpdated) {
  $('#name').value = style.name || '';
  $('#enabled').checked = style.enabled !== false;
  $('#url').href = style.url || '';
  if (codeIsUpdated !== false) {
    editors.length = 0;
    $('#sections').textContent = '';
    addSections(style.sections.length ? style.sections : [{code: ''}]);
    initHooks();
  }
  setCleanGlobal();
  updateTitle();
}

function addSections(sections, onAdded = () => {}) {
  if (addSections.running) {
    console.error('addSections cannot be re-entered: please report to the developers');
    // TODO: handle this properly e.g. on update/import
    return;
  }
  addSections.running = true;
  maximizeCodeHeight.stats = null;
  // make a shallow copy since we might run asynchronously
  // and the original array might get modified
  sections = sections.slice();
  const t0 = performance.now();
  const divs = [];
  let index = 0;

  return new Promise(function run(resolve) {
    while (index < sections.length) {
      const div = addSection(null, sections[index]);
      maximizeCodeHeight(div, index === sections.length - 1);
      onAdded(div, index);
      divs.push(div);
      maybeFocusFirstCM();
      index++;
      const elapsed = performance.now() - t0;
      if (elapsed > 500) {
        setGlobalProgress(index, sections.length);
      }
      if (elapsed > 100) {
        // after 100ms the sections are added asynchronously
        setTimeout(run, 0, resolve);
        return;
      }
    }
    editors.last.state.renderLintReportNow = true;
    addSections.running = false;
    setGlobalProgress();
    resolve(divs);
  });

  function maybeFocusFirstCM() {
    const isPageLocked = document.documentElement.style.pointerEvents;
    if (divs[0] && (isPageLocked ? divs.length === sections.length : index === 0)) {
      makeSectionVisible(divs[0].CodeMirror);
      setTimeout(() => {
        if ((document.activeElement || {}).localName !== 'input') {
          divs[0].CodeMirror.focus();
        }
      });
    }
  }
}

function addSection(event, section) {
  const div = template.section.cloneNode(true);
  $('.applies-to-help', div).addEventListener('click', showAppliesToHelp);
  $('.remove-section', div).addEventListener('click', removeSection);
  $('.add-section', div).addEventListener('click', addSection);
  $('.clone-section', div).addEventListener('click', cloneSection);
  $('.move-section-up', div).addEventListener('click', moveSection);
  $('.move-section-down', div).addEventListener('click', moveSection);
  $('.beautify-section', div).addEventListener('click', beautify);

  const code = (section || {}).code || '';

  const appliesTo = $('.applies-to-list', div);
  let appliesToAdded = false;

  if (section) {
    for (const i in propertyToCss) {
      if (section[i]) {
        section[i].forEach(url => {
          addAppliesTo(appliesTo, propertyToCss[i], url);
          appliesToAdded = true;
        });
      }
    }
  }
  if (!appliesToAdded) {
    addAppliesTo(appliesTo, event && 'url-prefix', '');
  }

  appliesTo.addEventListener('change', onChange);
  appliesTo.addEventListener('input', onChange);

  toggleTestRegExpVisibility();
  appliesTo.addEventListener('change', toggleTestRegExpVisibility);
  $('.test-regexp', div).onclick = () => {
    regExpTester.toggle();
    regExpTester.update(getRegExps());
  };

  function getRegExps() {
    return [...appliesTo.children]
      .map(item =>
        !item.matches('.applies-to-everything') &&
        $('.applies-type', item).value === 'regexp' &&
        $('.applies-value', item).value.trim()
      )
      .filter(item => item);
  }

  function toggleTestRegExpVisibility() {
    const show = getRegExps().length > 0;
    div.classList.toggle('has-regexp', show);
    appliesTo.oninput = appliesTo.oninput || show && (event => {
      if (event.target.matches('.applies-value') &&
          $('.applies-type', event.target.closest('.applies-to-item')).value === 'regexp') {
        regExpTester.update(getRegExps());
      }
    });
  }

  const sections = $('#sections');
  let cm;
  if (event) {
    let clickedSection = event && getSectionForChild(event.target, {includeDeleted: true});
    clickedSection.insertAdjacentElement('afterend', div);
    while (clickedSection && !clickedSection.matches('.section')) {
      clickedSection = clickedSection.previousElementSibling;
    }
    const newIndex = getSections().indexOf(clickedSection) + 1;
    cm = setupCodeMirror(div, code, newIndex);
    makeSectionVisible(cm);
    renderLintReport();
    cm.focus();
  } else {
    sections.appendChild(div);
    cm = setupCodeMirror(div, code);
  }
  div.CodeMirror = cm;
  setCleanSection(div);
  return div;
}

// may be invoked as a DOM listener
function addAppliesTo(list, type, value) {
  let clickedItem;
  if (this instanceof Node) {
    clickedItem = this.closest('.applies-to-item');
    list = this.closest('.applies-to-list');
    // dummy <a> wrapper was clicked
    if (arguments[0] instanceof Event) arguments[0].preventDefault();
  }
  const showingEverything = $('.applies-to-everything', list);
  // blow away 'Everything' if it's there
  if (showingEverything) {
    list.removeChild(list.firstChild);
  }
  let item, toFocus;

  // a section is added with known applies-to
  if (type) {
    item = template.appliesTo.cloneNode(true);
    $('[name=applies-type]', item).value = type;
    $('[name=applies-value]', item).value = value;
    $('.remove-applies-to', item).addEventListener('click', removeAppliesTo);

  // a "+" button was clicked
  } else if (showingEverything || clickedItem) {
    item = template.appliesTo.cloneNode(true);
    toFocus = $('[name=applies-type]', item);
    if (clickedItem) {
      $('[name=applies-type]', item).value = $('[name="applies-type"]', clickedItem).value;
    }
    $('.remove-applies-to', item).addEventListener('click', removeAppliesTo);

  // a global section is added
  } else {
    item = template.appliesToEverything.cloneNode(true);
  }

  $('.add-applies-to', item).addEventListener('click', addAppliesTo);
  list.insertBefore(item, clickedItem && clickedItem.nextElementSibling);
  if (toFocus) toFocus.focus();
}

function cloneSection(event) {
  const section = getSectionForChild(event.target);
  addSection(event, getSectionsHashes([section]).pop());
  setCleanItem($('#sections'), false);
  updateTitle();
}

function moveSection(event) {
  const section = getSectionForChild(event.target);
  const dir = event.target.closest('.move-section-up') ? -1 : 1;
  const cm = section.CodeMirror;
  const index = editors.indexOf(cm);
  const newIndex = (index + dir + editors.length) % editors.length;
  const currentNextEl = section.nextElementSibling;
  const newSection = editors[newIndex].getSection();
  newSection.insertAdjacentElement('afterend', section);
  section.parentNode.insertBefore(newSection, currentNextEl || null);
  cm.focus();
  editors[index] = editors[newIndex];
  editors[newIndex] = cm;
  setCleanItem($('#sections'), false);
  updateTitle();
}

function setupCodeMirror(sectionDiv, code, index = editors.length) {
  const cm = CodeMirror(wrapper => {
    $('.code-label', sectionDiv).insertAdjacentElement('afterend', wrapper);
  }, {
    value: code,
  });
  const wrapper = cm.display.wrapper;

  let onChangeTimer;
  cm.on('changes', (cm, changes) => {
    clearTimeout(onChangeTimer);
    onChangeTimer = setTimeout(indicateCodeChange, 200, cm, changes);
  });
  wrapper.addEventListener('keydown', event => nextPrevEditorOnKeydown(cm, event), true);
  cm.on('paste', (cm, event) => {
    const text = event.clipboardData.getData('text') || '';
    if (
      text.includes('@-moz-document') &&
      text.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')
        .match(/@-moz-document[\s\r\n]+(url|url-prefix|domain|regexp)\(/)
    ) {
      event.preventDefault();
      fromMozillaFormat();
      $('#help-popup').codebox.setValue(text);
      $('#help-popup').codebox.clearHistory();
      $('#help-popup').codebox.markClean();
    }
    if (editors.length === 1) {
      setTimeout(() => {
        if (cm.display.sizer.clientHeight > cm.display.wrapper.clientHeight) {
          maximizeCodeHeight.stats = null;
          maximizeCodeHeight(cm.getSection(), true);
        }
      });
    }
  });
  if (!FIREFOX) {
    cm.on('mousedown', (cm, event) => toggleContextMenuDelete.call(cm, event));
  }

  wrapper.classList.add('resize-grip-enabled');
  let lastClickTime = 0;
  const resizeGrip = wrapper.appendChild(template.resizeGrip.cloneNode(true));
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
    function resize(e) {
      const cmPageY = wrapper.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(minHeight, e.pageY - cmPageY);
      if (height !== wrapper.clientHeight) {
        cm.setSize(null, height);
      }
    }
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', function resizeStop() {
      document.removeEventListener('mouseup', resizeStop);
      document.removeEventListener('mousemove', resize);
      wrapper.style.pointerEvents = '';
      document.body.style.cursor = '';
    });
  };

  editors.splice(index, 0, cm);
  return cm;
}

function indicateCodeChange(cm) {
  const section = cm.getSection();
  setCleanItem(section, cm.isClean(section.savedValue));
  updateTitle();
  updateLintReportIfEnabled(cm);
}

function setupAutocomplete(cm, enable = true) {
  const onOff = enable ? 'on' : 'off';
  cm[onOff]('changes', autocompleteOnTyping);
  cm[onOff]('pick', autocompletePicked);
}

function autocompleteOnTyping(cm, [info], debounced) {
  if (
    cm.state.completionActive ||
    info.origin && !info.origin.includes('input') ||
    !info.text.last
  ) {
    return;
  }
  if (cm.state.autocompletePicked) {
    cm.state.autocompletePicked = false;
    return;
  }
  if (!debounced) {
    debounce(autocompleteOnTyping, 100, cm, [info], true);
    return;
  }
  if (info.text.last.match(/[-a-z!]+$/i)) {
    cm.state.autocompletePicked = false;
    cm.options.hintOptions.completeSingle = false;
    cm.execCommand('autocomplete');
    setTimeout(() => {
      cm.options.hintOptions.completeSingle = true;
    });
  }
}

function autocompletePicked(cm) {
  cm.state.autocompletePicked = true;
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
      if (line > 0 || cm === editors[0]) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cm = CodeMirror.commands.prevEditor(cm);
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
      if (line < cm.doc.size - 1 || cm === editors.last) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cm = CodeMirror.commands.nextEditor(cm);
      cm.setCursor(0, 0);
      break;
  }
  const animation = (cm.getSection().firstElementChild.getAnimations() || [])[0];
  if (animation) {
    animation.playbackRate = -1;
    animation.currentTime = 2000;
    animation.play();
  }
}

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
    const sectionExtrasHeight = cm.getSection().clientHeight - wrapper.offsetHeight;
    cm.state.toggleHeightSaved = wrapper.clientHeight;
    cm.setSize(null, window.innerHeight - sectionExtrasHeight - pageExtrasHeight);
    const bounds = cm.getSection().getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      window.scrollBy(0, bounds.top);
    }
  }
}

function getSectionForChild(el, {includeDeleted} = {}) {
  return el.closest(`#sections > ${includeDeleted ? '*' : '.section'}`);
}

function getSections() {
  return $$('#sections > .section');
}

function getSectionsHashes(elements = getSections()) {
  const sections = [];
  for (const div of elements) {
    const meta = {urls: [], urlPrefixes: [], domains: [], regexps: []};
    for (const li of $('.applies-to-list', div).childNodes) {
      if (li.className === template.appliesToEverything.className) {
        break;
      }
      const type = $('[name=applies-type]', li).value;
      const value = $('[name=applies-value]', li).value;
      if (type && value) {
        meta[CssToProperty[type]].push(value);
      }
    }
    const code = div.CodeMirror.getValue();
    if (/^\s*$/.test(code) && Object.keys(meta).length === 0) {
      continue;
    }
    meta.code = code;
    sections.push(meta);
  }
  return sections;
}

function removeAppliesTo(event) {
  event.preventDefault();
  const appliesTo = event.target.closest('.applies-to-item');
  const appliesToList = appliesTo.closest('.applies-to-list');
  removeAreaAndSetDirty(appliesTo);
  if (!appliesToList.hasChildNodes()) {
    addAppliesTo(appliesToList);
  }
}

function removeSection(event) {
  const section = getSectionForChild(event.target);
  const cm = section.CodeMirror;
  if (event instanceof Event && (!cm.isClean() || !cm.isBlank())) {
    const stub = template.deletedSection.cloneNode(true);
    const MAX_LINES = 10;
    const lines = [];
    cm.doc.iter(0, MAX_LINES + 1, ({text}) => lines.push(text) && false);
    stub.title = t('sectionCode') + '\n' +
                 '-'.repeat(20) + '\n' +
                 lines.slice(0, MAX_LINES).map(s => clipString(s, 100)).join('\n') +
                 (lines.length > MAX_LINES ? '\n...' : '');
    $('.restore-section', stub).onclick = () => {
      let el = stub;
      while (el && !el.matches('.section')) {
        el = el.previousElementSibling;
      }
      const index = el ? editors.indexOf(el) + 1 : 0;
      editors.splice(index, 0, cm);
      stub.parentNode.replaceChild(section, stub);
      setCleanItem(section, false);
      updateTitle();
      cm.focus();
    };
    section.insertAdjacentElement('afterend', stub);
  }
  setCleanItem($('#sections'), false);
  removeAreaAndSetDirty(section);
  editors.splice(editors.indexOf(cm), 1);
  renderLintReport();
}

function removeAreaAndSetDirty(area) {
  const contributors = $$('.style-contributor', area);
  if (!contributors.length) {
    setCleanItem(area, false);
  }
  contributors.some(node => {
    if (node.savedValue) {
      // it's a saved section, so make it dirty and stop the enumeration
      setCleanItem(area, false);
      return true;
    } else {
      // it's an empty section, so undirty the applies-to items,
      // otherwise orphaned ids would keep the style dirty
      setCleanItem(node, true);
    }
  });
  updateTitle();
  area.remove();
}

function makeSectionVisible(cm) {
  if (editors.length === 1) {
    return;
  }
  const section = cm.getSection();
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

function maximizeCodeHeight(sectionDiv, isLast) {
  const cm = sectionDiv.CodeMirror;
  const stats = maximizeCodeHeight.stats = maximizeCodeHeight.stats || {totalHeight: 0, deltas: []};
  if (!stats.cmActualHeight) {
    stats.cmActualHeight = getComputedHeight(cm.display.wrapper);
  }
  if (!stats.sectionMarginTop) {
    stats.sectionMarginTop = parseFloat(getComputedStyle(sectionDiv).marginTop);
  }
  const sectionTop = sectionDiv.getBoundingClientRect().top - stats.sectionMarginTop;
  if (!stats.firstSectionTop) {
    stats.firstSectionTop = sectionTop;
  }
  const extrasHeight = getComputedHeight(sectionDiv) - stats.cmActualHeight;
  const cmMaxHeight = window.innerHeight - extrasHeight - sectionTop - stats.sectionMarginTop;
  const cmDesiredHeight = cm.display.sizer.clientHeight + 2 * cm.defaultTextHeight();
  const cmGrantableHeight = Math.max(stats.cmActualHeight, Math.min(cmMaxHeight, cmDesiredHeight));
  stats.deltas.push(cmGrantableHeight - stats.cmActualHeight);
  stats.totalHeight += cmGrantableHeight + extrasHeight;
  if (!isLast) {
    return;
  }
  stats.totalHeight += stats.firstSectionTop;
  if (stats.totalHeight <= window.innerHeight) {
    editors.forEach((cm, index) => {
      cm.setSize(null, stats.deltas[index] + stats.cmActualHeight);
    });
    return;
  }
  // scale heights to fill the gap between last section and bottom edge of the window
  const sections = $('#sections');
  const available = window.innerHeight - sections.getBoundingClientRect().bottom -
    parseFloat(getComputedStyle(sections).marginBottom);
  if (available <= 0) {
    return;
  }
  const totalDelta = stats.deltas.reduce((sum, d) => sum + d, 0);
  const q = available / totalDelta;
  const baseHeight = stats.cmActualHeight - stats.sectionMarginTop;
  stats.deltas.forEach((delta, index) => {
    editors[index].setSize(null, baseHeight + Math.floor(q * delta));
  });

  function getComputedHeight(el) {
    const compStyle = getComputedStyle(el);
    return el.getBoundingClientRect().height +
      parseFloat(compStyle.marginTop) + parseFloat(compStyle.marginBottom);
  }
}
