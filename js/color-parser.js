'use strict';

// eslint-disable-next-line no-var
var colorParser = (() => {
  const el = document.createElement('div');
  // https://bugs.webkit.org/show_bug.cgi?id=14563
  document.head.appendChild(el);

  function parseRGB(color) {
    const [r, g, b, a = 1] = color.match(/[.\d]+/g).map(Number);
    return {r, g, b, a};
  }

  function parse(color) {
    el.style.color = color;
    if (el.style.color === '') {
      throw new Error(chrome.i18n.getMessage('styleMetaErrorColor', color));
    }
    color = getComputedStyle(el).color;
    el.style.color = '';
    return parseRGB(color);
  }

  function format({r, g, b, a = 1}) {
    if (a === 1) {
      return `rgb(${r}, ${g}, ${b})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function formatHex({r, g, b, a = null}) {
    let hex = '#' + (0x1000000 + (r << 16) + (g << 8) + (b | 0)).toString(16).substr(1);
    if (a !== null) {
      hex += (0x100 + Math.floor(a * 255)).toString(16).substr(1);
    }
    return hex;
  }

  return {parse, format, formatHex};
})();
