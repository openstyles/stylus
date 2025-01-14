import {k_size} from '@/js/consts';
import {cssFieldSizing} from '@/js/dom';
import {template} from '@/js/localization';
import * as newUI from './new-ui';

export {newUI};
export const installed = template.body.$('#installed');

export const queue = Object.assign([], {
  styles: new Map(),
});

/** Adding spaces so CSS can detect "bigness" of a value via amount of spaces at the beginning */
export function padLeft(val, width) {
  val = `${val}`;
  return ' '.repeat(Math.max(0, width - val.length)) + val;
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
  const size = style[k_size];
  delete style[k_size];
  return {
    styleMeta: style,
    styleSize: size,
    // sort case-insensitively the whole list then sort dupes like `Foo` and `foo` case-sensitively
    styleNameLC: name.toLocaleLowerCase() + '\n' + name,
  };
}

self.fitSelectBox = cssFieldSizing ? () => {} : ((
  showOpts = function (evt) {
    if (evt.button || this[1]) return;
    const opts = this._opts;
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
    const opts = el._opts = {};
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
