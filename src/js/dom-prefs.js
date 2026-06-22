import {cssFieldSizing} from './dom';
import {mqCompact} from './dom-init';
import {onDetailsToggled} from './dom-util';
import * as prefs from './prefs';

export function setupLiveDetails() {
  const mo = new MutationObserver(saveOnChange);
  const moCfg = {attributes: true, attributeFilter: ['open']};
  const SEL = 'details[data-pref]';
  const SEL_NO_SAVE = '[data-peek], .compact-layout .ignore-pref-if-compact';
  for (const el of $$(SEL)) {
    prefs.subscribe(el.dataset.pref, updateOnPrefChange, true);
    mo.observe(el, moCfg);
  }
  mqCompact?.(val => {
    for (const el of $$(SEL)) {
      if (!el.matches('.ignore-pref')) {
        el.open = (!val || !el.classList.contains('ignore-pref-if-compact'))
          && prefs.__values[el.dataset.pref];
      }
    }
  });
  /** @param {MutationRecord[]} _ */
  function saveOnChange([{target: el}]) {
    const {open} = el;
    const key = el.dataset.pref;
    const fn = onDetailsToggled.get(el);
    const canSave = !el.matches(SEL_NO_SAVE);
    if (canSave) prefs.set(key, open);
    fn?.(key, open);
  }
  function updateOnPrefChange(key, value) {
    const el = $(`details[data-pref="${key}"]`);
    if (el.open !== value && !el.matches(SEL_NO_SAVE)) {
      el.open = value;
    }
  }
}

/**
 * Must be called when prefs is ready to properly handle init=true -> subscribe -> init=false
 * Accepts an array of pref names (values are fetched via prefs.get)
 * or an element inside which to look for elements with known pref ids
 * and establishes a two-way connection between the document elements and the actual prefs
 */
export function setupLivePrefs(ids) {
  // getElementsByTagName is cached so it's much faster than calling querySelector for each id
  const all = (ids instanceof Element ? ids : document).getElementsByTagName('*');
  ids = ids?.forEach ? [...ids] : prefs.knownKeys.filter(id => id in all);
  prefs.subscribe(ids, updateElement, true);
  function onChange() {
    if (this.checkValidity() && (this.type !== 'radio' || this.checked)) {
      prefs.set(this.id || this.name, getValue(this), undefined, onChange);
    }
  }
  function getValue(el) {
    const type = el.dataset.valueType || el.type;
    return type === 'checkbox' ? el.checked :
      type === 'number' ? parseFloat(el.value) :
      el.value;
  }
  function isSame(el, oldValue, value) {
    return el.type === 'radio' ? el.checked === (oldValue === value) :
      el.localName === 'select' && typeof value === 'boolean' && oldValue === `${value}` ||
      oldValue === value;
  }
  function updateElement(id, value, init, initiator) {
    if (initiator === onChange)
      return;
    const byId = all[id];
    const els = byId && byId.id ? [byId] : document.getElementsByName(id);
    if (!els[0]) {
      prefs.unsubscribe(id, updateElement);
      return;
    }
    for (const el of els) {
      const oldValue = getValue(el);
      const diff = !isSame(el, oldValue, value);
      const type = el.type;
      const isSelect = type === 'select-one';
      if (isSelect && el.$(`option[value="${value}"]`)?.disabled)
        return;
      if (isSelect
      && !__.MV3 && !cssFieldSizing && (init || diff) && el.classList.contains('fit-width')) {
        fitSelectBox(el, value, init); /* global fitSelectBox */
      } else if (diff) {
        if (type === 'radio') {
          el.checked = value === oldValue;
        } else if (type === 'checkbox') {
          el.checked = value;
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      if (init) el.on('change', onChange);
    }
  }
}

/** @param {(data: ShowIfItem, id: string, mode: string) => any} cb */
export function setupConditionalPrefs(cb) {
  /** @type {{[id: string]: ShowIfItem[]}} */
  const showIf = {__proto__: null};
  for (const el of $$('[show-if]')) {
    const m = el.getAttribute('show-if').match(/^\s*(!\s*)?([.\w]+)\s*(?:(!?=)\s*(\S*)|:(\w+))?/);
    const [, not, id, op, opVal, mode] = m;
    /** @namespace ShowIfItem */
    const data = {el, not, op, opVal};
    (showIf[id] ||= []).push(data);
    cb?.(data, id, mode);
  }
  prefs.subscribe(Object.keys(showIf), (key, val) => {
    for (const {el, not, op, opVal} of showIf[key]) {
      el.classList.toggle('disabled', !(
        not ? !val : !op ? val :
          op === '=' ? val == opVal : val != opVal // eslint-disable-line eqeqeq
      ));
    }
  }, true);
}
