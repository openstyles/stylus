import {$create} from '@/js/dom';
import {debounce} from '@/js/util';

const styleCache = new Map();

/**
 * Calculates real color of an element:
 * colorMimicry(cm.display.gutters, {bg: 'backgroundColor'})
 * colorMimicry('input.foo.bar', null, $('some.parent.to.host.the.dummy'))
 */
export default function colorMimicry(el, targets, dummyContainer = document.body) {
  targets = targets || {};
  targets.fore = 'color';
  const colors = {};
  const done = {};
  let numDone = 0;
  let numTotal = 0;
  const rootStyle = getStyle(document.documentElement);
  for (const k in targets) {
    const base = {r: 0, g: 0, b: 0, a: 0};
    blend(base, rootStyle[targets[k]]);
    colors[k] = base;
    numTotal++;
  }
  const isDummy = typeof el === 'string';
  if (isDummy) {
    el = dummyContainer.appendChild($create(el, {style: 'display: none'}));
  }
  for (let current = el; current; current = current && current.parentElement) {
    const style = getStyle(current);
    for (const k in targets) {
      if (!done[k]) {
        done[k] = blend(colors[k], style[targets[k]]);
        numDone += done[k] ? 1 : 0;
        if (numDone === numTotal) {
          current = null;
          break;
        }
      }
    }
    colors.style = colors.style || style;
  }
  if (isDummy) {
    el.remove();
  }
  for (const k in targets) {
    const c = colors[k];
    if (!isOpaque(c)) {
      blend(colors[k] = {r: 255, g: 255, b: 255, a: 1}, c);
    }
    const {r, g, b, a} = colors[k];
    colors[k] = `rgba(${r}, ${g}, ${b}, ${a})`;
    // https://www.w3.org/TR/AERT#color-contrast
    colors[k + 'Luma'] = (r * .299 + g * .587 + b * .114) / 256;
  }
  debounce(clearCache);
  return colors;
}

function blend(base, color) {
  let r, g, b, a;
  if (typeof color === 'string') {
    [r, g, b, a = 255] = (color.match(/\d+/g) || []).map(Number);
  } else {
    ({r, g, b, a = 255} = color);
  }
  if (a === 255) {
    base.r = r;
    base.g = g;
    base.b = b;
    base.a = 1;
  } else if (a) {
    const mixedA = 1 - (1 - a / 255) * (1 - base.a);
    const q1 = a / 255 / mixedA;
    const q2 = base.a * (1 - mixedA) / mixedA;
    base.r = Math.round(r * q1 + base.r * q2);
    base.g = Math.round(g * q1 + base.g * q2);
    base.b = Math.round(b * q1 + base.b * q2);
    base.a = mixedA;
  }
  return isOpaque(base);
}

/** Speed-up for sequential invocations within the same event loop cycle
 * (we're assuming the invoker doesn't force CSSOM to refresh between the calls) */
function getStyle(el) {
  let style = styleCache.get(el);
  if (!style) {
    style = getComputedStyle(el);
    styleCache.set(el, style);
  }
  return style;
}

function clearCache() {
  styleCache.clear();
}

function isOpaque({a}) {
  return Math.abs(a - 1) < 1e-3;
}
