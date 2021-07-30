/* global $ $create messageBoxProxy */// dom.js
/* global CodeMirror */
/* global MozSectionFinder */
/* global colorMimicry */
/* global editor */
/* global msg */
/* global prefs */
/* global t */// localization.js
/* global tryCatch */// toolbox.js
'use strict';

/* exported MozSectionWidget */
function MozSectionWidget(cm, finder = MozSectionFinder(cm)) {
  let TPL, EVENTS, CLICK_ROUTE;
  const KEY = 'MozSectionWidget';
  const C_CONTAINER = '.applies-to';
  const C_LABEL = 'label';
  const C_LIST = '.applies-to-list';
  const C_ITEM = '.applies-to-item';
  const C_TYPE = '.applies-type';
  const C_VALUE = '.applies-value';
  /** @returns {MarkedFunc} */
  const getFuncFor = el => el.closest(C_ITEM)[KEY];
  /** @returns {MarkedFunc[]} */
  const getFuncsFor = el => el.closest(C_LIST)[KEY];
  /** @returns {MozSection} */
  const getSectionFor = el => el.closest(C_CONTAINER)[KEY];
  const {cmpPos} = CodeMirror;
  let enabled = false;
  let funcHeight = 0;
  /** @type {HTMLStyleElement} */
  let actualStyle;

  return {
    toggle(enable) {
      if (Boolean(enable) !== enabled) {
        (enable ? init : destroy)();
      }
    },
  };

  function init() {
    enabled = true;
    TPL = {
      container:
        $create('div' + C_CONTAINER, [
          $create(C_LABEL, t('appliesLabel')),
          $create('ul' + C_LIST),
        ]),
      listItem:
        t.template.appliesTo.cloneNode(true),
      appliesToEverything:
        $create('li.applies-to-everything', t('appliesToEverything')),
    };

    $(C_VALUE, TPL.listItem).after(
      $create('button.test-regexp', t('styleRegexpTestButton')));

    CLICK_ROUTE = {
      '.test-regexp': showRegExpTester,
      /**
       * @param {HTMLElement} elItem
       * @param {MarkedFunc} func
       */
      '.remove-applies-to'(elItem, func) {
        const funcs = getFuncsFor(elItem);
        if (funcs.length < 2) {
          messageBoxProxy.show({
            contents: t('appliesRemoveError'),
            buttons: [t('confirmClose')],
          });
          return;
        }
        const i = funcs.indexOf(func);
        const next = funcs[i + 1];
        const from = i ? funcs[i - 1].item.find(1) : func.item.find(-1);
        const to = next ? next.item.find(-1) : func.item.find(1);
        cm.replaceRange(i && next ? ', ' : '', from, to);
      },
      /**
       * @param {HTMLElement} elItem
       * @param {MarkedFunc} func
       */
      '.add-applies-to'(elItem, func) {
        const pos = func.item.find(1);
        cm.replaceRange(`, ${func.typeText}("")`, pos, pos);
      },
    };

    EVENTS = {
      onchange({target: el}) {
        EVENTS.oninput({target: el.closest(C_TYPE) || el});
      },
      oninput({target: el}) {
        const part =
          el.matches(C_VALUE) && 'value' ||
          el.matches(C_TYPE) && 'type';
        if (!part) return;
        const func = getFuncFor(el);
        const pos = func[part].find();
        if (part === 'type' && el.value !== func.typeText) {
          func.typeText = func.item[KEY].dataset.type = el.value;
        }
        if (part === 'value' && func === getFuncsFor(el)[0]) {
          const sec = getSectionFor(el);
          sec.tocEntry.target = el.value;
          if (!sec.tocEntry.label) editor.updateToc([sec]);
        }
        cm.replaceRange(toDoubleslash(el.value), pos.from, pos.to, finder.IGNORE_ORIGIN);
      },
      onclick(event) {
        const {target} = event;
        for (const selector in CLICK_ROUTE) {
          const routed = target.closest(selector);
          if (routed) {
            const elItem = routed.closest(C_ITEM);
            CLICK_ROUTE[selector](elItem, elItem[KEY], event);
            return;
          }
        }
      },
    };

    actualStyle = $create('style');

    cm.on('optionChange', onCmOption);
    msg.onExtension(onRuntimeMessage);
    if (finder.sections.length) {
      update(finder.sections, []);
    }
    finder.on(update);
    requestAnimationFrame(updateWidgetStyle);
  }

  function destroy() {
    enabled = false;
    cm.off('optionChange', onCmOption);
    msg.off(onRuntimeMessage);
    actualStyle.remove();
    actualStyle = null;
    cm.operation(() => finder.sections.forEach(killWidget));
    finder.off(update);
  }

  function onCmOption(cm, option) {
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

  function updateWidgetStyle() {
    funcHeight = 0;
    if (prefs.get('editor.theme') !== 'default' &&
        !tryCatch(() => $('#cm-theme').sheet.cssRules)) {
      requestAnimationFrame(updateWidgetStyle);
      return;
    }
    const MIN_LUMA = .05;
    const MIN_LUMA_DIFF = .4;
    const color = {
      wrapper: colorMimicry(cm.display.wrapper),
      gutter: colorMimicry(cm.display.gutters, {
        bg: 'backgroundColor',
        border: 'borderRightColor',
      }),
      line: colorMimicry('.CodeMirror-linenumber', null, cm.display.lineDiv),
      comment: colorMimicry('span.cm-comment', null, cm.display.lineDiv),
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
      ${C_CONTAINER} {
        background-color: ${color.gutter.bg};
        border-top: ${borderStyleForced};
        border-bottom: ${borderStyleForced};
      }
      ${C_CONTAINER} ${C_LABEL} {
        color: ${fore};
      }
      ${C_CONTAINER} input,
      ${C_CONTAINER} button,
      ${C_CONTAINER} select {
        background: rgba(255, 255, 255, ${
          Math.max(MIN_LUMA, Math.pow(Math.max(0, color.gutter.bgLuma - MIN_LUMA * 2), 2)).toFixed(2)
        });
        border: ${borderStyleForced};
        transition: none;
        color: ${fore};
      }
      ${C_CONTAINER} .svg-icon.select-arrow {
        fill: ${fore};
        transition: none;
      }
    `;
    document.documentElement.appendChild(actualStyle);
  }

  /**
   * @param {MozSection[]} added
   * @param {MozSection[]} removed
   * @param {number} cutAt
   */
  function update(added, removed, cutAt = finder.sections.indexOf(added[0])) {
    const isDelayed = added.isDelayed && (cm.startOperation(), true);
    const toDelay = [];
    const t0 = performance.now();
    let {viewFrom, viewTo} = cm.display;
    for (const sec of added) {
      const i = removed.findIndex(isReusableWidget, sec);
      const old = removed[i];
      if (isDelayed || old || sec.end.line >= viewFrom && sec.start.line < viewTo) {
        renderWidget(sec, old);
        viewTo -= (sec.funcs.length || 1) * 1.25;
        if (old) removed[i] = null;
        if (performance.now() - t0 > 50) {
          toDelay.push(...added.slice(added.indexOf(sec) + 1));
          break;
        }
      } else {
        toDelay.push(sec);
      }
    }
    // renumber
    for (let i = Math.max(0, cutAt), {sections} = finder, sec; (sec = sections[i++]);) {
      if (!toDelay.includes(sec)) {
        const data = $(C_LABEL, sec.widget.node).dataset;
        if (data.index !== `${i}`) data.index = `${i}`;
      }
    }
    if (toDelay.length) {
      toDelay.isDelayed = true;
      setTimeout(update, 0, toDelay, removed);
    } else {
      removed.forEach(killWidget);
    }
    if (isDelayed) cm.endOperation();
  }

  /** @this {MozSection} */
  function isReusableWidget(r) {
    return r &&
      r.widget &&
      r.widget.line.parent &&
      r.start &&
      !cmpPos(r.start, this.start);
  }

  function renderWidget(sec, old) {
    let widget = old && old.widget;
    const height = Math.round(funcHeight * (sec.funcs.length || 1)) || undefined;
    const node = renderContainer(sec, widget);
    if (widget) {
      widget.node = node;
      if (height && height !== widget.height) {
        widget.height = height;
        widget.changed();
      }
    } else {
      widget = cm.addLineWidget(sec.start.line, node, {
        coverGutter: true,
        noHScroll: true,
        above: true,
        height,
      });
      widget.on('redraw', () => {
        const value = cm.display.barWidth + 'px';
        if (widget[KEY] !== value) {
          widget[KEY] = value;
          node.style.setProperty('--cm-bar-width', value);
        }
      });
    }
    if (!funcHeight) {
      funcHeight = node.offsetHeight / (sec.funcs.length || 1);
    }
    setProp(sec, 'widget', widget);
    return widget;
  }

  /**
   * @param {MozSection} sec
   * @param {LineWidget} oldWidget
   * @returns {Node}
   */
  function renderContainer(sec, oldWidget) {
    const container = oldWidget ? oldWidget.node : TPL.container.cloneNode(true);
    const elList = $(C_LIST, container);
    const {funcs} = sec;
    const oldItems = elList[KEY] || false;
    const items = funcs.map((f, i) => renderFunc(f, oldItems[i]));
    let slot = elList.firstChild;
    for (const {item} of items) {
      const el = item[KEY];
      if (el !== slot) {
        elList.insertBefore(el, slot);
        if (slot) slot.remove();
        slot = el;
      }
      slot = slot.nextSibling;
    }
    for (let i = funcs.length; oldItems && i < oldItems.length; i++) {
      killFunc(oldItems[i]);
      if (slot) {
        const el = slot.nextSibling;
        slot.remove();
        slot = el;
      }
    }
    if (!funcs.length && (!oldItems || oldItems.length)) {
      TPL.appliesToEverything.cloneNode(true);
    }
    setProp(sec, 'widgetFuncs', items);
    elList[KEY] = items;
    container[KEY] = sec;
    container.classList.toggle('error', !sec.funcs.length);
    return Object.assign(container, EVENTS);
  }

  /**
   * @param {MozSectionFunc} func
   * @param {MarkedFunc} old
   * @returns {MarkedFunc}
   */
  function renderFunc(func, old = {}) {
    const {
      type,
      value,
      isQuoted = false,
      start,
      start: {line},
      typeEnd = {line, ch: start.ch + type.length},
      valuePos = {line, ch: typeEnd.ch + 1 + Boolean(isQuoted)},
      valueEnd = {line, ch: valuePos.ch + value.length},
      end = {line, ch: valueEnd.ch + Boolean(isQuoted) + 1},
    } = func;
    const el = (old.item || {})[KEY] || TPL.listItem.cloneNode(true);
    /** @namespace MarkedFunc */
    const res = el[KEY] = {
      typeText: type,
      item: markFuncPart(start, end, old.item, el),
      type: markFuncPart(start, typeEnd, old.type, $(C_TYPE, el), type, toLowerCase),
      value: markFuncPart(valuePos, valueEnd, old.value, $(C_VALUE, el), value, fromDoubleslash),
    };
    if (el.dataset.type !== type) {
      el.dataset.type = type;
    }
    return res;
  }

  /**
   * @param {CodeMirror.Pos} start
   * @param {CodeMirror.Pos} end
   * @param {TextMarker} marker
   * @param {HTMLElement} el
   * @param {string} [text]
   * @param {function} [textTransform]
   * @returns {TextMarker}
   */
  function markFuncPart(start, end, marker, el, text, textTransform) {
    if (marker) {
      const pos = marker.find();
      if (!pos ||
          cmpPos(pos.from, start) ||
          cmpPos(pos.to, end) ||
          text != null && text !== cm.getRange(start, end)) {
        marker.clear();
        marker = null;
      }
    }
    if (!marker) {
      marker = cm.markText(start, end, {
        clearWhenEmpty: false,
        inclusiveLeft: true,
        inclusiveRight: true,
        [KEY]: el,
      });
    }
    if (text != null) {
      text = textTransform(text);
      if (el.value !== text) el.value = text;
    }
    return marker;
  }

  /** @type {MozSection} sec */
  function killWidget(sec) {
    const w = sec && sec.widget;
    if (w) {
      w.clear();
      w.node[KEY].widgetFuncs.forEach(killFunc);
    }
  }

  /** @type {MarkedFunc} f */
  function killFunc(f) {
    f.item.clear();
    f.type.clear();
    f.value.clear();
  }

  async function showRegExpTester(el) {
    /* global regexpTester */
    await require(['/edit/regexp-tester']);
    const reFuncs = getFuncsFor(el).filter(f => f.typeText === 'regexp');
    regexpTester.toggle(true);
    regexpTester.update(reFuncs.map(f => fromDoubleslash(f.value[KEY].value)));
  }

  function fromDoubleslash(s) {
    return /([^\\]|^)\\([^\\]|$)/.test(s) ? s : s.replace(/\\\\/g, '\\');
  }

  function toDoubleslash(s) {
    return fromDoubleslash(s).replace(/\\/g, '\\\\');
  }

  function toLowerCase(s) {
    return s.toLowerCase();
  }

  /** Adds a non-enumerable property so it won't be seen by deepEqual */
  function setProp(obj, name, value) {
    return Object.defineProperty(obj, name, {value, configurable: true});
  }
}
