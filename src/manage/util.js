import {cssFieldSizing} from '@/js/dom';
import {template} from '@/js/localization';
import * as newUI from './new-ui';

export {newUI};
export const installed = template.body.$('#installed');

export const queue = Object.assign([], {
  THROTTLE: 100, // ms
  styles: new Map(),
  time: 0,
});

export function calcObjSize(obj) {
  if (obj === true || obj == null) return 4;
  if (obj === false) return 5;
  let v = typeof obj;
  if (v === 'string') return obj.length + 2; // inaccurate but fast
  if (v === 'number') return (v = obj) >= 0 && v < 10 ? 1 : Math.ceil(Math.log10(v < 0 ? -v : v));
  if (v !== 'object') return `${obj}`.length;
  let sum = 1;
  if (Array.isArray(obj)) for (v of obj) sum += calcObjSize(v) + 1;
  else for (const k in obj) sum += k.length + 3 + calcObjSize(obj[k]) + 1;
  return sum;
}

/** Adding spaces so CSS can detect "bigness" of a value via amount of spaces at the beginning */
export function padLeft(val, width) {
  val = `${val}`;
  return ' '.repeat(Math.max(0, width - val.length)) + val;
}

/** Clearing the code to free up some memory */
export function removeStyleCode(style) {
  let sum = (style.sourceCode || '').length || 0;
  style.sections.forEach(s => {
    sum += (s.code || '').length;
    s.code = null;
  });
  style.sourceCode = null;
  Object.defineProperty(style, '_codeSize', {value: sum, writable: true}); // non-enumerable!
}

export function objectDiff(first, second, path = '') {
  const diff = [];
  for (const key in first) {
    const a = first[key];
    const b = second[key];
    if (a === b) {
      continue;
    }
    if (b === undefined) {
      diff.push({path, key, values: [a], type: 'removed'});
      continue;
    }
    if (a && typeof a.filter === 'function' && b && typeof b.filter === 'function') {
      if (
        a.length !== b.length ||
        a.some((el, i) => {
          const result = !el || typeof el !== 'object'
            ? el !== b[i]
            : objectDiff(el, b[i], path + key + '[' + i + '].').length;
          return result;
        })
      ) {
        diff.push({path, key, values: [a, b], type: 'changed'});
      }
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
      diff.push(...objectDiff(a, b, path + key + '.'));
    } else {
      diff.push({path, key, values: [a, b], type: 'changed'});
    }
  }
  for (const key in second) {
    if (!(key in first)) {
      diff.push({path, key, values: [second[key]], type: 'added'});
    }
  }
  return diff;
}

export function styleToDummyEntry(style) {
  const name = style.customName || style.name || '';
  return {
    styleMeta: style,
    styleSize: calcObjSize(style) + (style._codeSize || 0),
    // sort case-insensitively the whole list then sort dupes like `Foo` and `foo` case-sensitively
    styleNameLC: name.toLocaleLowerCase() + '\n' + name,
  };
}

self.fitSelectBox = cssFieldSizing ? () => {} : ((
  opts = {},
  showOpts = function (evt) {
    if (evt.button || this[1]) return;
    const elems = Object.values(opts);
    const i = elems.indexOf(opts[this.value]);
    this.style.width = this.offsetWidth + 'px';
    if (i > 0) this.prepend(...elems.slice(0, i));
    this.append(...elems.slice(i + 1));
  },
  hideOpts = function (evt) {
    for (const o of [...this.options]) {
      if (o.value !== this.value) o.remove();
    }
    this.style.removeProperty('width');
    if (evt && evt.isTrusted) return this.offsetWidth; // force layout
  },
  initOpts = function (el) {
    for (const o of el.options) opts[o.value] = o;
    el.on('keydown', showOpts);
    el.on('mousedown', showOpts);
    el.on('blur', hideOpts);
    el.on('input', hideOpts);
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    Object.defineProperty(el, 'value', {
      get: d.get,
      set: val => {
        const opt = opts[typeof val === 'string' ? val : val = `${val}`];
        if (!opt.isConnected) {
          if (el[0]) {
            el[0].replaceWith(opt);
          } else {
            el.append(opt);
          }
        }
        d.set.call(el, val);
        hideOpts.call(el, {});
      },
    });
  }
) => (el, value, init) => {
  if (init) initOpts(el);
  el.value = value;
})();

if (!('loading' in HTMLImageElement.prototype)) {
  const proto = HTMLImageElement.prototype;
  const pSrc = Object.getOwnPropertyDescriptor(proto, 'src');
  const xo = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.intersectionRatio) {
        const el = e.target;
        pSrc.set.call(el, el.dataset.src);
        xo.unobserve(el);
        delete el.dataset.src;
      }
    }
  }, {rootMargin: '200px'});
  Object.defineProperty(proto, 'src', Object.assign({}, pSrc, {
    set(val) {
      if (this.loading === 'lazy') {
        this.dataset.src = val;
        xo.observe(this);
      } else {
        pSrc.set.call(this, val);
      }
    },
  }));
}
