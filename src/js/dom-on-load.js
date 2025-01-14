import {$create} from './dom';
import {
  closestFocusable, closestHocused, getEventKeyName, isHocused, messageBox, moveFocus, setHocus,
  setLastHocus,
} from './dom-util';
import HeaderResizer from './header-resizer';
import {tHTML} from './localization';
import {onMessage} from './msg';
import * as prefs from './prefs';
import {CHROME, FIREFOX} from './ua';
import {installUsercss} from './urls';
import {clamp, debounce, t, tryURL} from './util';

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
onMessage.set(request => {
  if (request.method === 'editDeleteText') {
    document.execCommand('delete');
  }
});
// Removing transition-suppressor rule
if (!CHROME || CHROME < 93) {
  nextSheet: for (const sheet of document.styleSheets) {
    for (let i = 0, rule; (rule = sheet.cssRules[i]); i++) {
      if (/#\\1\s?transition-suppressor/.test(rule.cssText)) {
        sheet.deleteRule(i);
        break nextSheet;
      }
    }
  }
}
const elOff = $id('disableAll-label'); // won't hide if already shown
if (elOff) prefs.subscribe('disableAll', () => (elOff.dataset.persist = ''));
if ($id('header')) HeaderResizer();

const getFSH = DataTransferItem.prototype.getAsFileSystemHandle;
if (getFSH) {
  addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  addEventListener('drop', async e => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file.type.includes('json')) {
      return;
    }
    if (!/\.(css|styl|less)$/i.test(file.name)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const path = installUsercss;
    // Some apps provide the file's URL in a text dataTransfer item.
    const url = tryURL(dt.getData('text')).href;
    const handle = await getFSH.call([].find.call(dt.items, v => v.kind === 'file'));
    const wnd = window.open(path);
    // Transfer the handle to the new window (required in some versions of Chrome)
    const {structuredClone} = wnd; // Chrome 98+
    (wnd.fsh = structuredClone ? structuredClone(handle) : handle)._url = url;
  }, true);
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
  // This is to avoid forced layout calc as the classic mode may have thousands of buttons
  const xo = new IntersectionObserver(entries => {
    for (const e of entries) {
      const btn = e.target;
      const w = e.boundingClientRect.width;
      if (!w || btn.preresizeClientWidth === w) {
        continue;
      }
      btn.preresizeClientWidth = w;
      if (btn.scrollWidth > w) {
        const text = btn.textContent;
        btn.title = text.includes('\u00AD') ? text.replace(/\u00AD/g, '') : text;
        btn.titleIsForEllipsis = true;
      } else if (btn.title) {
        btn.title = '';
      }
    }
    xo.disconnect();
  });
  for (const el of $$('button, h2')) {
    if (!el.title || el.titleIsForEllipsis) xo.observe(el);
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
    setLastHocus(false);
    setTimeout(() => setHocus(closestHocused(document.activeElement), false));
  }
}

/**
 * @param {PointerEvent} [event] - absent when self-invoked to hide the menu
 */
function splitMenu(event) {
  const prevMenu = $('.split-btn.active ' + SPLIT_BTN_MENU) || $(SPLIT_BTN_MENU);
  const prevPedal = prevMenu?.previousElementSibling;
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
      {style: 'opacity:0'},
      Array.from(pedal.attributes, ({name, value}) =>
        name.startsWith('menu-') &&
        $create('a', {tabIndex: 0, __cmd: name.split('-').pop()}, value)
      ).filter(Boolean));
    const wrapper = pedal.parentElement;
    const xo = new IntersectionObserver(splitMenuIntersect);
    window.on('keydown', splitMenuEscape);
    menu.onfocusout = e => {
      if (!menu.contains(e.relatedTarget)) {
        setTimeout(splitMenu);
      }
    };
    pedal.on('mousedown', e => e.preventDefault());
    wrapper.classList.toggle('active');
    pedal.after(menu);
    moveFocus(menu, 0);
    setHocus(menu.firstChild, isHocused(pedal));
    xo.observe(menu);
    if (__.BUILD !== 'chrome' && FIREFOX) // https://bugzil.la/1939973
      for (let el = wrapper; (el = el.offsetParent) && el.tagName !== 'BODY';)
        xo.observe(el);
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

/**
 * @param {IntersectionObserverEntry[]} entries
 * @param {IntersectionObserver} observer
 */
function splitMenuIntersect(entries, observer) {
  observer.disconnect();
  const menu = entries[0].target;
  let width = 1e6;
  let x, ir;
  for ({intersectionRect: ir} of entries)
    width = Math.min(width, ir.width - (x != null ? x : (x = ir.x, 0)));
  x = width - entries[0].boundingClientRect.width;
  if (x < 0) menu.style.transform = `translateX(calc(${x}px - var(--menu-pad)))`;
  menu.style.opacity = '';
}

function suppressFocusRingOnClick({target}) {
  setLastHocus(closestFocusable(target), true);
}

function showTooltipNote(event) {
  let note = event.target.closest('[data-cmd=note]');
  if (note) {
    event.preventDefault();
    note = tooltips.get(note) || note.title;
    messageBox.show({
      className: 'note center-dialog',
      contents: note.includes('<') ? tHTML(note) :
        note.includes('\n') ? $create('div', note.split('\n').map(line => $create('p', line))) :
          note,
      buttons: [t('confirmClose')],
    });
  }
}

function splitLongTooltips() {
  for (const el of $$('[title]')) {
    tooltips.set(el, el.title);
    // Strip html tags but allow <invalid-html-tags> which we use to emphasize stuff
    el.title = el.title.replace(/(\n\s*)?<\/?[a-z]+[^>]*>(\n\s*)?/g, ' ');
    if (el.title.length < 50) {
      continue;
    }
    const newTitle = el.title
      .split(/\n+/)
      .map(s => s.replace(/([.?!]\s+|[．。？！]\s*|.{50,60},)\s+/gu, '$1\n'))
      .map(s => s.replace(/(.{50,80}(?=.{40,}))\s+/gu, '$1\n'))
      .join('\n\n');
    if (newTitle !== el.title) el.title = newTitle;
  }
}
