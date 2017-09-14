/* global CodeMirror dirtyReporter initLint beautify showKeyMapHelp */
/* global showToggleStyleHelp goBackToManage updateLintReportIfEnabled */
/* global hotkeyRerouter setupAutocomplete */
/* global editors */

'use strict';

function createSourceEditor(style) {
  // style might be an object reference to background page
  style = deepCopy(style);

  // draw HTML
  $('#sections').innerHTML = '';
  $('#name').disabled = true;
  $('#mozilla-format-heading').parentNode.remove();

  $('#sections').appendChild(
    $element({className: 'single-editor', appendChild: [
      $element({tag: 'textarea'})
    ]})
  );

  // draw CodeMirror
  $('#sections textarea').value = style.source;
  const cm = CodeMirror.fromTextArea($('#sections textarea'));
  // too many functions depend on this global
  editors.push(cm);

  // dirty reporter
  const dirty = dirtyReporter();
  dirty.onChange(() => {
    const DIRTY = dirty.isDirty();
    document.body.classList.toggle('dirty', DIRTY);
    $('#save-button').disabled = !DIRTY;
    updateTitle();
  });

  // draw metas info
  updateMetas();
  initHooks();
  initLint();
  initAppliesToReport(cm);

  function initAppliesToReport(cm) {
    const DELAY = 500;
    let widgets = [];
    let timer;
    let fromLine = null;
    let toLine = null;
    let style = getComputedStyle(cm.getGutterElement());

    update();

    cm.on('change', (cm, {from, to}) => {
      if (fromLine === null || toLine === null) {
        fromLine = from.line;
        toLine = to.line;
      } else {
        fromLine = Math.min(fromLine, from.line);
        toLine = Math.max(toLine, to.line);
      }
      clearTimeout(timer);
      timer = setTimeout(update, DELAY);
    });

    cm.on('optionChange', (cm, option) => {
      if (option === 'theme') {
        updateStyle();
      }
    });

    // is it possible to avoid flickering?
    window.addEventListener('load', updateStyle);

    function update() {
      cm.operation(doUpdate);
    }

    function updateStyle() {
      style = getComputedStyle(cm.getGutterElement());
      widgets.forEach(setWidgetStyle);
    }

    function setWidgetStyle(widget) {
      let borderStyle = '';
      if (style.borderRightWidth !== '0px') {
        borderStyle = `${style.borderRightWidth} ${style.borderRightStyle} ${style.borderRightColor}`;
      } else {
        borderStyle = `1px solid ${style.color}`;
      }
      widget.node.style.backgroundColor = style.backgroundColor;
      widget.node.style.borderTop = borderStyle;
      widget.node.style.borderBottom = borderStyle;
    }

    function doUpdate() {
      // find which widgets needs to be update
      // some widgets (lines) might be deleted
      widgets = widgets.filter(w => w.line.lineNo() !== null);
      let i = fromLine === null ? 0 : widgets.findIndex(w => w.line.lineNo() > fromLine) - 1;
      let j = toLine === null ? 0 : widgets.findIndex(w => w.line.lineNo() > toLine);
      if (i === -2) {
        i = widgets.length - 1;
      }
      if (j < 0) {
        j = widgets.length;
      }

      // decide search range
      const fromIndex = widgets[i] ? cm.indexFromPos({line: widgets[i].line.lineNo(), ch: 0}) : 0;
      const toIndex = widgets[j] ? cm.indexFromPos({line: widgets[j].line.lineNo(), ch: 0}) : cm.getValue().length;

      // splice
      if (i < 0) {
        i = 0;
      }

      widgets.splice(i, 0, ...createWidgets(fromIndex, toIndex, widgets.splice(i, j - i)));

      fromLine = null;
      toLine = null;
    }

    function *createWidgets(start, end, removed) {
      let i = 0;
      for (const section of findAppliesTo(start, end)) {
        while (removed[i] && removed[i].line.lineNo() < section.pos.line) {
          removed[i++].clear();
        }
        if (removed[i] && removed[i].line.lineNo() === section.pos.line) {
          // reuse old widget
          const newNode = buildElement(section);
          removed[i].node.parentNode.replaceChild(newNode, removed[i].node);
          removed[i].node = newNode;
          setWidgetStyle(removed[i]);
          removed[i].changed();
          yield removed[i];
          i++;
          continue;
        }
        // new widget
        const widget = cm.addLineWidget(section.pos.line, buildElement(section), {
          coverGutter: true,
          noHScroll: true,
          above: true
        });
        setWidgetStyle(widget);
        yield widget;
      }
      removed.slice(i).forEach(w => w.clear());
    }

    function buildElement({applies}) {
      const el = $element({className: 'applies-to', appendChild: [
        $element({tag: 'label', appendChild: [
          t('appliesLabel'),
          // $element({tag: 'svg'})
        ]}),
        $element({tag: 'ul', className: 'applies-to-list', appendChild: applies.map(apply =>
          $element({tag: 'li', appendChild: [
            $element({tag: 'input', className: 'applies-type', value: typeLabel(apply.type), readOnly: true}),
            $element({tag: 'input', className: 'applies-value', value: apply.value, readOnly: true})
          ]})
        )})
      ]});
      if (!$('li', el)) {
        $('ul', el).appendChild($element({
          tag: 'li',
          className: 'applies-to-everything',
          textContent: t('appliesToEverything')
        }));
      }
      return el;
    }

    function typeLabel(type) {
      switch (type.toLowerCase()) {
        case 'url':
          return t('appliesUrlOption');
        case 'url-prefix':
          return t('appliesUrlPrefixOption');
        case 'domain':
          return t('appliesDomainOption');
        case 'regexp':
          return t('appliesRegexpOption');
      }
    }

    function *findAppliesTo(posStart, posEnd) {
      const text = cm.getValue();
      const re = /^[\t ]*@-moz-document\s+/mg;
      const applyRe = /^(url|url-prefix|domain|regexp)\(((['"])(?:\\\3|[\s\S])*?\3|[^)]*)\)[\s,]*/i;
      let preIndex = re.lastIndex = posStart;
      let match;
      let pos = cm.posFromIndex(preIndex);
      while ((match = re.exec(text))) {
        if (match.index >= posEnd) {
          return;
        }
        pos = cm.findPosH(pos, match.index - preIndex, 'char');
        const applies = [];
        let t = text.slice(re.lastIndex);
        let m;
        while ((m = t.match(applyRe))) {
          applies.push({type: m[1], value: normalizeString(m[2])});
          t = t.slice(m[0].length);
        }
        yield {pos, applies};
        preIndex = match.index;
        re.lastIndex = text.length - t.length;
      }
    }

    function normalizeString(s) {
      if (/^(['"])[\s\S]*\1$/.test(s)) {
        return s.slice(1, -1);
      }
      return s;
    }
  }

  function initHooks() {
    // sidebar commands
    $('#save-button').onclick = save;
    $('#beautify').onclick = beautify;
    $('#keyMap-help').onclick = showKeyMapHelp;
    $('#toggle-style-help').onclick = showToggleStyleHelp;
    $('#cancel-button').onclick = goBackToManage;

    // enable
    $('#enabled').onchange = e => {
      const value = e.target.checked;
      dirty.modify('enabled', style.enabled, value);
      style.enabled = value;
    };

    // source
    cm.on('change', () => {
      const value = cm.getValue();
      dirty.modify('source', style.source, value);
      style.source = value;

      updateLintReportIfEnabled(cm);
    });

    // hotkeyRerouter
    cm.on('focus', () => {
      hotkeyRerouter.setState(false);
    });
    cm.on('blur', () => {
      hotkeyRerouter.setState(true);
    });

    // autocomplete
    if (prefs.get('editor.autocompleteOnTyping')) {
      setupAutocomplete(cm);
    }
  }

  function updateMetas() {
    $('#name').value = style.name;
    $('#enabled').checked = style.enabled;
    $('#url').href = style.url;
    cm.setOption('mode', style.preprocessor || 'css');
    CodeMirror.autoLoadMode(cm, style.preprocessor || 'css');
    // beautify only works with regular CSS
    $('#beautify').disabled = Boolean(style.preprocessor);
    updateTitle();
  }

  function updateTitle() {
    // title depends on dirty and style meta
    document.title = (dirty.isDirty() ? '* ' : '') + t('editStyleTitle', [style.name]);
  }

  function replaceStyle(newStyle) {
    style = deepCopy(newStyle);
    updateMetas();
    if (style.source !== cm.getValue()) {
      const cursor = cm.getCursor();
      cm.setValue(style.source);
      cm.setCursor(cursor);
    }
    dirty.clear();
  }

  function updateStyleMeta(newStyle) {
    dirty.modify('enabled', style.enabled, newStyle.enabled);
    style.enabled = newStyle.enabled;
  }

  function toggleStyle() {
    const value = !style.enabled;
    dirty.modify('enabled', style.enabled, value);
    style.enabled = value;
    updateMetas();
    // save when toggle enable state?
    save();
  }

  function save() {
    if (!dirty.isDirty()) {
      return;
    }
    const req = {
      method: 'saveUsercss',
      reason: 'editSave',
      id: style.id,
      enabled: style.enabled,
      edited: dirty.has('source'),
      source: style.source
    };
    return onBackgroundReady().then(() => BG.saveUsercss(req))
      .then(result => {
        if (result.status === 'error') {
          throw new Error(result.error);
        }
        return result;
      })
      .then(({style}) => {
        replaceStyle(style);
      })
      .catch(err => {
        console.error(err);
        alert(err);
      });
  }

  return {replaceStyle, save, toggleStyle, updateStyleMeta, isDirty: dirty.isDirty};
}
