/* global regExpTester debounce messageBox CodeMirror template colorMimicry msg
  $ $create t prefs tryCatch deepEqual */
/* exported createAppliesToLineWidget */
'use strict';

function createAppliesToLineWidget(cm) {
  const THROTTLE_DELAY = 400;
  const RX_SPACE = /(?:\s+|\/\*)+/y;
  let TPL, EVENTS, CLICK_ROUTE;
  let widgets = [];
  let fromLine, toLine, actualStyle;
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
        $create('div.applies-to', [
          $create('label', t('appliesLabel')),
          $create('ul.applies-to-list'),
        ]),
      listItem: template.appliesTo.cloneNode(true),
      appliesToEverything:
        $create('li.applies-to-everything', t('appliesToEverything')),
    };

    $('.applies-value', TPL.listItem).insertAdjacentElement('afterend',
      $create('button.test-regexp', t('styleRegexpTestButton')));

    CLICK_ROUTE = {
      '.test-regexp': showRegExpTester,

      '.remove-applies-to': (item, apply, event) => {
        event.preventDefault();
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

      '.add-applies-to': (item, apply, event) => {
        event.preventDefault();
        const applies = item.closest('.applies-to').__applies;
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
          changeItem(item, apply, 'type', typeElement.value);
          item.dataset.type = apply.type.text;
        } else {
          return EVENTS.oninput.apply(this, arguments);
        }
      },
      oninput({target}) {
        if (target.matches('.applies-value')) {
          const item = target.closest('.applies-to-item');
          const apply = item.__apply;
          changeItem(item, apply, 'value', target.value);
        }
      },
      onclick(event) {
        const {target} = event;
        for (const selector in CLICK_ROUTE) {
          const routed = target.closest(selector);
          if (routed) {
            const item = routed.closest('.applies-to-item');
            CLICK_ROUTE[selector].call(routed, item, item.__apply, event);
            return;
          }
        }
      }
    };

    actualStyle = $create('style');
    fromLine = 0;
    toLine = cm.doc.size;

    cm.on('change', onChange);
    cm.on('optionChange', onOptionChange);

    msg.onExtension(onRuntimeMessage);

    requestAnimationFrame(updateWidgetStyle);
    update();
  }

  function uninit() {
    initialized = false;

    widgets.forEach(clearWidget);
    widgets.length = 0;
    cm.off('change', onChange);
    cm.off('optionChange', onOptionChange);
    msg.off(onRuntimeMessage);
    actualStyle.remove();
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
    if (msg.reason === 'editPreview' && !$(`#stylus-${msg.style.id}`)) {
      // no style element with this id means the style doesn't apply to the editor URL
      return;
    }
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
    const {curOp} = cm;
    if (fromLine >= cm.display.viewFrom && toLine <= (cm.display.viewTo || toLine)) {
      if (!curOp) cm.startOperation();
      doUpdate();
      if (!curOp) cm.endOperation();
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
    if (prefs.get('editor.theme') !== 'default' &&
        !tryCatch(() => $('#cm-theme').sheet.cssRules)) {
      requestAnimationFrame(updateWidgetStyle);
      return;
    }
    const MIN_LUMA = .05;
    const MIN_LUMA_DIFF = .4;
    const color = {
      wrapper: colorMimicry.get(cm.display.wrapper),
      gutter: colorMimicry.get(cm.display.gutters, {
        bg: 'backgroundColor',
        border: 'borderRightColor',
      }),
      line: colorMimicry.get('.CodeMirror-linenumber', null, cm.display.lineDiv),
      comment: colorMimicry.get('span.cm-comment', null, cm.display.lineDiv),
    };
    const hasBorder =
      color.gutter.style.borderRightWidth !== '0px' &&
      !/transparent|\b0\)/g.test(color.gutter.style.borderRightColor);
    const diff = {
      wrapper: Math.abs(color.gutter.bgLuma - color.wrapper.foreLuma),
      border: hasBorder ? Math.abs(color.gutter.bgLuma - color.gutter.borderLuma) : 0,
      line: Math.abs(color.gutter.bgLuma - color.line.foreLuma),
    };
    const preferLine = diff.line > diff.wrapper || diff.line > MIN_LUMA_DIFF;
    const fore = preferLine ? color.line.fore : color.wrapper.fore;

    const border = fore.replace(/[\d.]+(?=\))/, MIN_LUMA_DIFF / 2);
    const borderStyleForced = `1px ${hasBorder ? color.gutter.style.borderRightStyle : 'solid'} ${border}`;

    actualStyle.textContent = `
      .applies-to {
        background-color: ${color.gutter.bg};
        border-top: ${borderStyleForced};
        border-bottom: ${borderStyleForced};
      }
      .applies-to label {
        color: ${fore};
      }
      .applies-to input,
      .applies-to button,
      .applies-to select {
        background: rgba(255, 255, 255, ${
          Math.max(MIN_LUMA, Math.pow(Math.max(0, color.gutter.bgLuma - MIN_LUMA * 2), 2)).toFixed(2)
        });
        border: ${borderStyleForced};
        transition: none;
        color: ${fore};
      }
      .applies-to .svg-icon.select-arrow {
        fill: ${fore};
        transition: none;
      }
    `;
    document.documentElement.appendChild(actualStyle);
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
    let index = 0;
    const lineIndexes = [0];
    cm.doc.iter(0, toPos.line + 1, ({text}) => {
      lineIndexes.push((index += text.length + 1));
    });

    // splice
    i = Math.max(0, i);
    widgets.splice(i, 0, ...createWidgets(fromPos, toPos, widgets.splice(i, j - i), lineIndexes));

    fromLine = null;
    toLine = null;
  }

  function *createWidgets(start, end, removed, lineIndexes) {
    let i = 0;
    let itemHeight;
    for (const section of findAppliesTo(start, end, lineIndexes)) {
      let removedWidget = removed[i];
      while (removedWidget && removedWidget.line.lineNo() < section.pos.line) {
        clearWidget(removed[i]);
        removedWidget = removed[++i];
      }
      if (removedWidget && deepEqual(removedWidget.node.__applies, section.applies, ['mark'])) {
        yield removedWidget;
        i++;
        continue;
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

  function changeItem(itemElement, apply, part, newText) {
    if (!apply) {
      return;
    }
    part = apply[part];
    const range = part.mark.find();
    part.mark.clear();
    newText = unescapeDoubleslash(newText).replace(/\\/g, '\\\\');
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

    if (apply.type.text === 'regexp' && apply.value.text.trim()) {
      showRegExpTester(itemElement);
    }
  }

  function createApply(pos, typeText, valueText, isQuoted = false) {
    typeText = typeText.toLowerCase();
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
        text: unescapeDoubleslash(valueText),
        start: valueStart,
        end: valueEnd,
      },
      end
    };
  }

  function *findAppliesTo(posStart, posEnd, lineIndexes) {
    const funcRe = /^(url|url-prefix|domain|regexp)$/i;
    let pos;
    const eatToken = sticky => {
      if (!sticky) skipSpace(pos, posEnd);
      pos.ch++;
      const token = cm.getTokenAt(pos, true);
      pos.ch = token.end;
      return CodeMirror.cmpPos(pos, posEnd) <= 0 ? token : {};
    };
    const docCur = cm.getSearchCursor('@-moz-document', posStart);
    while (docCur.findNext() &&
           CodeMirror.cmpPos(docCur.pos.to, posEnd) <= 0) {
      // CM can be nitpicky at token boundary so we'll check the next character
      const safePos = {line: docCur.pos.from.line, ch: docCur.pos.from.ch + 1};
      if (/\b(string|comment)\b/.test(cm.getTokenTypeAt(safePos))) continue;
      const applies = [];
      pos = docCur.pos.to;
      do {
        skipSpace(pos, posEnd);
        const funcIndex = lineIndexes[pos.line] + pos.ch;
        const func = eatToken().string;
        // no space allowed before the opening parenthesis
        if (!funcRe.test(func) || eatToken(true).string !== '(') break;
        const url = eatToken();
        if (url.type !== 'string' || eatToken().string !== ')') break;
        const unquotedUrl = unquote(url.string);
        const apply = createApply(
          funcIndex,
          func,
          unquotedUrl,
          unquotedUrl !== url.string
        );
        applies.push(apply);
      } while (eatToken().string === ',');
      yield {
        pos: docCur.pos.from,
        applies
      };
    }
  }

  function skipSpace(pos, posEnd) {
    let {ch, line} = pos;
    let lookForEnd;
    line--;
    cm.doc.iter(pos.line, posEnd.line + 1, ({text}) => {
      line++;
      while (true) {
        if (lookForEnd) {
          ch = text.indexOf('*/', ch) + 1;
          if (!ch) {
            return;
          }
          ch++;
          lookForEnd = false;
        }
        // EOL is a whitespace so we'll check the next line
        if (ch >= text.length) {
          ch = 0;
          return;
        }
        RX_SPACE.lastIndex = ch;
        const m = RX_SPACE.exec(text);
        if (!m) {
          return true;
        }
        ch += m[0].length;
        lookForEnd = m[0].includes('/*');
        if (ch < text.length && !lookForEnd) {
          return true;
        }
      }
    });
    pos.line = line;
    pos.ch = ch;
  }

  function unquote(s) {
    const first = s.charAt(0);
    return (first === '"' || first === "'") && s.endsWith(first) ? s.slice(1, -1) : s;
  }

  function unescapeDoubleslash(s) {
    const hasSingleEscapes = /([^\\]|^)\\([^\\]|$)/.test(s);
    return hasSingleEscapes ? s : s.replace(/\\\\/g, '\\');
  }

  function showRegExpTester(item) {
    regExpTester.toggle(true);
    regExpTester.update(
      item.closest('.applies-to').__applies
        .filter(a => a.type.text === 'regexp')
        .map(a => unescapeDoubleslash(a.value.text)));
  }
}
