/* global regExpTester debounce messageBox */
'use strict';

function createAppliesToLineWidget(cm) {
  const APPLIES_TYPE = [
    [t('appliesUrlOption'), 'url'],
    [t('appliesUrlPrefixOption'), 'url-prefix'],
    [t('appliesDomainOption'), 'domain'],
    [t('appliesRegexpOption'), 'regexp']
  ];
  const THROTTLE_DELAY = 400;
  let widgets = [];
  let fromLine, toLine, gutterStyle, isInit;

  return {toggle};

  function toggle(state = !isInit) {
    if (!isInit && state) {
      init();
    } else if (isInit && !state) {
      uninit();
    }
  }

  function init() {
    isInit = true;

    gutterStyle = getComputedStyle(cm.getGutterElement());
    fromLine = null;
    toLine = null;

    cm.on('change', onChange);
    cm.on('optionChange', onOptionChange);

    // is it possible to avoid flickering?
    window.addEventListener('load', updateWidgetStyle);

    update();
  }

  function uninit() {
    isInit = false;

    widgets.forEach(clearWidget);
    widgets.length = 0;
    cm.off('change', onChange);
    cm.off('optionChange', onOptionChange);
    window.removeEventListener('load', updateWidgetStyle);
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
    debounce(update, THROTTLE_DELAY);
  }

  function onOptionChange(cm, option) {
    if (option === 'theme') {
      updateWidgetStyle();
    }
  }

  function update() {
    cm.operation(doUpdate);
  }

  function updateWidgetStyle() {
    gutterStyle = getComputedStyle(cm.getGutterElement());
    widgets.forEach(setWidgetStyle);
  }

  function setWidgetStyle(widget) {
    let borderStyle = '';
    if (gutterStyle.borderRightWidth !== '0px') {
      borderStyle = `${gutterStyle.borderRightWidth} ${gutterStyle.borderRightStyle} ${gutterStyle.borderRightColor}`;
    } else {
      borderStyle = `1px solid ${gutterStyle.color}`;
    }
    widget.node.style.backgroundColor = gutterStyle.backgroundColor;
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
    i = Math.max(0, i);
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
        appendChild: applies.map(makeLi)
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

    function makeLi(apply) {
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
        onchange() {
          applyChange(apply.type, this.value);
        }
      });
      typeInput.value = apply.type.text;
      const valueInput = $element({
        tag: 'input',
        className: 'applies-value',
        value: apply.value.text,
        oninput() {
          debounce(applyChange, THROTTLE_DELAY, apply.value, this.value);
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
        onclick() {
          const i = applies.indexOf(apply);
          let repl;
          let from;
          let to;
          if (applies.length < 2) {
            messageBox({
              title: 'Error',
              contents: 'Can\'t remove last applies-to',
              buttons: [t('confirmClose')]
            });
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
          this.closest('li').remove();
          applies.splice(i, 1);
        }
      });
      const addButton = $element({
        tag: 'button',
        type: 'button',
        className: 'applies-to-add',
        textContent: t('appliesAdd'),
        onclick() {
          const i = applies.indexOf(apply);
          const pos = apply.mark.find().to;
          const text = `, ${apply.type.text}("")`;
          cm.replaceRange(text, pos, pos, 'appliesTo');
          const newApply = createApply(
            cm.indexFromPos(pos) + 2,
            apply.type.text,
            '',
            true
          );
          setupApplyMarkers(newApply);
          applies.splice(i + 1, 0, newApply);
          this.closest('li').insertAdjacentElement('afterend', makeLi(newApply));
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
          cm.findPosH(range.from, newText.length, 'char'),
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

  function createApply(pos, typeText, valueText, isQuoted = false) {
    const start = pos;
    const typeStart = start;
    const typeEnd = typeStart + typeText.length;
    const valueStart = typeEnd + 1 + Number(isQuoted);
    const valueEnd = valueStart + valueText.length;
    const end = valueEnd + Number(isQuoted) + 1;
    return {
      start,
      type: {
        text: typeText,
        start: typeStart,
        end: typeEnd,
      },
      value: {
        text: valueText,
        start: valueStart,
        end: valueEnd,
      },
      end
    };
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
        const apply = createApply(
          re.lastIndex + offset,
          m[1],
          normalizeString(m[2]),
          normalizeString(m[2]) !== m[2]
        );
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
