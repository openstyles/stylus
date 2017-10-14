/* global CodeMirror dirtyReporter initLint beautify showKeyMapHelp */
/* global showToggleStyleHelp goBackToManage updateLintReportIfEnabled */
/* global hotkeyRerouter setupAutocomplete setupOptionsExpand */
/* global editors linterConfig updateLinter regExpTester mozParser */
/* global makeLink */

'use strict';

function createSourceEditor(style) {
  // draw HTML
  $('#sections').innerHTML = '';
  $('#name').disabled = true;
  $('#mozilla-format-heading').parentNode.remove();

  $('#sections').appendChild(
    $element({className: 'single-editor', appendChild: [
      $element({tag: 'textarea'})
    ]})
  );

  $('#header').appendChild($element({
    id: 'footer',
    appendChild: makeLink('https://github.com/openstyles/stylus/wiki/Usercss', t('externalUsercssDocument'))
  }));

  setupOptionsExpand();

  // dirty reporter
  const dirty = dirtyReporter();
  dirty.onChange(() => {
    const DIRTY = dirty.isDirty();
    document.body.classList.toggle('dirty', DIRTY);
    $('#save-button').disabled = !DIRTY;
    updateTitle();
  });

  // normalize style
  if (!style.id) {
    setupNewStyle(style);
  } else {
    // style might be an object reference to background page
    style = deepCopy(style);
  }

  // draw CodeMirror
  $('#sections textarea').value = style.sourceCode;
  const cm = CodeMirror.fromTextArea($('#sections textarea'));
  // too many functions depend on this global
  editors.push(cm);

  // draw metas info
  updateMetas();
  initHooks();
  initAppliesToReport(cm);

  // setup linter
  initLint();
  const linterEl = $('#editor.linter');
  cm.on('optionChange', (cm, option) => {
    if (option === 'mode' || option === 'lint') {
      const lint = cm.getOption('lint');
      const mode = cm.getOption('mode');

      if (mode !== 'css' && linterConfig.getName(lint) === 'csslint') {
        updateLinter({linter: 'stylelint'});
        linterEl.value = 'stylelint';
      }
    }
  });
  linterEl.addEventListener('change', () => {
    if (cm.getOption('mode') !== 'css' && linterEl.value === 'csslint') {
      setTimeout(() => {
        linterEl.value = 'stylelint';
      });
    }
  });

  function setupNewStyle(style) {
    style.sections[0].code = ' '.repeat(prefs.get('editor.tabSize')) + '/* Insert code here... */';
    let section = mozParser.format(style);
    if (!section.includes('@-moz-document')) {
      style.sections[0].domains = ['example.com'];
      section = mozParser.format(style);
    }

    const sourceCode = `/* ==UserStyle==
@name New Style - ${Date.now()}
@namespace github.com/openstyles/stylus
@version 0.1.0
@description A new userstyle
@author Me
==/UserStyle== */

${section}
`;
    dirty.modify('source', '', sourceCode);
    style.sourceCode = sourceCode;
  }

  function initAppliesToReport(cm) {
    const APPLIES_TYPE = [
      [t('appliesUrlOption'), 'url'],
      [t('appliesUrlPrefixOption'), 'url-prefix'],
      [t('appliesDomainOption'), 'domain'],
      [t('appliesRegexpOption'), 'regexp']
    ];
    const THROTTLE_DELAY = 400;
    let widgets = [];
    let timer;
    let fromLine;
    let toLine;
    let style;
    let isInit;
    const optionEl = buildOption();

    $('#options').insertBefore(optionEl, $('#options > .option.aligned'));

    if (prefs.get('editor.appliesToLineWidget')) {
      init();
    }

    prefs.subscribe(['editor.appliesToLineWidget'], (key, value) => {
      if (!isInit && value) {
        init();
      } else if (isInit && !value) {
        uninit();
      }
      optionEl.checked = value;
    });

    optionEl.addEventListener('change', e => {
      prefs.set('editor.appliesToLineWidget', e.target.checked);
    });

    function buildOption() {
      return $element({className: 'option', appendChild: [
        $element({
          tag: 'input',
          type: 'checkbox',
          id: 'editor.appliesToLineWidget',
          checked: prefs.get('editor.appliesToLineWidget')
        }),
        $element({
          tag: 'label',
          htmlFor: 'editor.appliesToLineWidget',
          textContent: ' ' + t('appliesLineWidgetLabel'),
          title: t('appliesLineWidgetWarning')
        })
      ]});
    }

    function init() {
      isInit = true;

      style = getComputedStyle(cm.getGutterElement());
      fromLine = null;
      toLine = null;

      cm.on('change', onChange);
      cm.on('optionChange', onOptionChange);

      // is it possible to avoid flickering?
      window.addEventListener('load', updateStyle);

      update();
    }

    function uninit() {
      isInit = false;

      widgets.forEach(clearWidget);
      widgets.length = 0;
      cm.off('change', onChange);
      cm.off('optionChange', onOptionChange);
      window.removeEventListener('load', updateStyle);
    }

    function onChange(cm, {from, to, origin}) {
      if (origin === 'appliesTo') {
        return;
      }
      if (fromLine === null || toLine === null) {
        fromLine = from.line;
        toLine = to.line;
      } else {
        fromLine = Math.min(fromLine, from.line);
        toLine = Math.max(toLine, to.line);
      }
      clearTimeout(timer);
      timer = setTimeout(update, THROTTLE_DELAY);
    }

    function onOptionChange(cm, option) {
      if (option === 'theme') {
        updateStyle();
      }
    }

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
          clearWidget(removed[i++]);
        }
        setupMarkers(section);
        if (removed[i] && removed[i].line.lineNo() === section.pos.line) {
          // reuse old widget
          removed[i].section.applies.forEach(apply => {
            apply.type.mark.clear();
            apply.value.mark.clear();
          });
          removed[i].section = section;
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
        widget.section = section;
        setWidgetStyle(widget);
        yield widget;
      }
      removed.slice(i).forEach(clearWidget);
    }

    function clearWidget(widget) {
      widget.clear();
      widget.section.applies.forEach(clearApply);
    }

    function clearApply(apply) {
      apply.type.mark.clear();
      apply.value.mark.clear();
      apply.mark.clear();
    }

    function setupMarkers({applies}) {
      applies.forEach(setupApplyMarkers);
    }

    function setupApplyMarkers(apply) {
      apply.type.mark = cm.markText(
        cm.posFromIndex(apply.type.start),
        cm.posFromIndex(apply.type.end),
        {clearWhenEmpty: false}
      );
      apply.value.mark = cm.markText(
        cm.posFromIndex(apply.value.start),
        cm.posFromIndex(apply.value.end),
        {clearWhenEmpty: false}
      );
      apply.mark = cm.markText(
        cm.posFromIndex(apply.start),
        cm.posFromIndex(apply.end),
        {clearWhenEmpty: false}
      );
    }

    function buildElement({applies}) {
      const el = $element({className: 'applies-to', appendChild: [
        $element({tag: 'label', appendChild: [
          t('appliesLabel'),
          // $element({tag: 'svg'})
        ]}),
        $element({
          tag: 'ul',
          className: 'applies-to-list',
          appendChild: applies.map(makeInputEl)
        })
      ]});
      if (!$('li', el)) {
        $('ul', el).appendChild($element({
          tag: 'li',
          className: 'applies-to-everything',
          textContent: t('appliesToEverything')
        }));
      }
      return el;

      function makeInputEl(apply) {
        const el = $element({tag: 'li', appendChild: makeInput(apply)});
        el.dataset.type = apply.type.text;
        el.addEventListener('change', e => {
          if (e.target.classList.contains('applies-type')) {
            el.dataset.type = apply.type.text;
          }
        });
        return el;
      }

      function makeInput(apply) {
        const typeInput = $element({
          tag: 'select',
          className: 'applies-type',
          appendChild: APPLIES_TYPE.map(([label, value]) => $element({
            tag: 'option',
            value: value,
            textContent: label
          })),
          onchange(e) {
            applyChange(apply.type, e.target.value);
          }
        });
        typeInput.value = apply.type.text;
        let timer;
        const valueInput = $element({
          tag: 'input',
          className: 'applies-value',
          value: apply.value.text,
          oninput(e) {
            clearTimeout(timer);
            timer = setTimeout(applyChange, THROTTLE_DELAY, apply.value, e.target.value);
          },
          onfocus: updateRegexpTest
        });
        const regexpTestButton = $element({
          tag: 'button',
          type: 'button',
          className: 'applies-to-regexp-test',
          textContent: t('styleRegexpTestButton'),
          onclick() {
            regExpTester.toggle();
            regExpTester.update([apply.value.text]);
          }
        });
        const removeButton = $element({
          tag: 'button',
          type: 'button',
          className: 'applies-to-remove',
          textContent: t('appliesRemove'),
          onclick(e) {
            const i = applies.indexOf(apply);
            let repl;
            let from;
            let to;
            if (applies.length < 2) {
              alert('Can\'t remove last applies-to');
              return;
            }
            if (i === 0) {
              from = apply.mark.find().from;
              to = applies[i + 1].mark.find().from;
              repl = '';
            } else if (i === applies.length - 1) {
              from = applies[i - 1].mark.find().to;
              to = apply.mark.find().to;
              repl = '';
            } else {
              from = applies[i - 1].mark.find().to;
              to = applies[i + 1].mark.find().from;
              repl = ', ';
            }
            cm.replaceRange(repl, from, to, 'appliesTo');
            clearApply(apply);
            e.target.closest('li').remove();
            applies.splice(i, 1);
          }
        });
        const addButton = $element({
          tag: 'button',
          type: 'button',
          className: 'applies-to-add',
          textContent: t('appliesAdd'),
          onclick(e) {
            const i = applies.indexOf(apply);
            const pos = apply.mark.find().to;
            const text = `, ${apply.type.text}("")`;
            cm.replaceRange(text, pos, pos, 'appliesTo');
            const index = cm.indexFromPos(pos);
            const newApply = {
              type: {
                text: apply.type.text
              },
              value: {
                text: ''
              }
            };
            newApply.start = index + 2;
            newApply.type.start = newApply.start;
            newApply.type.end = newApply.type.start + newApply.type.text.length;
            newApply.value.start = newApply.type.end + 2;
            newApply.value.end = newApply.value.start + newApply.value.text.length;
            newApply.end = newApply.value.end + 2;
            setupApplyMarkers(newApply);
            applies.splice(i + 1, 0, newApply);
            const li = e.target.closest('li');
            li.parentNode.insertBefore(makeInputEl(newApply), li.nextSibling);
          }
        });
        return [typeInput, valueInput, regexpTestButton, removeButton, addButton];

        function updateRegexpTest() {
          if (apply.type.text === 'regexp') {
            const re = apply.value.text.trim();
            if (re) {
              regExpTester.update([re]);
            } else {
              regExpTester.update([]);
            }
          }
        }

        function applyChange(input, newText) {
          const range = input.mark.find();
          input.mark.clear();
          cm.replaceRange(newText, range.from, range.to, 'appliesTo');
          input.mark = cm.markText(
            range.from,
            cm.findPosH(
              range.from,
              newText.length,
              'char'
            ),
            {clearWhenEmpty: false}
          );
          input.text = newText;

          if (input === apply.type) {
            const range = apply.mark.find();
            apply.mark.clear();
            apply.mark = cm.markText(
              input.mark.find().from,
              range.to,
              {clearWhenEmpty: false}
            );
          }

          updateRegexpTest();
        }
      }
    }

    function *findAppliesTo(posStart, posEnd) {
      const text = cm.getValue();
      const re = /^[\t ]*@-moz-document\s+/mg;
      const applyRe = /^(url|url-prefix|domain|regexp)\(((['"])(?:\\\\|\\\n|\\\3|[^\n])*?\3|[^)\n]*)\)[\s,]*/i;
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
        let offset = 0;
        while ((m = t.match(applyRe))) {
          const apply = {
            type: {
              text: m[1]
            },
            value: {
              text: normalizeString(m[2])
            }
          };
          apply.type.start = re.lastIndex + offset;
          apply.type.end = apply.type.start + apply.type.text.length;
          apply.value.start = apply.type.end + (apply.value.text === m[2] ? 1 : 2);
          apply.value.end = apply.value.start + apply.value.text.length;
          apply.start = apply.type.start;
          apply.end = apply.value.end + (apply.value.text === m[2] ? 1 : 2);
          applies.push(apply);
          t = t.slice(m[0].length);
          offset += m[0].length;
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
      dirty.modify('source', style.sourceCode, value);
      style.sourceCode = value;

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
    const {usercssData: {preprocessor} = {}} = style;
    cm.setPreprocessor(preprocessor);
    // beautify only works with regular CSS
    $('#beautify').disabled = cm.getOption('mode') !== 'css';
    updateTitle();
  }

  function updateTitle() {
    // title depends on dirty and style meta
    if (!style.id) {
      document.title = t('addStyleTitle');
    } else {
      document.title = (dirty.isDirty() ? '* ' : '') + t('editStyleTitle', [style.name]);
    }
  }

  function replaceStyle(newStyle) {
    if (!style.id && newStyle.id) {
      history.replaceState({}, '', `?id=${newStyle.id}`);
    }
    style = deepCopy(newStyle);
    updateMetas();
    if (style.sourceCode !== cm.getValue()) {
      const cursor = cm.getCursor();
      cm.setValue(style.sourceCode);
      cm.setCursor(cursor);
    }
    dirty.clear();
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
    return onBackgroundReady()
      .then(() => BG.usercssHelper.save({
        reason: 'editSave',
        id: style.id,
        enabled: style.enabled,
        sourceCode: style.sourceCode
      }))
      .then(replaceStyle)
      .catch(err => {
        console.error(err);
        alert(err);
      });
  }

  return {
    replaceStyle,
    save,
    toggleStyle,
    isDirty: dirty.isDirty,
    getStyle: () => style
  };
}
