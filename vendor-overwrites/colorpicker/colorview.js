/* global CodeMirror */
'use strict';

(() => {
  const OWN_TOKEN_NAME = 'colorview';
  const OWN_DOM_CLASS = 'cm-' + OWN_TOKEN_NAME;
  const OWN_BACKGROUND_CLASS = 'codemirror-colorview-background';
  const HOOKED_TOKEN = new Map([
    ['atom', colorizeAtom],
    ['keyword', colorizeKeyword],
  ].map(([name, fn]) => [name, {override: name + ' ' + OWN_TOKEN_NAME, process: fn}]));

  const NAMED_COLORS = getNamedColorsMap();
  const TRANSPARENT = {
    color: 'transparent',
    colorValue: 'rgba(0, 0, 0, 0)', // as per the CSS spec
  };
  const RX_COLOR = {
    hex: /#(?:[a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})\b/yi,
    rgb: /rgb\((?:\s*\d{1,3}\s*,\s*){2}\d{1,3}\s*\)/yi,
    rgba: /rgba\((?:\s*\d{1,3}\s*,\s*){3}\d*\.?\d+\s*\)/yi,
    hsl: /hsl\(\s*(?:-?\d+|-?\d*\.\d+)\s*(?:,\s*(?:-?\d+|-?\d*\.\d+)%\s*){2}\)/yi,
    hsla: /hsla\(\s*(?:-?\d+|-?\d*\.\d+)\s*(?:,\s*(?:-?\d+|-?\d*\.\d+)%\s*){2},\s*(?:-?\d+|-?\d*\.\d+)\s*\)/yi,
    named: new RegExp([...NAMED_COLORS.keys()].join('|'), 'i'),
  };

  const CodeMirrorEvents = {
    update(cm) {
      if (cm.state.colorpicker.cache.size) {
        renderVisibleTokens(cm);
      }
    },
    keyup(cm) {
      const popup = cm.state.colorpicker.popup;
      if (popup && popup.options.isShortCut === false) {
        popup.hide();
      }
    },
    mousedown(cm, event) {
      const self = cm.state.colorpicker;
      const isMarker = event.button === 0 && event.target.classList.contains(OWN_BACKGROUND_CLASS);
      window.dispatchEvent(new CustomEvent('close-colorpicker-popup', {detail: isMarker && self.popup}));
      if (isMarker) {
        event.preventDefault();
        self.openPopupForToken(event.target.parentNode);
      }
    },
  };

  function registerEvents(cm) {
    Object.keys(CodeMirrorEvents).forEach(name => cm.on(name, CodeMirrorEvents[name]));
  }

  function unregisterEvents(cm) {
    Object.keys(CodeMirrorEvents).forEach(name => cm.off(name, CodeMirrorEvents[name]));
  }

  function registerHooks() {
    const mx = CodeMirror.modeExtensions.css;
    if (!mx || mx.token !== colorizeToken) {
      CodeMirror.extendMode('css', {token: colorizeToken});
      CodeMirror.extendMode('stylus', {token: colorizeToken});
    }
  }

  function unregisterHooks() {
    for (const name in CodeMirror.modeExtensions) {
      const mx = CodeMirror.modeExtensions[name];
      if (mx && mx.token === colorizeToken) {
        delete mx.token;
      }
    }
  }

  function resetMode(cm) {
    cm.setOption('mode', cm.getMode().name);
  }

  function colorizeToken(stream, state) {
    const token = this._token.apply(this, arguments);
    const hookedToken = token && HOOKED_TOKEN.get(token);
    if (!token || !hookedToken) {
      return token;
    }
    const data = state.colorpicker = (state.colorpicker || {});
    const cache = data.cache = (data.cache || stream.lineOracle.doc.cm.state.colorpicker.cache);
    const string = stream.string;
    const sameString = string === data.lastString;

    data.lastString = string;

    let lineCache = data.lineCache = (sameString ? data.lineCache : cache.get(string));
    if (lineCache && lineCache.get(stream.start)) {
      return hookedToken.override;
    }

    const color = hookedToken.process(stream);
    if (color) {
      if (!lineCache) {
        lineCache = data.lineCache = new Map();
        cache.set(string, lineCache);
      }
      lineCache.set(stream.start, color);
      lineCache.set('lastAccessTime', performance.now());
      return hookedToken.override;
    }

    return token;
  }

  function colorizeAtom(stream) {
    const {start, pos, string} = stream;
    const c1 = string.charAt(start);
    if ((c1 === 't' || c1 === 'T') && string.slice(start, pos).toLowerCase() === 'transparent') {
      return TRANSPARENT;
    }
    const maybeHex = c1 === '#';
    const s = !maybeHex && string.charAt(pos) === '(' && string.slice(start, pos).toLowerCase();
    if (maybeHex || (s === 'rgb' || s === 'rgba' || s === 'hsl' || s === 'hsla')) {
      const rx = maybeHex ? RX_COLOR.hex : RX_COLOR[s];
      rx.lastIndex = start;
      const match = rx.exec(string);
      return match && {color: match[0]};
    }
  }

  function colorizeKeyword(stream) {
    const {start, pos, string} = stream;
    if (string.charAt(start) !== '!') {
      const color = string.slice(start, pos);
      const colorValue = NAMED_COLORS.get(color.toLowerCase());
      return colorValue ? {color, colorValue} : colorizeAtom(stream);
    }
  }

  function renderVisibleTokens(cm) {
    const {cache, options} = cm.state.colorpicker;
    let line = cm.display.viewFrom - 1;
    for (const {line: lineHandle, text} of cm.display.renderedView) {
      if (!lineHandle.parent) {
        continue;
      }
      line++;
      const styles = lineHandle.styles;
      if (!styles) {
        continue;
      }
      const lineCache = cache.get(lineHandle.text);
      if (!lineCache) {
        continue;
      }
      let lineCacheAlive = false;
      let elementIndex = 0;
      let elements;
      for (let i = 1; i < styles.length; i += 2) {
        const token = styles[i + 1];
        if (!token || !token.includes(OWN_TOKEN_NAME)) {
          continue;
        }
        const start = styles[i - 2] || 0;
        const data = lineCache.get(start);
        if (!data) {
          continue;
        }
        elements = elements || text.getElementsByClassName(OWN_DOM_CLASS);
        const el = elements[elementIndex++];
        while (true) {
          const nextStyle = styles[i + 3];
          const nextStart = styles[i];
          if (nextStyle && nextStyle.includes(OWN_TOKEN_NAME) &&
              nextStart > start && nextStart <= start + data.color.length) {
            elementIndex++;
            i += 2;
          } else {
            break;
          }
        }
        if (el.colorpickerData && el.colorpickerData.color === data.color) {
          continue;
        }
        el.dataset.colorpicker = '';
        el.colorpickerData = Object.assign({line, ch: start}, data);
        let bg = el.firstElementChild;
        if (!bg) {
          bg = document.createElement('div');
          bg.className = OWN_BACKGROUND_CLASS;
          bg.title = options.tooltip;
          el.appendChild(bg);
        }
        bg.style.setProperty('background-color', data.color, 'important');
        lineCacheAlive = true;
      }
      if (lineCacheAlive) {
        lineCache.set('lastAccessTime', performance.now());
      }
    }
    trimCache(cm);
  }

  function trimCache(cm, debounced) {
    if (!debounced) {
      clearTimeout(trimCache.timer);
      trimCache.timer = setTimeout(trimCache, 20e3, cm, true);
      return;
    }
    const cutoff = performance.now() - 60e3;
    const {cache} = cm.state.colorpicker;
    const textToKeep = new Set();
    cm.doc.iter(({text}) => textToKeep.add(text));
    for (const [text, lineCache] of cache.entries()) {
      if (lineCache.get('lastAccessTime') < cutoff && !textToKeep.has(text)) {
        cache.delete(text);
      }
    }
  }

  function getNamedColorsMap() {
    return new Map([
      ['aliceblue', '#f0f8ff'],
      ['antiquewhite', '#faebd7'],
      ['aqua', '#00ffff'],
      ['aquamarine', '#7fffd4'],
      ['azure', '#f0ffff'],
      ['beige', '#f5f5dc'],
      ['bisque', '#ffe4c4'],
      ['black', '#000000'],
      ['blanchedalmond', '#ffebcd'],
      ['blue', '#0000ff'],
      ['blueviolet', '#8a2be2'],
      ['brown', '#a52a2a'],
      ['burlywood', '#deb887'],
      ['cadetblue', '#5f9ea0'],
      ['chartreuse', '#7fff00'],
      ['chocolate', '#d2691e'],
      ['coral', '#ff7f50'],
      ['cornflowerblue', '#6495ed'],
      ['cornsilk', '#fff8dc'],
      ['crimson', '#dc143c'],
      ['cyan', '#00ffff'],
      ['darkblue', '#00008b'],
      ['darkcyan', '#008b8b'],
      ['darkgoldenrod', '#b8860b'],
      ['darkgray', '#a9a9a9'],
      ['darkgreen', '#006400'],
      ['darkgrey', '#a9a9a9'],
      ['darkkhaki', '#bdb76b'],
      ['darkmagenta', '#8b008b'],
      ['darkolivegreen', '#556b2f'],
      ['darkorange', '#ff8c00'],
      ['darkorchid', '#9932cc'],
      ['darkred', '#8b0000'],
      ['darksalmon', '#e9967a'],
      ['darkseagreen', '#8fbc8f'],
      ['darkslateblue', '#483d8b'],
      ['darkslategray', '#2f4f4f'],
      ['darkslategrey', '#2f4f4f'],
      ['darkturquoise', '#00ced1'],
      ['darkviolet', '#9400d3'],
      ['deeppink', '#ff1493'],
      ['deepskyblue', '#00bfff'],
      ['dimgray', '#696969'],
      ['dimgrey', '#696969'],
      ['dodgerblue', '#1e90ff'],
      ['firebrick', '#b22222'],
      ['floralwhite', '#fffaf0'],
      ['forestgreen', '#228b22'],
      ['fuchsia', '#ff00ff'],
      ['gainsboro', '#dcdcdc'],
      ['ghostwhite', '#f8f8ff'],
      ['gold', '#ffd700'],
      ['goldenrod', '#daa520'],
      ['gray', '#808080'],
      ['green', '#008000'],
      ['greenyellow', '#adff2f'],
      ['grey', '#808080'],
      ['honeydew', '#f0fff0'],
      ['hotpink', '#ff69b4'],
      ['indianred', '#cd5c5c'],
      ['indigo', '#4b0082'],
      ['ivory', '#fffff0'],
      ['khaki', '#f0e68c'],
      ['lavender', '#e6e6fa'],
      ['lavenderblush', '#fff0f5'],
      ['lawngreen', '#7cfc00'],
      ['lemonchiffon', '#fffacd'],
      ['lightblue', '#add8e6'],
      ['lightcoral', '#f08080'],
      ['lightcyan', '#e0ffff'],
      ['lightgoldenrodyellow', '#fafad2'],
      ['lightgray', '#d3d3d3'],
      ['lightgreen', '#90ee90'],
      ['lightgrey', '#d3d3d3'],
      ['lightpink', '#ffb6c1'],
      ['lightsalmon', '#ffa07a'],
      ['lightseagreen', '#20b2aa'],
      ['lightskyblue', '#87cefa'],
      ['lightslategray', '#778899'],
      ['lightslategrey', '#778899'],
      ['lightsteelblue', '#b0c4de'],
      ['lightyellow', '#ffffe0'],
      ['lime', '#00ff00'],
      ['limegreen', '#32cd32'],
      ['linen', '#faf0e6'],
      ['magenta', '#ff00ff'],
      ['maroon', '#800000'],
      ['mediumaquamarine', '#66cdaa'],
      ['mediumblue', '#0000cd'],
      ['mediumorchid', '#ba55d3'],
      ['mediumpurple', '#9370db'],
      ['mediumseagreen', '#3cb371'],
      ['mediumslateblue', '#7b68ee'],
      ['mediumspringgreen', '#00fa9a'],
      ['mediumturquoise', '#48d1cc'],
      ['mediumvioletred', '#c71585'],
      ['midnightblue', '#191970'],
      ['mintcream', '#f5fffa'],
      ['mistyrose', '#ffe4e1'],
      ['moccasin', '#ffe4b5'],
      ['navajowhite', '#ffdead'],
      ['navy', '#000080'],
      ['oldlace', '#fdf5e6'],
      ['olive', '#808000'],
      ['olivedrab', '#6b8e23'],
      ['orange', '#ffa500'],
      ['orangered', '#ff4500'],
      ['orchid', '#da70d6'],
      ['palegoldenrod', '#eee8aa'],
      ['palegreen', '#98fb98'],
      ['paleturquoise', '#afeeee'],
      ['palevioletred', '#db7093'],
      ['papayawhip', '#ffefd5'],
      ['peachpuff', '#ffdab9'],
      ['peru', '#cd853f'],
      ['pink', '#ffc0cb'],
      ['plum', '#dda0dd'],
      ['powderblue', '#b0e0e6'],
      ['purple', '#800080'],
      ['rebeccapurple', '#663399'],
      ['red', '#ff0000'],
      ['rosybrown', '#bc8f8f'],
      ['royalblue', '#4169e1'],
      ['saddlebrown', '#8b4513'],
      ['salmon', '#fa8072'],
      ['sandybrown', '#f4a460'],
      ['seagreen', '#2e8b57'],
      ['seashell', '#fff5ee'],
      ['sienna', '#a0522d'],
      ['silver', '#c0c0c0'],
      ['skyblue', '#87ceeb'],
      ['slateblue', '#6a5acd'],
      ['slategray', '#708090'],
      ['slategrey', '#708090'],
      ['snow', '#fffafa'],
      ['springgreen', '#00ff7f'],
      ['steelblue', '#4682b4'],
      ['tan', '#d2b48c'],
      ['teal', '#008080'],
      ['thistle', '#d8bfd8'],
      ['tomato', '#ff6347'],
      ['turquoise', '#40e0d0'],
      ['violet', '#ee82ee'],
      ['wheat', '#f5deb3'],
      ['white', '#ffffff'],
      ['whitesmoke', '#f5f5f5'],
      ['yellow', '#ffff00'],
      ['yellowgreen', '#9acd32'],
    ]);
  }

  class ColorMarker {
    constructor(cm, {
      tooltip = 'Open color picker',
      popupOptions = {},
      colorpicker,
      forceUpdate,
    } = {}) {
      this.cm = cm;
      this.options = {
        tooltip,
        popup: Object.assign({
          hideDelay: 2000,
          hexUppercase: false,
          tooltipForSwitcher: 'Switch formats: HEX -> RGB -> HSL',
        }, popupOptions),
      };
      this.popup = cm.colorpicker ? cm.colorpicker() : colorpicker;
      this.cache = new Map();
      registerHooks(cm);
      registerEvents(cm);
      if (forceUpdate) {
        resetMode(cm);
      }
    }

    destroy() {
      unregisterHooks(this.cm);
      unregisterEvents(this.cm);
      resetMode(this.cm);
      this.cm.state.colorpicker = null;
    }

    openPopup(color) {
      let {line, ch} = this.cm.getCursor();
      const lineText = this.cm.getLine(line);
      const atImportant = lineText.lastIndexOf('!important', ch);
      ch -= (atImportant >= Math.max(0, ch - '!important'.length)) ? '!important'.length : 0;
      const lineCache = this.cm.state.colorpicker.cache.get(lineText);
      const data = {line, ch, colorValue: color, isShortCut: true};
      for (const [start, {color, colorValue = color}] of lineCache && lineCache.entries() || []) {
        if (start <= ch && ch <= start + color.length) {
          Object.assign(data, {ch: start, color, colorValue});
          break;
        }
      }
      this.openPopupForToken({colorpickerData: data});
    }

    openPopupForToken({colorpickerData: data}) {
      if (this.popup) {
        const {left, bottom: top} = this.cm.charCoords(data, 'window');
        this.popup.show(Object.assign(this.options.popup, data, {
          top,
          left,
          cm: this.cm,
          color: data.colorValue || data.color,
          prevColor: data.color || '',
          isShortCut: false,
          callback: ColorMarker.popupOnChange,
        }));
      }
    }

    closePopup() {
      if (this.popup) {
        this.popup.hide();
      }
    }

    static popupOnChange(newColor) {
      const {cm, line, ch, embedderCallback} = this;
      const to = {line, ch: ch + this.prevColor.length};
      if (cm.getRange(this, to) !== newColor) {
        cm.replaceRange(newColor, this, to, '*colorpicker');
        this.prevColor = newColor;
      }
      if (typeof embedderCallback === 'function') {
        embedderCallback(this);
      }
    }
  }

  CodeMirror.defineOption('colorpicker', false, (cm, value, oldValue) => {
    if (oldValue && oldValue !== CodeMirror.Init && cm.state.colorpicker) {
      cm.state.colorpicker.destroy();
    }
    if (value) {
      cm.state.colorpicker = new ColorMarker(cm, value);
    }
  });

  // initial runMode is performed by CodeMirror before setting our option
  // so we register the hooks right away - not a problem as our js is loaded on demand
  registerHooks();
})();
