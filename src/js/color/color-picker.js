import * as colorConverter from './color-converter';
import colorMimicry from './color-mimicry';
import './color-picker.css';

export default function ColorPicker(cm) {
  const {constrain} = colorConverter;
  const CSS_PREFIX = 'colorpicker-';
  const HUE_COLORS = [
    {hex: '#ff0000', start: .0},
    {hex: '#ffff00', start: .17},
    {hex: '#00ff00', start: .33},
    {hex: '#00ffff', start: .50},
    {hex: '#0000ff', start: .67},
    {hex: '#ff00ff', start: .83},
    {hex: '#ff0000', start: 1},
  ];
  const MIN_HEIGHT = 220;
  const MARGIN = 8;
  let maxHeight = '0px';

  let HSV = {};
  let currentFormat;
  const prevHSV = {};

  let initialized = false;
  let shown = false;
  let options = {};

  let /** @type {HTMLElement} */ $root;
  let /** @type {HTMLElement} */ $sat;
  let /** @type {HTMLElement} */ $satPointer;
  let /** @type {HTMLElement} */ $hue;
  let /** @type {HTMLElement} */ $hueKnob;
  let /** @type {HTMLElement} */ $opacity;
  let /** @type {HTMLElement} */ $opacityBar;
  let /** @type {HTMLElement} */ $opacityKnob;
  let /** @type {HTMLElement} */ $swatch;
  let /** @type {HTMLElement} */ $formatChangeButton;
  let /** @type {HTMLElement} */ $hexCode;
  let /** @type {HTMLElement} */ $palette;
  const $inputGroups = {};
  const $inputs = {};
  const $hexLettercase = {};

  const allowInputFocus = !('ontouchstart' in document) || window.innerHeight > 800;

  const dragging = {
    saturationPointerPos: {x: 0, y: 0},
    hueKnobPos: 0,
    saturation: false,
    hue: false,
    opacity: false,
    popup: false,
  };

  let prevFocusedElement;
  let lastOutputColor;
  let userActivity;

  const PUBLIC_API = {
    $root,
    show,
    hide,
    setColor,
    getColor,
    options,
  };
  return PUBLIC_API;

  //region DOM

  function init() {
    /** @returns {HTMLElement} */
    function $(cls, props = {}, children = []) {
      if (Array.isArray(props) || typeof props === 'string' || props instanceof Node) {
        children = props;
        props = {};
      }
      const el = $tag(props.tag || 'div');
      el.className = toArray(cls).map(c => c ? CSS_PREFIX + c : '').join(' ');
      el.append(...toArray(children).filter(Boolean));
      if (props) delete props.tag;
      return Object.assign(el, props);
    }
    const alphaPattern = /^\s*(0+\.?|0*\.\d+|0*1\.?|0*1\.0*)?\s*$/.source;
    const nestedObj = (obj, key) => (obj[key] || (obj[key] = {}));
    const makeNum = (type, channel, props, min, max) =>
      $(['input-field', `${type}-${channel}`], [
        (nestedObj($inputs, type)[channel] =
          $('input', props || {tag: 'input', type: 'number', min, max, step: 1})),
        $('title', channel.toUpperCase()),
      ]);
    const ColorGroup = (type, channels) => (
      $inputGroups[type] = $(['input-group', type], [
        ...Object.entries(channels).map(([k, v]) =>
          makeNum(type, k, null, v[0], v[1])),
        makeNum(type, 'a',
          {tag: 'input', type: 'text', pattern: alphaPattern, spellcheck: false}),
      ])
    );
    $root = $('popup', {
      oninput: setFromInputs,
      onkeydown: setFromKeyboard,
    }, [
      $sat = $('saturation-container', {
        onmousedown: onSaturationMouseDown,
        onmouseup: onSaturationMouseUp,
      }, [
        $('saturation', [
          $('value', [
            $satPointer = $('drag-pointer'),
          ]),
        ]),
      ]),
      $('popup-mover', {onmousedown: onPopupMoveStart}),
      $('sliders', [
        $('hue', {onmousedown: onHueMouseDown}, [
          $hue = $('hue-container', [
            $hueKnob = $('hue-knob', {onmousedown: onHueKnobMouseDown}),
          ]),
        ]),
        $('opacity', [
          $opacity = $('opacity-container', {onmousedown: onOpacityMouseDown}, [
            $opacityBar = $('opacity-bar'),
            $opacityKnob = $('opacity-knob', {onmousedown: onOpacityKnobMouseDown}),
          ]),
        ]),
        $('empty'),
        $swatch = $('swatch'),
      ]),
      $(['input-container', 'hex'], [
        $inputGroups.hex = $(['input-group', 'hex'], [
          $(['input-field', 'hex'], [
            $hexCode = $('input', {tag: 'input', type: 'text', spellcheck: false,
              pattern: /^\s*#([a-fA-F\d]{3}([a-fA-F\d]([a-fA-F\d]{2}([a-fA-F\d]{2})?)?)?)\s*$/.source,
            }),
            $('title', [
              $hexLettercase.true = $('title-action', {onclick: onHexLettercaseClicked}, 'HEX'),
              '\xA0/\xA0',
              $hexLettercase.false = $('title-action', {onclick: onHexLettercaseClicked}, 'hex'),
            ]),
          ]),
        ]),
        ColorGroup('rgb', {r: [0, 255], g: [0, 255], b: [0, 255]}),
        ColorGroup('hsl', {h: [], s: [0, 100], l: [0, 100]}),
        ColorGroup('hwb', {h: [], w: [0, 100], b: [0, 100]}),
        $('format-change', [
          $formatChangeButton = $('format-change-button', {onclick: setFromFormatElement}, '↔'),
        ]),
        window.EyeDropper &&
        $('dropper', {
          tag: 'img',
          // TODO: bind this to the actual source path via webpack
          srcset: 'icon/eyedropper/16px.png, icon/eyedropper/32px.png 2x',
          async onclick() {
            try {
              const c = await new window.EyeDropper().open();
              userActivity = true;
              setFromColor(c.sRGBHex);
              colorpickerCallback();
            } catch {}
          },
        }),
      ]),
      $palette = $('palette', {
        onclick: onPaletteClicked,
        oncontextmenu: onPaletteClicked,
      }),
    ]);

    const inputsToObj = type => {
      const res = {type};
      for (const [k, el] of Object.entries($inputs[type])) {
        res[k] = parseFloat(el.value);
      }
      return res;
    };
    for (const [key, val] of Object.entries($inputs)) {
      Object.defineProperty(val, 'color', {
        get: inputsToObj.bind(null, key),
      });
    }
    Object.defineProperty($inputs.hex = [$hexCode], 'color', {
      get: () => $hexCode.value.trim(),
    });
    Object.defineProperty($inputs, 'color', {
      get: () => $inputs[currentFormat].color,
    });
    Object.defineProperty($inputs, 'colorString', {
      get: () => currentFormat &&
        colorConverter.format($inputs[currentFormat].color, undefined, {round: true}),
    });

    HUE_COLORS.forEach(color => Object.assign(color, colorConverter.parse(color.hex)));
    $root.style.setProperty('--margin', MARGIN + 'px');
    initialized = true;
  }

  //endregion
  //region Public API

  function show(opt) {
    if (!initialized) {
      init();
    }
    HSV = {};
    currentFormat = '';
    options = PUBLIC_API.options = opt;
    if (opt.round !== false) opt.round = true;
    prevFocusedElement = document.activeElement;
    userActivity = false;
    lastOutputColor = opt.color || '';
    $formatChangeButton.title = opt.tooltipForSwitcher || '';
    maxHeight = `${opt.maxHeight || 300}px`;

    $root.className = [...$root.classList]
      .filter(c => !c.startsWith(`${CSS_PREFIX}theme-`))
      .concat(CSS_PREFIX + 'theme-' +
        (opt.theme === 'dark' || opt.theme === 'light' ? opt.theme : guessTheme()))
      .join(' ');

    document.body.appendChild($root);
    shown = true;

    registerEvents();
    setFromColor(opt.color);
    setFromHexLettercaseElement();
    if (Array.isArray(options.palette)) {
      renderPalette();
    }
    if (opt.left || opt.top || opt.right || opt.bottom) {
      reposition();
    }
  }

  function hide() {
    if (shown) {
      colorpickerCallback('');
      unregisterEvents();
      focusNoScroll(prevFocusedElement);
      $root.remove();
      shown = false;
    }
  }

  function setColor(color) {
    if (typeof color === 'string') {
      color = colorConverter.parse(color);
    } else if (typeof color === 'object' && color && !color.type) {
      color = Object.assign({}, color, {type: colorConverter.guessType(color)});
    }
    if (!color || !color.type) {
      return false;
    }
    if (!initialized) {
      init();
    }
    setFromColor(color);
    return true;
  }

  function getColor(type) {
    if (!initialized) {
      return;
    }
    readCurrentColorFromRamps();
    const color = colorConverter.fromHSV(HSV, type);
    return type ? colorToString(color, type) : color;
  }

  //endregion
  //region DOM-to-state

  function readCurrentColorFromRamps() {
    if ($sat.offsetWidth === 0) {
      HSV.h = HSV.s = HSV.v = 0;
    } else {
      const {x, y} = dragging.saturationPointerPos;
      HSV.h = colorConverter.snapToInt((dragging.hueKnobPos / $hue.offsetWidth) * 360);
      HSV.s = x / $sat.offsetWidth;
      HSV.v = ($sat.offsetHeight - y) / $sat.offsetHeight;
    }
  }

  function setFromSaturationElement(event) {
    event.preventDefault();
    const w = $sat.offsetWidth;
    const h = $sat.offsetHeight;
    const bb = $root.getBoundingClientRect();
    const deltaX = event.clientX - bb.left;
    const deltaY = event.clientY - bb.top;
    const x = dragging.saturationPointerPos.x = constrain(0, w, deltaX);
    const y = dragging.saturationPointerPos.y = constrain(0, h, deltaY);

    $satPointer.style.left = `${x - 5}px`;
    $satPointer.style.top = `${y - 5}px`;

    readCurrentColorFromRamps();
    renderInputs();
  }

  function setFromHueElement(event) {
    const {left, width} = getScreenBounds($hue);
    const currentX = event ? getTouchPosition(event).clientX :
      left + width * colorConverter.constrainHue(HSV.h) / 360;
    const normalizedH = constrain(0, 1, (currentX - left) / width);
    const x = dragging.hueKnobPos = width * normalizedH;
    $hueKnob.style.left = (x - Math.round($hueKnob.offsetWidth / 2)) + 'px';
    $sat.style.backgroundColor = hueDistanceToColorString(normalizedH);
    HSV.h = event ? Math.round(normalizedH * 360) : HSV.h;
    renderInputs();
  }

  function setFromOpacityElement(event) {
    const {left, width} = getScreenBounds($opacity);
    const normalized = constrain(0, 1, (getTouchPosition(event).clientX - left) / width);
    const x = width * normalized;
    $opacityKnob.style.left = (x - Math.ceil($opacityKnob.offsetWidth / 2)) + 'px';
    HSV.a = Math.round(normalized * 100) / 100;
    renderInputs();
  }

  function setFromFormatElement({shiftKey}) {
    userActivity = true;
    HSV.a = isNaN(HSV.a) ? 1 : HSV.a;
    const formats = Object.keys($inputGroups);
    const dir = shiftKey ? -1 : 1;
    const total = formats.length;
    if ($inputs.colorString === $inputs.prevColorString) {
      Object.assign(HSV, prevHSV);
    }
    switchInputGroup(formats[(formats.indexOf(currentFormat) + dir + total) % total]);
    renderInputs();
  }

  function setFromHexLettercaseElement() {
    const isUpper = Boolean(options.hexUppercase);
    $hexLettercase[isUpper].dataset.active = '';
    delete $hexLettercase[!isUpper].dataset.active;
    const value = $hexCode.value;
    $hexCode.value = isUpper ? value.toUpperCase() : value.toLowerCase();
    setFromInputs();
  }

  function setFromInputs(event) {
    if (event) userActivity = true;
    if (Object.values($inputs[currentFormat]).every(validateInput)) {
      setFromColor($inputs.color);
    }
  }

  function setFromKeyboard(event) {
    const {key, ctrlKey: ctrl, altKey: alt, shiftKey: shift, metaKey: meta} = event;
    switch (key) {
      case 'Tab':
      case 'PageUp':
      case 'PageDown':
        if (!ctrl && !alt && !meta) {
          const el = document.activeElement;
          const inputs = Object.values($inputs[currentFormat]);
          const lastInput = inputs[inputs.length - 1];
          if (key === 'Tab' && shift && el === inputs[0]) {
            maybeFocus(lastInput);
          } else if (key === 'Tab' && !shift && el === lastInput) {
            maybeFocus(inputs[0]);
          } else if (key !== 'Tab' && !shift) {
            setFromFormatElement({shift: key === 'PageUp' || shift});
          } else {
            return;
          }
          event.preventDefault();
        }
        return;
      case 'ArrowUp':
      case 'ArrowDown':
        if (!event.metaKey &&
            document.activeElement.localName === 'input' &&
            document.activeElement.checkValidity()) {
          setFromKeyboardIncrement(event);
        }
        return;
    }
  }

  function setFromKeyboardIncrement(event) {
    const el = document.activeElement;
    const {key, ctrlKey: ctrl, altKey: alt, shiftKey: shift} = event;
    const dir = key === 'ArrowUp' ? 1 : -1;
    let value, newValue;
    if (currentFormat === 'hex') {
      value = el.value.trim();
      const isShort = value.length <= 5;
      const [r, g, b, a = ''] = el.value.match(isShort ? /[\da-f]/gi : /[\da-f]{2}/gi);
      let ceiling, data;
      if (!ctrl && !shift && !alt) {
        ceiling = isShort ? 0xFFF : 0xFFFFFF;
        data = [[true, r + g + b]];
      } else {
        ceiling = isShort ? 15 : 255;
        data = [[ctrl, r], [shift, g], [alt, b]];
      }
      newValue = '#' + data.map(([affected, part]) => {
        part = constrain(0, ceiling, parseInt(part, 16) + dir * (affected ? 1 : 0));
        return (part + ceiling + 1).toString(16).slice(1);
      }).join('') + a;
      newValue = options.hexUppercase ? newValue.toUpperCase() : newValue.toLowerCase();
    } else if (!alt) {
      value = parseFloat(el.value);
      const isHue = el.title === 'H';
      const isAlpha = el === $inputs[currentFormat].a;
      const isRGB = currentFormat === 'rgb';
      const min = isHue ? -360 : 0;
      const max = isHue ? 360 : isAlpha ? 1 : isRGB ? 255 : 100;
      const scale = isAlpha ? .01 : 1;
      const delta =
        shift && !ctrl ? 10 :
        ctrl && !shift ? (isHue || isRGB ? 100 : 50) :
        1;
      newValue = constrain(min, max, value + delta * scale * dir);
      newValue = isAlpha ? alphaToString(newValue) : newValue;
    }
    event.preventDefault();
    userActivity = true;
    if (newValue !== undefined && newValue !== value) {
      el.value = newValue;
      setFromColor($inputs.color);
    }
  }

  function validateInput(el) {
    const isAlpha = el === $inputs[currentFormat].a;
    let isValid = (isAlpha || el.value.trim()) && el.checkValidity();
    if (!isAlpha && !isValid && currentFormat === 'rgb') {
      isValid = parseAs(el, parseInt);
    } else if (isAlpha && !isValid) {
      isValid = parseAs(el, parseFloat);
    }
    if (isAlpha && isValid) {
      isValid = lastOutputColor !== colorToString($inputs.color);
    }
    return isValid;
  }
  //endregion
  //region State-to-DOM

  function setFromColor(color) {
    color = typeof color === 'string' ? colorConverter.parse(color) : color;
    color = color || colorConverter.parse('#f00');
    const newHSV = colorConverter.toHSV(color);
    if (Object.entries(newHSV).every(([k, v]) => v === HSV[k] || Math.abs(v - HSV[k]) < 1e-3)) {
      return;
    }
    HSV = newHSV;
    renderKnobs(color);
    switchInputGroup(color.type);
    setFromHueElement();
  }

  function switchInputGroup(format) {
    if (currentFormat === format) {
      return;
    }
    if (currentFormat) {
      delete $inputGroups[currentFormat].dataset.active;
    } else {
      for (const fmt in $inputGroups) {
        delete $inputGroups[fmt].dataset.active;
      }
    }
    $inputGroups[format].dataset.active = '';
    maybeFocus(Object.values($inputs[format])[0]);
    currentFormat = format;
  }

  function renderKnobs(color) {
    const x = $sat.offsetWidth * HSV.s;
    const y = $sat.offsetHeight * (1 - HSV.v);
    $satPointer.style.left = (x - 5) + 'px';
    $satPointer.style.top = (y - 5) + 'px';
    dragging.saturationPointerPos = {x, y};

    const hueX = $hue.offsetWidth * constrain(0, 1, HSV.h / 360);
    $hueKnob.style.left = (hueX - 7.5) + 'px';
    dragging.hueKnobPos = hueX;

    const opacityX = $opacity.offsetWidth * (isNaN(HSV.a) ? 1 : HSV.a);
    $opacityKnob.style.left = (opacityX - 7.5) + 'px';

    $sat.style.backgroundColor = color;
  }

  function renderInputs() {
    const rgb = colorConverter.fromHSV(HSV, 'rgb');
    if (currentFormat === 'hex') {
      $hexCode.value = colorToString(rgb, 'hex');
    } else {
      for (const [k, v] of Object.entries(colorConverter.fromHSV(HSV, currentFormat))) {
        const el = $inputs[currentFormat][k];
        if (el) el.value = k === 'a' ? alphaToString() || 1 : Math.round(v);
      }
    }
    $swatch.style.backgroundColor = colorToString(rgb, 'rgb');
    $opacityBar.style.background = 'linear-gradient(to right,' +
      colorToString(Object.assign(rgb, {a: 0}), 'rgb') + ',' +
      colorToString(Object.assign(rgb, {a: 1}), 'rgb') + ')';

    colorpickerCallback();

    const colorString = $inputs.colorString;
    if ($inputs.prevColorString === colorString) {
      // keep the internal HSV calculated initially for this color format
      Object.assign(HSV, prevHSV);
    } else {
      // remember the internal HSV
      $inputs.prevColorString = colorString;
      Object.assign(prevHSV, HSV);
    }
  }

  //endregion
  //region Event listeners

  /** @param {MouseEvent} event */
  function onPopupMoveStart(event) {
    if (!event.button && !hasModifiers(event)) {
      captureMouse(event, 'popup');
      $root.dataset.moving = '';
      const [x, y] = ($root.style.transform.match(/[-.\d]+/g) || []).map(parseFloat);
      dragging.popupX = event.clientX - (x || 0);
      dragging.popupY = event.clientY - (y || 0);
      document.addEventListener('mouseup', onPopupMoveEnd);
    }
  }

  /** @param {MouseEvent} event */
  function onPopupMove({clientX: x, clientY: y}) {
    $root.style.transform = `translate(${x - dragging.popupX}px, ${y - dragging.popupY}px)`;
  }

  /** @param {MouseEvent} event */
  function onPopupMoveEnd(event) {
    if (!event.button) {
      document.addEventListener('mouseup', onPopupMoveEnd);
      delete $root.dataset.moving;
    }
  }

  /** @param {MouseEvent} event */
  function onPopupResizeStart(event) {
    if (event.target === $root && !event.button && !hasModifiers(event)) {
      document.addEventListener('mouseup', onPopupResizeEnd);
      $root.dataset.resizing = '';
    }
  }

  /** @param {MouseEvent} event */
  function onPopupResizeEnd(event) {
    if (!event.button) {
      delete $root.dataset.resizing;
      document.removeEventListener('mouseup', onPopupResizeEnd);
      if (maxHeight !== $root.style.height) {
        maxHeight = $root.style.height;
        PUBLIC_API.options.maxHeight = parseFloat(maxHeight);
        fitPaletteHeight();
      }
    }
  }

  function onHexLettercaseClicked() {
    options.hexUppercase = !options.hexUppercase;
    setFromHexLettercaseElement();
  }

  function onSaturationMouseDown(event) {
    if (captureMouse(event, 'saturation')) {
      setFromSaturationElement(event);
    }
  }

  function onSaturationMouseUp(event) {
    releaseMouse(event, 'saturation');
  }

  function onHueKnobMouseDown(event) {
    captureMouse(event, 'hue');
  }

  function onOpacityKnobMouseDown(event) {
    captureMouse(event, 'opacity');
  }

  function onHueMouseDown(event) {
    if (captureMouse(event, 'hue')) {
      setFromHueElement(event);
    }
  }

  function onOpacityMouseDown(event) {
    if (captureMouse(event, 'opacity')) {
      setFromOpacityElement(event);
    }
  }

  /** @param {MouseEvent} e */
  function onPaletteClicked(e) {
    if (e.target !== e.currentTarget && e.target.__color) {
      if (!e.button && setColor(e.target.__color)) {
        userActivity = true;
        colorpickerCallback();
      } else if (e.button && options.paletteCallback) {
        e.preventDefault(); // suppress the default context menu
        options.paletteCallback(e.target);
      }
    }
  }

  function onMouseUp(event) {
    releaseMouse(event, ['saturation', 'hue', 'opacity', 'popup']);
    if (onMouseDown.outsideClick) {
      if (!prevFocusedElement) hide();
    }
  }

  function onMouseDown(event) {
    onMouseDown.outsideClick = !event.button && !event.target.closest('.colorpicker-popup');
    if (onMouseDown.outsideClick) {
      prevFocusedElement = null;
      captureMouse(event);
    }
  }

  function onMouseMove(event) {
    if (event.button) return;
    if (dragging.saturation) setFromSaturationElement(event);
    if (dragging.hue) setFromHueElement(event);
    if (dragging.opacity) setFromOpacityElement(event);
    if (dragging.popup) onPopupMove(event);
  }

  function onKeyDown(e) {
    if (!hasModifiers(e)) {
      switch (e.key) {
        case 'Enter':
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          hide();
          break;
      }
    }
  }

  function onCloseRequest(event) {
    if (event.detail !== PUBLIC_API) {
      hide();
    } else if (!prevFocusedElement && cm) {
      // we're between mousedown and mouseup and colorview wants to re-open us in this cm
      // so we'll prevent onMouseUp from hiding us to avoid flicker
      prevFocusedElement = cm.display.input;
    }
  }

  //endregion
  //region Event utilities

  function colorpickerCallback(colorString = currentColorToString()) {
    const isCallable = typeof options.callback === 'function';
    // hiding
    if (!colorString && isCallable) {
      options.callback('');
      return;
    }
    if (
      userActivity &&
      Object.values($inputs[currentFormat]).every(el => el.checkValidity())
    ) {
      lastOutputColor = colorString.replace(/\b0\./g, '.');
      if (isCallable) {
        options.callback(lastOutputColor);
      }
    }
  }

  function captureMouse({button}, mode) {
    if (button !== 0) {
      return;
    }
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
    if (!mode) {
      return;
    }
    for (const m of toArray(mode)) {
      dragging[m] = true;
    }
    userActivity = true;
    return true;
  }

  function hasModifiers(e) {
    return e.shiftKey || e.ctrlKey || e.altKey || e.metaKey;
  }

  function releaseMouse(event, mode) {
    if (event && event.button !== 0) {
      return;
    }
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('mousemove', onMouseMove);
    if (!mode) {
      return;
    }
    for (const m of toArray(mode)) {
      dragging[m] = false;
    }
    userActivity = true;
    return true;
  }

  function getTouchPosition(event) {
    return event.touches && event.touches[0] || event;
  }

  function registerEvents() {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('close-colorpicker-popup', onCloseRequest, true);
  }

  function unregisterEvents() {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('close-colorpicker-popup', onCloseRequest, true);
    releaseMouse();
  }

  //endregion
  //region Color conversion utilities

  function colorToString(color, type = currentFormat) {
    return colorConverter.format(color, type, options);
  }

  function alphaToString(a = HSV.a) {
    return colorConverter.formatAlpha(a);
  }

  function currentColorToString(format = currentFormat, alpha = HSV.a) {
    const converted = colorConverter.fromHSV(HSV, format);
    converted.a = isNaN(alpha) || alpha === 1 ? undefined : alpha;
    return colorToString(converted, format);
  }

  function mixColorToString(start, end, amount) {
    const obj = {
      r: start.r + (end.r - start.r) * amount,
      g: start.g + (end.g - start.g) * amount,
      b: start.b + (end.b - start.b) * amount,
      a: 1,
    };
    return colorToString(obj, 'hex');
  }

  function hueDistanceToColorString(hueRatio) {
    let prevColor;
    for (const color of HUE_COLORS) {
      if (prevColor && color.start >= hueRatio) {
        return mixColorToString(prevColor, color,
          (hueRatio - prevColor.start) / (color.start - prevColor.start));
      }
      prevColor = color;
    }
    return HUE_COLORS[0].hex;
  }

  //endregion
  //region Miscellaneous utilities

  function reposition() {
    const {offsetWidth: W, offsetHeight: H} = $root;
    const {top: T, left: L, right: R, bottom: B} = options;
    const maxX = innerWidth - W;
    const maxY = innerHeight - H;
    const s = $root.style;
    if (!isNaN(L)) {
      s.left = constrain(0, Math.max(0, L <= maxX ? maxX : L - W), L) + 'px';
    } else if (!isNaN(R)) {
      s.right = constrain(0, Math.max(0, R <= maxX ? maxX : R - W), R) + 'px';
    }
    if (!isNaN(T)) {
      s.top = constrain(0, Math.max(0, T <= maxY ? maxY : T - H - 20), T) + 'px';
    } else if (!isNaN(B)) {
      s.bottom = constrain(0, Math.max(0, B <= maxY ? maxY : B - H - 20), B) + 'px';
    }
    s.transform = '';
  }

  function renderPalette() {
    // Might need to clear a lot of elements so this is known to be faster than textContent = ''
    while ($palette.firstChild) $palette.firstChild.remove();
    $palette.append(...options.palette);
    if (options.palette.length) {
      $root.dataset.resizable = '';
      $root.addEventListener('mousedown', onPopupResizeStart);
      fitPaletteHeight();
    } else {
      delete $root.dataset.resizable;
      $root.removeEventListener('mousedown', onPopupResizeStart);
    }
  }

  function fitPaletteHeight() {
    const fit = MIN_HEIGHT + $palette.scrollHeight + MARGIN;
    $root.style.setProperty('--fit-height', Math.min(fit, parseFloat(maxHeight)) + 'px');
  }

  function maybeFocus(el) {
    if (allowInputFocus) {
      el.focus();
    }
  }

  function focusNoScroll(el) {
    if (el) {
      const {scrollY: y, scrollX: x} = window;
      el.focus({preventScroll: true});
      el = null;
      if (window.scrollY !== y || window.scrollX !== x) {
        setTimeout(window.scrollTo, 0, x, y);
      }
    }
  }

  function getScreenBounds(el) {
    const bounds = el.getBoundingClientRect();
    const {scrollTop, scrollLeft} = document.scrollingElement;
    return {
      top: bounds.top + scrollTop,
      left: bounds.left + scrollLeft,
      width: bounds.width,
      height: bounds.height,
    };
  }

  function guessTheme() {
    const el = options.guessBrightness ||
      cm && ((cm.display.renderedView || [])[0] || {}).text ||
      cm && cm.display.lineDiv;
    const bgLuma = colorMimicry(el, {bg: 'backgroundColor'}).bgLuma;
    return bgLuma < .5 ? 'dark' : 'light';
  }

  function parseAs(el, parser) {
    const num = parser(el.value);
    if (!isNaN(num) &&
        (!el.min || num >= parseFloat(el.min)) &&
        (!el.max || num <= parseFloat(el.max))) {
      el.value = num;
      return true;
    }
  }

  function toArray(val) {
    return !val ? [] : Array.isArray(val) ? val : [val];
  }

  //endregion
}
