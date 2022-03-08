/* global $$ $ $create focusAccessibility getEventKeyName moveFocus */// dom.js
/* global CHROME clamp debounce */// toolbox.js
/* global msg */
/* global t */// localization.js
'use strict';

/** DOM housekeeping after a page finished loading */

(() => {
  const SPLIT_BTN_MENU = '.split-btn-menu';
  const tooltips = new WeakMap();
  splitLongTooltips();
  addTooltipsToEllipsized();
  window.on('mousedown', suppressFocusRingOnClick, {passive: true});
  window.on('keydown', keepFocusRingOnTabbing, {passive: true});
  window.on('keypress', clickDummyLinkOnEnter);
  window.on('wheel', changeFocusedInputOnWheel, {capture: true, passive: false});
  window.on('click', splitMenu);
  window.on('click', showTooltipNote, true);
  window.on('resize', () => debounce(addTooltipsToEllipsized, 100));
  msg.onExtension(request => {
    if (request.method === 'editDeleteText') {
      document.execCommand('delete');
    }
  });
  // Removing transition-suppressor rule
  if (!CHROME || CHROME < 93) {
    const {sheet} = $('link[href$="global.css"]');
    for (let i = 0, rule; (rule = sheet.cssRules[i]); i++) {
      if (/#\\1\s?transition-suppressor/.test(rule.cssText)) {
        sheet.deleteRule(i);
        break;
      }
    }
  }

  function changeFocusedInputOnWheel(event) {
    const el = document.activeElement;
    if (!el || el !== event.target && !el.contains(event.target)) {
      return;
    }
    const isSelect = el.tagName === 'SELECT';
    if (isSelect || el.tagName === 'INPUT' && el.type === 'range') {
      const key = isSelect ? 'selectedIndex' : 'valueAsNumber';
      const old = el[key];
      const rawVal = old + Math.sign(event.deltaY) * (el.step || 1);
      el[key] = clamp(rawVal, el.min || 0, el.max || el.length - 1);
      if (el[key] !== old) {
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      event.preventDefault();
    }
    event.stopImmediatePropagation();
  }

  /** Displays a full text tooltip on buttons with ellipsis overflow and no inherent title */
  function addTooltipsToEllipsized() {
    for (const btn of document.getElementsByTagName('button')) {
      if (btn.title && !btn.titleIsForEllipsis) {
        continue;
      }
      const width = btn.offsetWidth;
      if (!width || btn.preresizeClientWidth === width) {
        continue;
      }
      btn.preresizeClientWidth = width;
      if (btn.scrollWidth > width) {
        const text = btn.textContent;
        btn.title = text.includes('\u00AD') ? text.replace(/\u00AD/g, '') : text;
        btn.titleIsForEllipsis = true;
      } else if (btn.title) {
        btn.title = '';
      }
    }
  }

  function clickDummyLinkOnEnter(e) {
    if (getEventKeyName(e) === 'Enter') {
      const a = e.target.closest('a');
      const isDummy = a && !a.href && a.tabIndex === 0;
      if (isDummy) a.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    }
  }

  function keepFocusRingOnTabbing(event) {
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      focusAccessibility.lastFocusedViaClick = false;
      setTimeout(() => {
        let el = document.activeElement;
        if (el) {
          el = el.closest('[data-focused-via-click]');
          focusAccessibility.toggle(el, false);
        }
      });
    }
  }

  /**
   * @param {PointerEvent} [event] - absent when self-invoked to hide the menu
   */
  function splitMenu(event) {
    const prevMenu = $('.split-btn.active ' + SPLIT_BTN_MENU) || $(SPLIT_BTN_MENU);
    const prevPedal = (prevMenu || {}).previousElementSibling;
    const pedal = event && event.target.closest('.split-btn-pedal');
    const entry = event && prevMenu && event.target.closest(SPLIT_BTN_MENU + '>*');
    if (prevMenu) {
      prevMenu.onfocusout = null;
      prevMenu.remove();
      prevPedal.parentElement.classList.remove('active');
      window.off('keydown', splitMenuEscape);
      if (!event) prevPedal.focus();
    }
    if (pedal && pedal !== prevPedal) {
      const menu = $create(SPLIT_BTN_MENU,
        Array.from(pedal.attributes, ({name, value}) =>
          name.startsWith('menu-') &&
          $create('a', {tabIndex: 0, __cmd: name.split('-').pop()}, value)
        ));
      window.on('keydown', splitMenuEscape);
      menu.onfocusout = e => {
        if (!menu.contains(e.relatedTarget)) {
          setTimeout(splitMenu);
        }
      };
      pedal.on('mousedown', e => e.preventDefault());
      pedal.parentElement.classList.toggle('active');
      pedal.after(menu);
      moveFocus(menu, 0);
      focusAccessibility.toggle(menu.firstChild, focusAccessibility.get(pedal));
    }
    if (entry) {
      prevPedal.previousElementSibling.dispatchEvent(new CustomEvent('split-btn', {
        detail: entry.__cmd,
        bubbles: true,
      }));
    }
  }

  function splitMenuEscape(e) {
    if (getEventKeyName(e) === 'Escape') {
      e.preventDefault();
      splitMenu();
    }
  }

  function suppressFocusRingOnClick({target}) {
    const el = focusAccessibility.closest(target);
    if (el) {
      focusAccessibility.lastFocusedViaClick = true;
      focusAccessibility.toggle(el, true);
    }
  }

  function showTooltipNote(event) {
    const el = event.target.closest('[data-cmd=note]');
    if (el) {
      event.preventDefault();
      window.messageBoxProxy.show({
        className: 'note center-dialog',
        contents: tooltips.get(el) || el.title,
        buttons: [t('confirmClose')],
      });
    }
  }

  function splitLongTooltips() {
    for (const el of $$('[title]')) {
      tooltips.set(el, el.title);
      el.title = el.title.replace(/<\/?\w+>/g, ''); // strip html tags
      if (el.title.length < 50) {
        continue;
      }
      const newTitle = el.title
        .split('\n')
        .map(s => s.replace(/([^.][.。?!]|.{50,60},)\s+/g, '$1\n'))
        .map(s => s.replace(/(.{50,80}(?=.{40,}))\s+/g, '$1\n'))
        .join('\n');
      if (newTitle !== el.title) el.title = newTitle;
    }
  }
})();
