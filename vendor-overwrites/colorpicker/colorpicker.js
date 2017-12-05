/* global CodeMirror */
'use strict';

(window.CodeMirror ? window.CodeMirror.prototype : window).colorpicker = function () {
  const cm = this;
  const CSS_PREFIX = 'colorpicker-';
  const HUE_COLORS = [
    {hex: '#ff0000', start: .0},
    {hex: '#ffff00', start: .17},
    {hex: '#00ff00', start: .33},
    {hex: '#00ffff', start: .50},
    {hex: '#0000ff', start: .67},
    {hex: '#ff00ff', start: .83},
    {hex: '#ff0000', start: 1}
  ];

  let HSV = {};
  let currentFormat;

  let initialized = false;
  let shown = false;
  let options = {};

  let $root;
  let $sat, $satPointer;
  let $hue, $hueKnob;
  let $opacity, $opacityBar, $opacityKnob;
  let $swatch;
  let $formatChangeButton;
  let $hexCode;
  const $inputGroups = {};
  const $inputs = {};
  const $rgb = {};
  const $hsl = {};
  const $hexLettercase = {};

  const allowInputFocus = !('ontouchstart' in document) || window.innerHeight > 800;

  const dragging = {
    saturationPointerPos: {x: 0, y: 0},
    hueKnobPos: 0,
    saturation: false,
    hue: false,
    opacity: false,
  };

  let prevFocusedElement;
  let lastOutputColor;
  let userActivity;

  let timerCloseColorPicker;
  let timerFadeColorPicker;

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
    // simplified createElement
    function $(a, b) {
      const cls = typeof a === 'string' || Array.isArray(a) ? a : '';
      const props = b || a;
      const {tag = 'div', children} = props || {};
      const el = document.createElement(tag);
      el.className = (Array.isArray(cls) ? cls : [cls])
        .map(c => (c ? CSS_PREFIX + c : ''))
        .join(' ');
      if (!props) {
        return el;
      }
      for (const child of Array.isArray(children) ? children : [children]) {
        if (child) {
          el.appendChild(child instanceof Node ? child : document.createTextNode(child));
        }
      }
      delete props.tag;
      delete props.children;
      return Object.assign(el, props);
    }
    const alphaPattern = /^\s*(0+\.?|0*\.\d+|0*1\.?|0*1\.0*)?\s*$/.source;
    $root = $('popup', {children: [
      $sat = $('saturation-container', {children: [
        $('saturation', {children: [
          $('value', {children: [
            $satPointer = $('drag-pointer'),
          ]}),
        ]}),
      ]}),
      $('sliders', {children: [
        $('hue', {children: [
          $hue = $('hue-container', {children: [
            $hueKnob = $('hue-knob'),
          ]}),
        ]}),
        $('opacity', {children: [
          $opacity = $('opacity-container', {children: [
            $opacityBar = $('opacity-bar'),
            $opacityKnob = $('opacity-knob'),
          ]}),
        ]}),
        $('empty'),
        $swatch = $('swatch'),
      ]}),
      $(['input-container', 'hex'], {children: [
        $inputGroups.hex = $(['input-group', 'hex'], {children: [
          $(['input-field', 'hex'], {children: [
            $hexCode = $('input', {tag: 'input', type: 'text', spellcheck: false,
              pattern: /^\s*#([a-fA-F\d]{3}([a-fA-F\d]([a-fA-F\d]{2}([a-fA-F\d]{2})?)?)?)\s*$/.source
            }),
            $('title', {children: [
              $hexLettercase.true = $('title-action', {textContent: 'HEX'}),
              '\xA0/\xA0',
              $hexLettercase.false = $('title-action', {textContent: 'hex'}),
            ]}),
          ]}),
        ]}),
        $inputGroups.rgb = $(['input-group', 'rgb'], {children: [
          $(['input-field', 'rgb-r'], {children: [
            $rgb.r = $('input', {tag: 'input', type: 'number', min: 0, max: 255, step: 1}),
            $('title', {textContent: 'R'}),
          ]}),
          $(['input-field', 'rgb-g'], {children: [
            $rgb.g = $('input', {tag: 'input', type: 'number', min: 0, max: 255, step: 1}),
            $('title', {textContent: 'G'}),
          ]}),
          $(['input-field', 'rgb-b'], {children: [
            $rgb.b = $('input', {tag: 'input', type: 'number', min: 0, max: 255, step: 1}),
            $('title', {textContent: 'B'}),
          ]}),
          $(['input-field', 'rgb-a'], {children: [
            $rgb.a = $('input', {tag: 'input', type: 'text', pattern: alphaPattern, spellcheck: false}),
            $('title', {textContent: 'A'}),
          ]}),
        ]}),
        $inputGroups.hsl = $(['input-group', 'hsl'], {children: [
          $(['input-field', 'hsl-h'], {children: [
            $hsl.h = $('input', {tag: 'input', type: 'number', step: 1}),
            $('title', {textContent: 'H'}),
          ]}),
          $(['input-field', 'hsl-s'], {children: [
            $hsl.s = $('input', {tag: 'input', type: 'number', min: 0, max: 100, step: 1}),
            $('title', {textContent: 'S'}),
          ]}),
          $(['input-field', 'hsl-l'], {children: [
            $hsl.l = $('input', {tag: 'input', type: 'number', min: 0, max: 100, step: 1}),
            $('title', {textContent: 'L'}),
          ]}),
          $(['input-field', 'hsl-a'], {children: [
            $hsl.a = $('input', {tag: 'input', type: 'text', pattern: alphaPattern, spellcheck: false}),
            $('title', {textContent: 'A'}),
          ]}),
        ]}),
        $('format-change', {children: [
          $formatChangeButton = $('format-change-button', {textContent: '↔'}),
        ]}),
      ]}),
    ]});

    $inputs.hex = [$hexCode];
    $inputs.rgb = [$rgb.r, $rgb.g, $rgb.b, $rgb.a];
    $inputs.hsl = [$hsl.h, $hsl.s, $hsl.l, $hsl.a];
    const inputsToArray = inputs => inputs.map(el => parseFloat(el.value));
    const inputsToHexString = () => $hexCode.value.trim();
    const inputsToRGB = ([r, g, b, a] = inputsToArray($inputs.rgb)) => ({r, g, b, a, type: 'rgb'});
    const inputsToHSL = ([h, s, l, a] = inputsToArray($inputs.hsl)) => ({h, s, l, a, type: 'hsl'});
    Object.defineProperty($inputs.hex, 'color', {get: inputsToHexString});
    Object.defineProperty($inputs.rgb, 'color', {get: inputsToRGB});
    Object.defineProperty($inputs.hsl, 'color', {get: inputsToHSL});
    Object.defineProperty($inputs, 'color', {get: () => $inputs[currentFormat].color});

    HUE_COLORS.forEach(color => Object.assign(color, stringToColor(color.hex)));

    $root.tabIndex = 0;

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
    prevFocusedElement = document.activeElement;
    userActivity = 0;
    lastOutputColor = opt.color || '';
    $formatChangeButton.title = opt.tooltipForSwitcher || '';
    opt.hideDelay = Math.max(0, opt.hideDelay) || 2000;

    $root.classList.add(CSS_PREFIX + 'theme-' +
      (opt.theme === 'dark' || opt.theme === 'light' ?
        opt.theme :
        guessTheme()));
    document.body.appendChild($root);

    if (!isNaN(options.left) && !isNaN(options.top)) {
      $root.style = `
        display: block;
        position: fixed;
      `.replace(/;/g, '!important;');
      reposition();
    }

    shown = true;

    registerEvents();
    setFromColor(opt.color);
    setFromHexLettercaseElement();
  }

  function hide() {
    if (shown) {
      unregisterEvents();
      focusNoScroll(prevFocusedElement);
      $root.remove();
      shown = false;
    }
  }

  function setColor(color) {
    switch (typeof color) {
      case 'string':
        color = stringToColor(color);
        break;
      case 'object': {
        const {r, g, b, a} = color;
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          color = {r, g, b, a, type: 'rgb'};
          break;
        }
        const {h, s, l} = color;
        if (!isNaN(h) && !isNaN(s) && !isNaN(l)) {
          color = {h, s, l, a, type: 'hsl'};
          break;
        }
      }
      // fallthrough
      default:
        return false;
    }
    if (color) {
      if (!initialized) {
        init();
      }
      setFromColor(color);
    }
    return Boolean(color);
  }

  function getColor(type) {
    if (!initialized) {
      return;
    }
    readCurrentColorFromRamps();
    const color = type === 'hsl' ? HSVtoHSL(HSV) : HSVtoRGB(HSV);
    return type ? colorToString(color, type) : color;
  }

  //endregion
  //region DOM-to-state

  function readCurrentColorFromRamps() {
    if ($sat.offsetWidth === 0) {
      HSV.h = HSV.s = HSV.v = 0;
    } else {
      const {x, y} = dragging.saturationPointerPos;
      HSV.h = snapToInt((dragging.hueKnobPos / $hue.offsetWidth) * 360);
      HSV.s = x / $sat.offsetWidth;
      HSV.v = ($sat.offsetHeight - y) / $sat.offsetHeight;
    }
  }

  function setFromSaturationElement(event) {
    event.preventDefault();
    const w = $sat.offsetWidth;
    const h = $sat.offsetHeight;
    const deltaX = event.clientX - parseFloat($root.style.left);
    const deltaY = event.clientY - parseFloat($root.style.top);
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
      left + width * constrainHue(HSV.h) / 360;
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
    userActivity = performance.now();
    HSV.a = isNaN(HSV.a) ? 1 : HSV.a;
    const formats = ['hex', 'rgb', 'hsl'];
    const dir = shiftKey ? -1 : 1;
    const total = formats.length;
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
    userActivity = event ? performance.now() : userActivity;
    if ($inputs[currentFormat].every(validateInput)) {
      setFromColor($inputs.color);
    }
  }

  function setFromKeyboard(event) {
    const {which, ctrlKey: ctrl, altKey: alt, shiftKey: shift, metaKey: meta} = event;
    switch (which) {
      case 9: // Tab
      case 33: // PgUp
      case 34: // PgDn
        if (!ctrl && !alt && !meta) {
          const el = document.activeElement;
          const inputs = $inputs[currentFormat];
          const lastInput = inputs[inputs.length - 1];
          if (which === 9 && shift && el === inputs[0]) {
            maybeFocus(lastInput);
          } else if (which === 9 && !shift && el === lastInput) {
            maybeFocus(inputs[0]);
          } else if (which !== 9 && !shift) {
            setFromFormatElement({shift: which === 33 || shift});
          } else {
            return;
          }
          event.preventDefault();
        }
        return;
      case 38: // Up
      case 40: // Down
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
    const {which, ctrlKey: ctrl, altKey: alt, shiftKey: shift} = event;
    const dir = which === 38 ? 1 : -1;
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
      const isHue = el === $inputs.hsl[0];
      const isAlpha = el === $inputs[currentFormat][3];
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
    userActivity = performance.now();
    if (newValue !== undefined && newValue !== value) {
      el.value = newValue;
      setFromColor($inputs.color);
    }
  }

  function validateInput(el) {
    const isAlpha = el === $inputs[currentFormat][3];
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
    color = typeof color === 'string' ? stringToColor(color) : color;
    color = color || stringToColor('#f00');
    const newHSV = color.type === 'hsl' ? HSLtoHSV(color) : RGBtoHSV(color);
    if (Object.keys(newHSV).every(k => Math.abs(newHSV[k] - HSV[k]) < 1e-3)) {
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
      for (const format in $inputGroups) {
        delete $inputGroups[format].dataset.active;
      }
    }
    $inputGroups[format].dataset.active = '';
    maybeFocus($inputs[format][0]);
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
    const rgb = HSVtoRGB(HSV);
    switch (currentFormat) {
      case 'hex':
        $hexCode.value = colorToString(rgb, 'hex');
        break;
      case 'rgb': {
        $rgb.r.value = rgb.r;
        $rgb.g.value = rgb.g;
        $rgb.b.value = rgb.b;
        $rgb.a.value = alphaToString() || 1;
        break;
      }
      case 'hsl': {
        const {h, s, l} = HSVtoHSL(HSV);
        $hsl.h.value = h;
        $hsl.s.value = s;
        $hsl.l.value = l;
        $hsl.a.value = alphaToString() || 1;
      }
    }
    $swatch.style.backgroundColor = colorToString(rgb, 'rgb');
    $opacityBar.style.background = 'linear-gradient(to right,' +
      colorToString(Object.assign(rgb, {a: 0}), 'rgb') + ',' +
      colorToString(Object.assign(rgb, {a: 1}), 'rgb') + ')';
    colorpickerCallback();
  }

  //endregion
  //region Event listeners

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

  function onMouseUp(event) {
    if (releaseMouse(event, ['saturation', 'hue', 'opacity']) &&
        !event.target.closest('.codemirror-colorview, .colorpicker-popup, .CodeMirror')) {
      // hide();
    }
  }

  function onMouseMove(event) {
    if (event.button !== 0) {
      return;
    }
    if (dragging.saturation) {
      setFromSaturationElement(event);
    } else if (dragging.hue) {
      setFromHueElement(event);
    } else if (dragging.opacity) {
      setFromOpacityElement(event);
    }
  }

  function stopSnoozing() {
    clearTimeout(timerCloseColorPicker);
    clearTimeout(timerFadeColorPicker);
    if ($root.dataset.fading) {
      delete $root.dataset.fading;
    }
  }

  function snooze() {
    clearTimeout(timerFadeColorPicker);
    timerFadeColorPicker = setTimeout(fade, options.hideDelay / 2);
  }

  function onKeyDown(e) {
    if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      switch (e.which) {
        case 13:
          setFromInputs({});
        // fallthrough to 27
        case 27:
          colorpickerCallback(e.which === 27 ? '' : undefined);
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
    }
  }

  function onClick() {
    setTimeout(() => {
      if (!document.activeElement.closest('.colorpicker-popup')) {
        hide();
      }
    });
  }

  //endregion
  //region Event utilities

  function colorpickerCallback(colorString = currentColorToString()) {
    // Esc pressed?
    if (!colorString) {
      options.callback('');
    }
    if (
      userActivity &&
      $inputs[currentFormat].every(el => el.checkValidity()) &&
      typeof options.callback === 'function'
    ) {
      lastOutputColor = colorString.replace(/\b0\./g, '.');
      options.callback(lastOutputColor);
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
    for (const m of (Array.isArray(mode) ? mode : [mode])) {
      dragging[m] = true;
    }
    userActivity = performance.now();
    return true;
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
    for (const m of (Array.isArray(mode) ? mode : [mode])) {
      dragging[m] = false;
    }
    userActivity = performance.now();
    return true;
  }

  function getTouchPosition(event) {
    return event.touches && event.touches[0] || event;
  }

  function registerEvents() {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('close-colorpicker-popup', onCloseRequest, true);
    window.addEventListener('click', onClick);
    $root.addEventListener('mouseleave', snooze);
    $root.addEventListener('mouseenter', stopSnoozing);
    $root.addEventListener('input', setFromInputs);
    $root.addEventListener('keydown', setFromKeyboard);
    $formatChangeButton.addEventListener('click', setFromFormatElement);
    $sat.addEventListener('mousedown', onSaturationMouseDown);
    $sat.addEventListener('mouseup', onSaturationMouseUp);
    $hueKnob.addEventListener('mousedown', onHueKnobMouseDown);
    $opacityKnob.addEventListener('mousedown', onOpacityKnobMouseDown);
    $hue.addEventListener('mousedown', onHueMouseDown);
    $opacity.addEventListener('mousedown', onOpacityMouseDown);
    $hexLettercase.true.addEventListener('click', onHexLettercaseClicked);
    $hexLettercase.false.addEventListener('click', onHexLettercaseClicked);

    stopSnoozing();
    timerFadeColorPicker = setTimeout(fade, options.hideDelay / 2);
  }

  function unregisterEvents() {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('close-colorpicker-popup', hide, true);
    window.removeEventListener('click', onClick);
    $root.removeEventListener('mouseleave', snooze);
    $root.removeEventListener('mouseenter', stopSnoozing);
    $root.removeEventListener('input', setFromInputs);
    $formatChangeButton.removeEventListener('click', setFromFormatElement);
    $sat.removeEventListener('mousedown', onSaturationMouseDown);
    $sat.removeEventListener('mouseup', onSaturationMouseUp);
    $hueKnob.removeEventListener('mousedown', onHueKnobMouseDown);
    $opacityKnob.removeEventListener('mousedown', onOpacityKnobMouseDown);
    $hue.removeEventListener('mousedown', onHueMouseDown);
    $opacity.removeEventListener('mousedown', onOpacityMouseDown);
    $hexLettercase.true.removeEventListener('click', onHexLettercaseClicked);
    $hexLettercase.false.removeEventListener('click', onHexLettercaseClicked);
    releaseMouse();
    stopSnoozing();
  }

  //endregion
  //region Color conversion utilities

  function colorToString({r, g, b, h, s, l, a}, type = currentFormat) {
    a = alphaToString(a);
    const hasA = Boolean(a);
    switch (type) {
      case 'hex': {
        const rgbStr = (0x1000000 + (r << 16) + (g << 8) + (b | 0)).toString(16).slice(1);
        const aStr = hasA ? (0x100 + Math.round(a * 255)).toString(16).slice(1) : '';
        const hexStr = `#${rgbStr + aStr}`.replace(/^#(.)\1(.)\2(.)\3(?:(.)\4)?$/, '#$1$2$3$4');
        return options.hexUppercase ? hexStr.toUpperCase() : hexStr.toLowerCase();
      }
      case 'rgb':
        return hasA ?
          `rgba(${r}, ${g}, ${b}, ${a})` :
          `rgb(${r}, ${g}, ${b})`;
      case 'hsl':
        return hasA ?
          `hsla(${h}, ${s}%, ${l}%, ${a})` :
          `hsl(${h}, ${s}%, ${l}%)`;
    }
  }

  function stringToColor(str) {
    if (typeof str !== 'string') {
      return;
    }
    str = str.trim();
    if (str.startsWith('rgb')) {
      const [r, g, b, a = 1] = str.replace(/rgba?\(|\)/g, '').split(',').map(parseFloat);
      return {type: 'rgb', r, g, b, a};
    }
    if (str.startsWith('hsl')) {
      const [h, s, l, a = 1] = str.replace(/hsla?\(|\)/g, '').split(',').map(parseFloat);
      return {type: 'hsl', h, s, l, a};
    }
    if (str.startsWith('#')) {
      str = str.slice(1);
      const [r, g, b, a = 255] = str.length <= 4 ?
        str.match(/(.)/g).map(c => parseInt(c + c, 16)) :
        str.match(/(..)/g).map(c => parseInt(c, 16));
      return {type: 'hex', r, g, b, a: a === 255 ? undefined : a / 255};
    }
  }

  function constrainHue(h) {
    return h < 0 ? h % 360 + 360 :
      h > 360 ? h % 360 :
        h;
  }

  function RGBtoHSV({r, g, b, a}) {
    r /= 255;
    g /= 255;
    b /= 255;
    const MaxC = Math.max(r, g, b);
    const MinC = Math.min(r, g, b);
    const DeltaC = MaxC - MinC;

    let h =
      DeltaC === 0 ? 0 :
      MaxC === r ? 60 * (((g - b) / DeltaC) % 6) :
      MaxC === g ? 60 * (((b - r) / DeltaC) + 2) :
      MaxC === b ? 60 * (((r - g) / DeltaC) + 4) :
      0;
    h = constrainHue(h);
    return {
      h,
      s: MaxC === 0 ? 0 : DeltaC / MaxC,
      v: MaxC,
      a,
    };
  }

  function HSVtoRGB({h, s, v}) {
    h = constrainHue(h) % 360;
    const C = s * v;
    const X = C * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - C;
    const [r, g, b] =
      h >= 0 && h < 60 ? [C, X, 0] :
      h >= 60 && h < 120 ? [X, C, 0] :
      h >= 120 && h < 180 ? [0, C, X] :
      h >= 180 && h < 240 ? [0, X, C] :
      h >= 240 && h < 300 ? [X, 0, C] :
      h >= 300 && h < 360 ? [C, 0, X] : [];
    return {
      r: snapToInt(Math.round((r + m) * 255)),
      g: snapToInt(Math.round((g + m) * 255)),
      b: snapToInt(Math.round((b + m) * 255)),
    };
  }

  function HSLtoHSV({h, s, l, a}) {
    const t = s * (l < 50 ? l : 100 - l) / 100;
    return {
      h: constrainHue(h),
      s: t + l ? 200 * t / (t + l) / 100 : 0,
      v: (t + l) / 100,
      a,
    };
  }

  function HSVtoHSL({h, s, v}) {
    const l = (2 - s) * v / 2;
    const t = l < .5 ? l * 2 : 2 - l * 2;
    return {
      h: Math.round(constrainHue(h)),
      s: Math.round(t ? s * v / t * 100 : 0),
      l: Math.round(l * 100),
    };
  }

  function currentColorToString(format = currentFormat, alpha = HSV.a) {
    const converted = format === 'hsl' ? HSVtoHSL(HSV) : HSVtoRGB(HSV);
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

  function alphaToString(a = HSV.a) {
    return isNaN(a) ? '' : (a + .5e-6).toFixed(7).slice(0, -1).replace(/^0(?=\.[1-9])|^1\.0+?$|\.?0+$/g, '');
  }

  //endregion
  //region Miscellaneous utilities

  function reposition() {
    const width = $root.offsetWidth;
    const height = $root.offsetHeight;

    // set left position for color picker
    let elementScreenLeft = options.left - document.scrollingElement.scrollLeft;
    const bodyWidth = document.scrollingElement.scrollWidth;
    if (width + elementScreenLeft > bodyWidth) {
      elementScreenLeft -= (width + elementScreenLeft) - bodyWidth;
    }
    if (elementScreenLeft < 0) {
      elementScreenLeft = 0;
    }

    // set top position for color picker
    let elementScreenTop = options.top - document.scrollingElement.scrollTop;
    if (height + elementScreenTop > window.innerHeight) {
      elementScreenTop = window.innerHeight - height;
    }
    if (elementScreenTop < options.top) {
      elementScreenTop = options.top - height - 20;
    }
    if (elementScreenTop < 0) {
      elementScreenTop = 0;
    }

    // set position
    $root.style.left = elementScreenLeft + 'px';
    $root.style.top = elementScreenTop + 'px';
  }

  function fade({fadingStage = 1} = {}) {
    const timeInactive = performance.now() - userActivity;
    const delay = options.hideDelay / 2;
    if (userActivity && timeInactive < delay) {
      timerFadeColorPicker = setTimeout(fade, delay - timeInactive, 2);
      clearTimeout(timerCloseColorPicker);
      delete $root.dataset.fading;
      return;
    }
    $root.dataset.fading = fadingStage;
    if (fadingStage === 1) {
      timerFadeColorPicker = setTimeout(fade, Math.max(0, delay - 500), {fadingStage: 2});
    } else {
      timerCloseColorPicker = setTimeout(hide, 500);
    }
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
        window.scrollTo(x, y);
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
    const realColor = {r: 255, g: 255, b: 255, a: 1};
    const start = options.guessBrightness ||
      ((cm.display.renderedView || [])[0] || {}).text || cm.display.lineDiv;
    for (let el = start; el; el = el.parentElement) {
      const bgColor = getComputedStyle(el).backgroundColor;
      const [r, g, b, a = 255] = (bgColor.match(/\d+/g) || []).map(Number);
      if (!a) {
        continue;
      }
      const mixedA = 1 - (1 - a / 255) * (1 - realColor.a);
      const q1 = a / 255 / mixedA;
      const q2 = realColor.a * (1 - mixedA) / mixedA;
      realColor.r = Math.round(r * q1 + realColor.r * q2);
      realColor.g = Math.round(g * q1 + realColor.g * q2);
      realColor.b = Math.round(b * q1 + realColor.b * q2);
      realColor.a = mixedA;
    }
    // https://www.w3.org/TR/AERT#color-contrast
    const {r, g, b} = realColor;
    const brightness = r * .299 + g * .587 + b * .114;
    return brightness < 128 ? 'dark' : 'light';
  }

  function constrain(min, max, value) {
    return value < min ? min : value > max ? max : value;
  }

  function snapToInt(num) {
    const int = Math.round(num);
    return Math.abs(int - num) < 1e-3 ? int : num;
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

  //endregion
};
