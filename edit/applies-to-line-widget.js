/* global regExpTester debounce messageBox CodeMirror template */
'use strict';

function createAppliesToLineWidget(cm) {
  const THROTTLE_DELAY = 400;
  let TPL, EVENTS, CLICK_ROUTE;
  let widgets = [];
  let fromLine, toLine, styleVariables;
  let initialized = false;
  return {toggle};

  function toggle(newState = !initialized) {
    newState = Boolean(newState);
    if (newState !== initialized) {
      if (newState) {
        init();
      } else {
        uninit();
      }
    }
  }

  function init() {
    initialized = true;

    TPL = {
      container:
        $element({className: 'applies-to', appendChild: [
          $element({tag: 'label', appendChild: t('appliesLabel')}),
          $element({tag: 'ul', className: 'applies-to-list'}),
        ]}),
      listItem: $element({
        tag: 'li',
        className: 'applies-to-item',
        appendChild: [
          $element({
            tag: 'select',
            className: 'applies-type',
            appendChild: [
              [t('appliesUrlOption'), 'url'],
              [t('appliesUrlPrefixOption'), 'url-prefix'],
              [t('appliesDomainOption'), 'domain'],
              [t('appliesRegexpOption'), 'regexp']
            ].map(([textContent, value]) => $element({
              tag: 'option',
              value,
              textContent,
            })),
          }),
          $element({
            tag: 'input',
            className: 'applies-value',
          }),
          $element({
            tag: 'button',
            className: 'test-regexp',
            textContent: t('styleRegexpTestButton'),
          }),
          $element({
            tag: 'button',
            className: 'remove-applies-to',
            textContent: t('appliesRemove'),
          }),
          $element({
            tag: 'button',
            className: 'add-applies-to',
            textContent: t('appliesAdd'),
          })
        ]}),
      appliesToEverything: $element({
        tag: 'li',
        className: 'applies-to-everything',
        textContent: t('appliesToEverything'),
      }),
    };

    CLICK_ROUTE = {
      '.test-regexp': (item, apply) => {
        regExpTester.toggle();
        regExpTester.update([apply.value.text]);
      },

      '.remove-applies-to': (item, apply) => {
        const applies = item.closest('.applies-to').__applies;
        const i = applies.indexOf(apply);
        let repl;
        let from;
        let to;
        if (applies.length < 2) {
          messageBox({
            contents: t('appliesRemoveError'),
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
        item.remove();
        applies.splice(i, 1);
      },

      '.add-applies-to': (item, apply) => {
        const applies = this.closest('.applies-to').__applies;
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
        item.insertAdjacentElement('afterend', buildChildren(applies, newApply));
      },
    };

    EVENTS = {
      onchange({target}) {
        const typeElement = target.closest('.applies-type');
        if (typeElement) {
          const item = target.closest('.applies-to-item');
          const apply = item.__apply;
          changeItem(apply, 'type', typeElement.value);
          item.dataset.type = apply.type.text;
        }
      },
      oninput({target}) {
        if (target.matches('.applies-value')) {
          const apply = target.closest('.applies-to-item').__apply;
          debounce(changeItem, THROTTLE_DELAY, apply, 'value', target.value);
        }
      },
      onfocus({target}) {
        if (target.matches('.test-regexp')) {
          const apply = target.closest('.applies-to-item').__apply;
          updateRegexpTest(apply);
        }
      },
      onclick({target}) {
        for (const selector in CLICK_ROUTE) {
          const routed = target.closest(selector);
          if (routed) {
            const item = routed.closest('.applies-to-item');
            CLICK_ROUTE[selector].call(routed, item, item.__apply);
            return;
          }
        }
      }
    };

    styleVariables = $element({tag: 'style'});
    fromLine = 0;
    toLine = cm.doc.size;

    cm.on('change', onChange);
    cm.on('optionChange', onOptionChange);

    // is it possible to avoid flickering?
    window.addEventListener('load', updateWidgetStyle);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    updateWidgetStyle();
    update();
  }

  function uninit() {
    initialized = false;

    widgets.forEach(clearWidget);
    widgets.length = 0;
    cm.off('change', onChange);
    cm.off('optionChange', onOptionChange);
    window.removeEventListener('load', updateWidgetStyle);
    chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    styleVariables.remove();
  }

  function onChange(cm, event) {
    const {from, to, origin} = event;
    if (origin === 'appliesTo') {
      return;
    }
    const lastChanged = CodeMirror.changeEnd(event).line;
    fromLine = Math.min(fromLine === null ? from.line : fromLine, from.line);
    toLine = Math.max(toLine === null ? lastChanged : toLine, to.line);
    if (origin === 'setValue') {
      update();
    } else {
      debounce(update, THROTTLE_DELAY);
    }
  }

  function onOptionChange(cm, option) {
    if (option === 'theme') {
      updateWidgetStyle();
    }
  }

  function onRuntimeMessage(msg) {
    if (msg.style || msg.styles ||
        msg.prefs && 'disableAll' in msg.prefs ||
        msg.method === 'styleDeleted') {
      requestAnimationFrame(updateWidgetStyle);
    }
  }

  function update() {
    const changed = {fromLine, toLine};
    fromLine = Math.max(fromLine || 0, cm.display.viewFrom);
    toLine = Math.min(toLine === null ? cm.doc.size : toLine, cm.display.viewTo || toLine);
    const visible = {fromLine, toLine};
    if (fromLine >= cm.display.viewFrom && toLine <= (cm.display.viewTo || toLine)) {
      cm.operation(doUpdate);
    }
    if (changed.fromLine !== visible.fromLine || changed.toLine !== visible.toLine) {
      setTimeout(updateInvisible, 0, changed, visible);
    }
  }

  function updateInvisible(changed, visible) {
    let inOp = false;
    if (changed.fromLine < visible.fromLine) {
      fromLine = Math.min(fromLine, changed.fromLine);
      toLine = Math.min(changed.toLine, visible.fromLine);
      inOp = true;
      cm.startOperation();
      doUpdate();
    }
    if (changed.toLine > visible.toLine) {
      fromLine = Math.max(fromLine, changed.toLine);
      toLine = Math.max(changed.toLine, visible.toLine);
      if (!inOp) {
        inOp = true;
        cm.startOperation();
      }
      doUpdate();
    }
    if (inOp) {
      cm.endOperation();
    }
  }

  function updateWidgetStyle() {
    const gutterStyle = getComputedStyle(cm.getGutterElement());
    const borderStyle = gutterStyle.borderRightWidth !== '0px' ?
      `${gutterStyle.borderRightWidth} ${gutterStyle.borderRightStyle} ${gutterStyle.borderRightColor}` :
      `1px solid ${gutterStyle.color}`;
    const id = Date.now();
    styleVariables.textContent = `
      .single-editor {
        --at-background-color-${id}: ${gutterStyle.backgroundColor};
        --at-border-top-${id}: ${borderStyle};
        --at-border-bottom-${id}: ${borderStyle};
      }
      .applies-to {
        background-color: var(--at-background-color-${id});
        border-top: var(--at-border-top-${id});
        border-bottom: var(--at-border-bottom-${id});
      }
    `;
    document.documentElement.appendChild(styleVariables);
  }

  function doUpdate() {
    // find which widgets needs to be update
    // some widgets (lines) might be deleted
    widgets = widgets.filter(w => w.line.lineNo() !== null);
    let i = widgets.findIndex(w => w.line.lineNo() > fromLine) - 1;
    let j = widgets.findIndex(w => w.line.lineNo() > toLine);
    if (i === -2) {
      i = widgets.length - 1;
    }
    if (j < 0) {
      j = widgets.length;
    }

    // decide search range
    const fromPos = {line: widgets[i] ? widgets[i].line.lineNo() : 0, ch: 0};
    const toPos = {line: widgets[j] ? widgets[j].line.lineNo() : toLine + 1, ch: 0};

    // calc index->pos lookup table
    let line = 0;
    let index = 0;
    let fromIndex, toIndex;
    const lineIndexes = [index];
    cm.doc.iter(({text}) => {
      fromIndex = line === fromPos.line ? index : fromIndex;
      lineIndexes.push((index += text.length + 1));
      line++;
      toIndex = line >= toPos.line ? index : toIndex;
      return toIndex;
    });

    // splice
    i = Math.max(0, i);
    widgets.splice(i, 0, ...createWidgets(fromIndex, toIndex, widgets.splice(i, j - i), lineIndexes));

    fromLine = null;
    toLine = null;
  }

  function *createWidgets(start, end, removed, lineIndexes) {
    let i = 0;
    let itemHeight;
    for (const section of findAppliesTo(start, end)) {
      let removedWidget = removed[i];
      while (removedWidget && removedWidget.line.lineNo() < section.pos.line) {
        clearWidget(removed[i]);
        removedWidget = removed[++i];
      }
      for (const a of section.applies) {
        setupApplyMarkers(a, lineIndexes);
      }
      if (removedWidget && removedWidget.line.lineNo() === section.pos.line) {
        // reuse old widget
        removedWidget.section.applies.forEach(apply => {
          apply.type.mark.clear();
          apply.value.mark.clear();
        });
        removedWidget.section = section;
        const newNode = buildElement(section);
        const removedNode = removedWidget.node;
        if (removedNode.parentNode) {
          removedNode.parentNode.replaceChild(newNode, removedNode);
        }
        removedWidget.node = newNode;
        removedWidget.changed();
        yield removedWidget;
        i++;
        continue;
      }
      // new widget
      const widget = cm.addLineWidget(section.pos.line, buildElement(section), {
        coverGutter: true,
        noHScroll: true,
        above: true,
        height: itemHeight ? section.applies.length * itemHeight : undefined,
      });
      widget.section = section;
      itemHeight = itemHeight || widget.node.offsetHeight / (section.applies.length || 1);
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

  function setupApplyMarkers(apply, lineIndexes) {
    apply.type.mark = cm.markText(
      posFromIndex(cm, apply.type.start, lineIndexes),
      posFromIndex(cm, apply.type.end, lineIndexes),
      {clearWhenEmpty: false}
    );
    apply.value.mark = cm.markText(
      posFromIndex(cm, apply.value.start, lineIndexes),
      posFromIndex(cm, apply.value.end, lineIndexes),
      {clearWhenEmpty: false}
    );
    apply.mark = cm.markText(
      posFromIndex(cm, apply.start, lineIndexes),
      posFromIndex(cm, apply.end, lineIndexes),
      {clearWhenEmpty: false}
    );
  }

  function posFromIndex(cm, index, lineIndexes) {
    if (!lineIndexes) {
      return cm.posFromIndex(index);
    }
    let line = lineIndexes.prev || 0;
    const prev = lineIndexes[line];
    const next = lineIndexes[line + 1];
    if (prev <= index && index < next) {
      return {line, ch: index - prev};
    }
    let a = index < prev ? 0 : line;
    let b = index < next ? line + 1 : lineIndexes.length - 1;
    while (a < b - 1) {
      const mid = (a + b) >> 1;
      if (lineIndexes[mid] < index) {
        a = mid;
      } else {
        b = mid;
      }
    }
    line = lineIndexes[b] > index ? a : b;
    Object.defineProperty(lineIndexes, 'prev', {value: line, configurable: true});
    return {line, ch: index - lineIndexes[line]};
  }

  function buildElement({applies}) {
    const container = TPL.container.cloneNode(true);
    const list = $('.applies-to-list', container);
    for (const apply of applies) {
      list.appendChild(buildChildren(applies, apply));
    }
    if (!list.children[0]) {
      list.appendChild(TPL.appliesToEverything.cloneNode(true));
    }
    return Object.assign(container, EVENTS, {__applies: applies});
  }

  function buildChildren(applies, apply) {
    const el = TPL.listItem.cloneNode(true);
    el.dataset.type = apply.type.text;
    el.__apply = apply;
    $('.applies-type', el).value = apply.type.text;
    $('.applies-value', el).value = apply.value.text;
    return el;
  }

  function changeItem(apply, part, newText) {
    part = apply[part];
    const range = part.mark.find();
    part.mark.clear();
    cm.replaceRange(newText, range.from, range.to, 'appliesTo');
    part.mark = cm.markText(
      range.from,
      cm.findPosH(range.from, newText.length, 'char'),
      {clearWhenEmpty: false}
    );
    part.text = newText;

    if (part === apply.type) {
      const range = apply.mark.find();
      apply.mark.clear();
      apply.mark = cm.markText(
        part.mark.find().from,
        range.to,
        {clearWhenEmpty: false}
      );
    }

    updateRegexpTest(apply);
  }

  function updateRegexpTest(apply) {
    if (apply.type.text === 'regexp') {
      const rx = apply.value.text.trim();
      regExpTester.update(rx ? [rx] : {});
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
    const re = /^[\t ]*@-moz-document[\s\n]+/gm;
    const applyRe = new RegExp([
      /(?:\/\*[^*]*\*\/[\s\n]*)*/,
      /(url|url-prefix|domain|regexp)/,
      /\(((['"])(?:\\\\|\\\n|\\\3|[^\n])*?\3|[^)\n]*)\)\s*(,\s*)?/,
    ].map(rx => rx.source).join(''), 'giy');
    let match;
    re.lastIndex = posStart;
    while ((match = re.exec(text))) {
      if (match.index >= posEnd) {
        return;
      }
      const applies = [];
      let m;
      applyRe.lastIndex = re.lastIndex;
      while ((m = applyRe.exec(text))) {
        const apply = createApply(
          m.index,
          m[1],
          unquote(m[2]),
          unquote(m[2]) !== m[2]
        );
        applies.push(apply);
        re.lastIndex = applyRe.lastIndex;
      }
      yield {
        pos: cm.posFromIndex(match.index),
        applies
      };
    }
  }

  function unquote(s) {
    const first = s.charAt(0);
    return (first === '"' || first === "'") && s.endsWith(first) ? s.slice(1, -1) : s;
  }
}
