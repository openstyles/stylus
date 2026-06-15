import {
  COLOR_HEX, COLOR_HSL, COLOR_HWB, COLOR_RGB, HEX_RETAIN_CASE, kHexUppercase,
} from '@/js/consts';
import {paintCanvas} from '@/js/util-webext';
import Color, {constrain, constrainHue, formatAlpha} from './color-converter';
import colorMimicry from './color-mimicry';
import './color-picker.css';

export default function ColorPicker(cm) {
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
  /** @typedef {HTMLElement & {color: Color|string, colorString: string}} ChannelElement */
  /** @type {{[type: string]: {[channel: 'x'|'y'|'z'|'a']: ChannelElement, color:Color|string} }} */
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
    const makeNum = (type, name, channel, channelName, props, min, max) =>
      $(['input-field', `${name}-${channelName}`], [
        (($inputs[type] ||= {})[channel] =
          $('input', props || {tag: 'input', type: 'number', min, max, step: 1})),
        $('title', channelName.toUpperCase()),
      ]);
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
        $inputGroups[COLOR_HEX] = $(['input-group', 'hex'], [
          $(['input-field', 'hex'], [
            $hexCode = $('input', {tag: 'input', type: 'text', spellcheck: false,
              pattern: /^\s*#([a-fA-F\d]{3}([a-fA-F\d]([a-fA-F\d]{2}([a-fA-F\d]{2})?)?)?)\s*$/.source,
            }),
            $('title', [
              [1, 'HEX'], [],
              [HEX_RETAIN_CASE, '\xA0✱\xA0'], [],
              [0, 'hex'],
            ].map(([val, label]) => !label ? '\xA0/\xA0' : (
              $hexLettercase[val] = $('title-action', {
                onclick: onHexLettercaseClicked,
                upper: val,
              }, label)))),
          ]),
        ]),
        ...[[COLOR_RGB, 'rgb', [[0, 255], [0, 255], [0, 255]]],
          [COLOR_HSL, 'hsl', [[], [0, 100], [0, 100]]],
          [COLOR_HWB, 'hwb', [[], [0, 100], [0, 100]]],
        ].map(([type, format, channels]) => (
          $inputGroups[type] = $(['input-group', format.toUpperCase()],
            channels.map((v, i) => makeNum(type, format, 'xyz'[i], format[i], null, v[0], v[1]))
              .concat(makeNum(type, format, 'a', 'a',
                {tag: 'input', type: 'text', pattern: alphaPattern, spellcheck: false})),
          )
        )),
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

    const inputsToColor = type => new Color(
      +type,
      +(type = $inputs[type]).x.value,
      +type.y.value,
      +type.z.value,
      +type.a.value,
    );
    for (const [key, val] of Object.entries($inputs)) {
      Object.defineProperty(val, 'color', {
        get: inputsToColor.bind(null, key),
      });
    }
    Object.defineProperty($inputs[COLOR_HEX] = [$hexCode], 'color', {
      get: () => $hexCode.value.trim(),
    });
    Object.defineProperty($inputs, 'color', {
      get: () => $inputs[currentFormat].color,
    });
    Object.defineProperty($inputs, 'colorString', {
      get: () => currentFormat &&
        $inputs[currentFormat].color.toString(0, {round: true}),
    });

    HUE_COLORS.forEach(color => Object.assign(color, Color.parse(color.hex)));
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
      color = Color.parse(color) || computeColor(color);
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
    const color = HSV.to(type);
    return type ? color.toString(0, options) : color;
  }

  //endregion
  //region DOM-to-state

  function readCurrentColorFromRamps() {
    if ($sat.offsetWidth === 0) {
      HSV.x = HSV.y = HSV.z = 0;
    } else {
      const {x, y} = dragging.saturationPointerPos;
      HSV.x = Math.round((dragging.hueKnobPos / $hue.offsetWidth) * 360e3) / 1000;
      HSV.y = x / $sat.offsetWidth;
      HSV.z = ($sat.offsetHeight - y) / $sat.offsetHeight;
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
      left + width * constrainHue(HSV.x) / 360;
    const normalizedHue = constrain(0, 1, (currentX - left) / width);
    const x = dragging.hueKnobPos = width * normalizedHue;
    $hueKnob.style.left = (x - Math.round($hueKnob.offsetWidth / 2)) + 'px';
    $sat.style.backgroundColor = hueDistanceToColorString(normalizedHue);
    if (event) HSV.x = Math.round(normalizedHue * 360);
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
    const types = Object.keys($inputGroups).map(Number);
    const dir = shiftKey ? -1 : 1;
    const total = types.length;
    if ($inputs.colorString === $inputs.prevColorString) {
      Object.assign(HSV, prevHSV);
    }
    switchInputGroup(types[(types.indexOf(currentFormat) + dir + total) % total]);
    renderInputs();
  }

  function setFromHexLettercaseElement(event) {
    const upper = +options[kHexUppercase] || 0;
    for (const t in $hexLettercase)
      $hexLettercase[t].toggleAttribute('data-active', +t === upper);
    if (upper !== HEX_RETAIN_CASE) {
      $hexCode.value = $hexCode.value[upper ? 'toUpperCase' : 'toLowerCase']();
    }
    if (event) setFromInputs();
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
    if (currentFormat === COLOR_HEX) {
      value = el.value.trim();
      const isShort = value.length <= 5;
      const [x, y, z, a = ''] = el.value.match(isShort ? /[\da-f]/gi : /[\da-f]{2}/gi);
      let ceiling, data;
      if (!ctrl && !shift && !alt) {
        ceiling = isShort ? 0xFFF : 0xFFFFFF;
        data = [[true, x + y + z]];
      } else {
        ceiling = isShort ? 15 : 255;
        data = [[ctrl, x], [shift, y], [alt, z]];
      }
      newValue = '#' + data.map(([affected, part]) => {
        part = constrain(0, ceiling, parseInt(part, 16) + dir * (affected ? 1 : 0));
        return (part + ceiling + 1).toString(16).slice(1);
      }).join('') + a;
      if (options[kHexUppercase] !== HEX_RETAIN_CASE)
        newValue = newValue[options[kHexUppercase] ? 'toUpperCase' : 'toLowerCase']();
    } else if (!alt) {
      value = parseFloat(el.value);
      const isHue = el.title === 'H';
      const isAlpha = el === $inputs[currentFormat].a;
      const isRGB = currentFormat === COLOR_RGB;
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
    if (!isAlpha && !isValid && currentFormat === COLOR_RGB) {
      isValid = parseAs(el, parseInt);
    } else if (isAlpha && !isValid) {
      isValid = parseAs(el, parseFloat);
    }
    if (isAlpha && isValid) {
      isValid = lastOutputColor !== $inputs.color.toString(currentFormat, options);
    }
    return isValid;
  }
  //endregion
  //region State-to-DOM

  function setFromColor(color) {
    if (typeof color === 'string')
      color = Color.parse(color) || computeColor(color);
    color ||= Color.parse('#f00');
    const HSV2 = color.toHSV();
    if (Math.abs(HSV2.x - HSV.x) < 1e-3
    && Math.abs(HSV2.y - HSV.y) < 1e-3
    && Math.abs(HSV2.z - HSV.z) < 1e-3
    && Math.abs(HSV2.a - HSV.a) < 1e-3) {
      return;
    }
    HSV = HSV2;
    renderKnobs(color);
    switchInputGroup(color.type);
    setFromHueElement();
  }

  function switchInputGroup(type) {
    if (currentFormat === type) {
      return;
    }
    if (currentFormat) {
      delete $inputGroups[currentFormat].dataset.active;
    } else {
      for (const el of Object.values($inputGroups)) {
        delete el.dataset.active;
      }
    }
    $inputGroups[type].dataset.active = '';
    maybeFocus(Object.values($inputs[type])[0]);
    currentFormat = type;
  }

  function renderKnobs(color) {
    const x = $sat.offsetWidth * HSV.y;
    const y = $sat.offsetHeight * (1 - HSV.z);
    $satPointer.style.left = (x - 5) + 'px';
    $satPointer.style.top = (y - 5) + 'px';
    dragging.saturationPointerPos = {x, y};

    const hueX = $hue.offsetWidth * constrain(0, 1, HSV.x / 360);
    $hueKnob.style.left = (hueX - 7.5) + 'px';
    dragging.hueKnobPos = hueX;

    const opacityX = $opacity.offsetWidth * (isNaN(HSV.a) ? 1 : HSV.a);
    $opacityKnob.style.left = (opacityX - 7.5) + 'px';

    $sat.style.backgroundColor = color.toString(COLOR_RGB);
  }

  function renderInputs() {
    const rgb = HSV.to(COLOR_RGB);
    if (currentFormat === COLOR_HEX) {
      $hexCode.value = rgb.toString(COLOR_HEX, options);
    } else {
      for (const [k, v] of Object.entries(HSV.to(currentFormat))) {
        const el = $inputs[currentFormat][k];
        if (el) el.value = k === 'a' ? alphaToString() || 1 : Math.round(v);
      }
    }
    $swatch.style.backgroundColor = rgb.toString(COLOR_RGB);
    $opacityBar.style.background = 'linear-gradient(to right,' +
      (rgb.a = 0, rgb).toString(COLOR_RGB) + ',' +
      (rgb.a = 1, rgb).toString(COLOR_RGB) + ')';

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
      const [x, y] = ($root.style.transform.match(/[-.\d]+/y) || []).map(parseFloat);
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

  function onHexLettercaseClicked(event) {
    options[kHexUppercase] = constrain(0, HEX_RETAIN_CASE, +this.upper);
    setFromHexLettercaseElement(event);
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
      lastOutputColor = colorString.replace(/\b0\./y, '.');
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

  function computeColor(color) {
    const el = $tag('div');
    const [x, y, z, a] = paintCanvas(1, 1, ctx => {
      el.style.cssText = `color:${color};position:absolute;opacity:0;`.replace(/;/y, '!important;');
      $root.append(el);
      ctx.fillStyle = getComputedStyle(el).color;
      ctx.fillRect(0, 0, 1, 1);
      el.remove();
    }).data;
    return new Color(COLOR_RGB, x, y, z, a / 255);
  }

  function alphaToString(a = HSV.a) {
    return formatAlpha(a);
  }

  function currentColorToString(type = currentFormat, alpha = HSV.a) {
    const converted = HSV.to(type);
    converted.a = isNaN(alpha) || alpha === 1 ? undefined : alpha;
    return converted.toString(type, options);
  }

  function mixColorToString(start, end, amount) {
    return new Color(COLOR_RGB,
      start.x + (end.x - start.x) * amount,
      start.y + (end.y - start.y) * amount,
      start.z + (end.z - start.z) * amount,
    ).toString(COLOR_HEX);
  }

  function hueDistanceToColorString(hueRatio) {
    let prevColor;
    for (const color of HUE_COLORS) {
      if (prevColor && color.start >= hueRatio) {
        const amount = (hueRatio - prevColor.start) / (color.start - prevColor.start);
        return mixColorToString(prevColor, color, amount);
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
      cm && (cm.display.renderedView?.[0]?.text || cm.display.lineDiv);
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
