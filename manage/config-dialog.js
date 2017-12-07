/* global messageBox */
'use strict';

function configDialog(style) {
  const AUTOSAVE_DELAY = 500;
  const data = style.usercssData;
  const varsHash = deepCopy(data.vars) || {};
  const varNames = Object.keys(varsHash);
  const vars = varNames.map(name => varsHash[name]);
  let varsInitial = getInitialValues(varsHash);

  const elements = [];
  const colorpicker = window.colorpicker();
  const isPopup = location.href.includes('popup.html');
  const buttons = {};

  buildConfigForm();
  renderValues();

  return messageBox({
    title: `${style.name} v${data.version}`,
    className: 'config-dialog' + (isPopup ? ' stylus-popup' : ''),
    contents: [
      $create('.config-heading', data.supportURL &&
        $createLink({className: '.external-support', href: data.supportURL}, t('externalFeedback'))),
      $create('.config-body', elements)
    ],
    buttons: [
      {textContent: t('confirmSave'), dataset: {cmd: 'save'}, disabled: true, onclick: save},
      {textContent: t('confirmDefault'), dataset: {cmd: 'default'}, onclick: useDefault},
      {textContent: t('confirmClose'), dataset: {cmd: 'close'}},
    ],
    onshow,
  }).then(onhide);

  function getInitialValues(source) {
    const data = {};
    for (const name of varNames) {
      const va = source[name];
      data[name] = isDefault(va) ? va.default : va.value;
    }
    return data;
  }

  function onshow(box) {
    $('button', box).insertAdjacentElement('afterend',
      $create('label#config-autosave-wrapper', {
        title: t('configOnChangeTooltip'),
      }, [
        $create('input', {id: 'config.autosave', type: 'checkbox'}),
        $create('SVG:svg.svg-icon.checked',
          $create('SVG:use', {'xlink:href': '#svg-icon-checked'})),
        t('configOnChange'),
      ]));
    setupLivePrefs(['config.autosave']);

    if (isPopup) {
      adjustSizeForPopup(box);
      box.style.animationDuration = '0s';
    }

    box.addEventListener('change', onchange);
    buttons.save = $('[data-cmd="save"]', box);
    buttons.default = $('[data-cmd="default"]', box);
    buttons.close = $('[data-cmd="close"]', box);
    updateButtons();
  }

  function onhide() {
    document.body.style.minWidth = '';
    document.body.style.minHeight = '';
    colorpicker.hide();
  }

  function onchange({target}) {
    // invoked after element's own onchange so 'va' contains the updated value
    const va = target.va;
    if (va) {
      va.dirty = varsInitial[va.name] !== (isDefault(va) ? va.default : va.value);
      if (prefs.get('config.autosave')) {
        debounce(save, 0, {anyChangeIsDirty: true});
      } else {
        target.closest('label').classList.toggle('dirty', va.dirty);
        updateButtons();
      }
    }
  }

  function updateButtons() {
    const someDirty = vars.some(va => va.dirty);
    buttons.save.disabled = !someDirty;
    buttons.default.disabled = vars.every(isDefault);
    buttons.close.textContent = t(someDirty ? 'confirmCancel' : 'confirmClose');
  }

  function save({anyChangeIsDirty = false} = {}) {
    if (!vars.length ||
        !vars.some(va => va.dirty || anyChangeIsDirty && va.value !== va.savedValue)) {
      return;
    }
    style.enabled = true;
    style.reason = 'config';
    const styleVars = style.usercssData.vars;
    const bgStyle = BG.cachedStyles.byId.get(style.id);
    const bgVars = bgStyle && (bgStyle.usercssData || {}).vars || {};
    const invalid = [];
    let numValid = 0;
    for (const va of vars) {
      const bgva = bgVars[va.name];
      let error;
      if (!bgva) {
        error = 'deleted';
        delete styleVars[va.name];
      } else
      if (bgva.type !== va.type) {
        error = ['type ', '*' + va.type, ' != ', '*' + bgva.type];
      } else
      if ((va.type === 'select' || va.type === 'dropdown') &&
          !isDefault(va) &&
          bgva.options.every(o => o.name !== va.value)) {
        error = `'${va.value}' not in the updated '${va.type}' list`;
      } else if (!va.dirty && (!anyChangeIsDirty || va.value === va.savedValue)) {
        continue;
      } else {
        styleVars[va.name].value = va.value;
        va.savedValue = va.value;
        numValid++;
        continue;
      }
      invalid.push(['*' + va.name, ': ', ...error].map(e =>
        e[0] === '*' && $create('b', e.slice(1)) || e));
      if (bgva) {
        styleVars[va.name].value = deepCopy(bgva);
      }
    }
    if (invalid.length) {
      onhide();
      messageBox.alert([
        $create('div', {style: 'max-width: 34em'}, t('usercssConfigIncomplete')),
        $create('ol', {style: 'text-align: left'},
          invalid.map(msg =>
            $create({tag: 'li', appendChild: msg}))),
      ]);
    }
    if (!numValid) {
      return;
    }
    return BG.usercssHelper.save(style)
      .then(saved => {
        varsInitial = getInitialValues(deepCopy(saved.usercssData.vars));
        vars.forEach(va => onchange({target: va.input}));
        updateButtons();
        $.remove('.config-error');
      })
      .catch(errors => {
        const el = $('.config-error', messageBox.element) ||
          $('#message-box-buttons').insertAdjacentElement('afterbegin', $create('.config-error'));
        el.textContent = el.title = Array.isArray(errors) ? errors.join('\n') : errors;
      });
  }

  function useDefault() {
    for (const va of vars) {
      va.value = null;
      onchange({target: va.input});
    }
    renderValues();
  }

  function isDefault(va) {
    return va.value === null || va.value === undefined || va.value === va.default;
  }

  function buildConfigForm() {
    for (const va of vars) {
      let children;
      switch (va.type) {
        case 'color':
          children = [
            $create('.cm-colorview', [
              va.input = $create('.color-swatch', {
                va,
                onclick: showColorpicker
              }),
            ]),
          ];
          break;

        case 'checkbox':
          children = [
            $create('span.onoffswitch', [
              va.input = $create('input.slider', {
                va,
                type: 'checkbox',
                onchange: updateVarOnChange,
              }),
              $create('span'),
            ]),
          ];
          break;

        case 'select':
        case 'dropdown':
        case 'image':
          // TODO: a image picker input?
          children = [
            $create('.select-resizer', [
              va.input = $create('select', {
                va,
                onchange: updateVarOnChange,
              },
              va.options.map(o =>
                $create('option', {value: o.name}, o.label))),
              $create('SVG:svg.svg-icon.select-arrow',
                $create('SVG:use', {'xlink:href': '#svg-icon-select-arrow'})),
            ]),
          ];
          break;

        default:
          children = [
            va.input = $create('input', {
              va,
              type: 'text',
              onchange: updateVarOnChange,
              oninput: updateVarOnInput,
            }),
          ];
          break;
      }
      elements.push(
        $create(`label.config-${va.type}`, [
          $create('span', va.label),
          ...children,
        ]));
    }
  }

  function updateVarOnChange() {
    this.va.value = this.value;
  }

  function updateVarOnInput(event, debounced = false) {
    if (debounced) {
      event.target.dispatchEvent(new Event('change', {bubbles: true}));
    } else {
      debounce(updateVarOnInput, AUTOSAVE_DELAY, event, true);
    }
  }

  function renderValues() {
    for (const va of vars) {
      const value = isDefault(va) ? va.default : va.value;
      if (va.type === 'color') {
        va.input.style.backgroundColor = value;
        if (colorpicker.options.va === va) {
          colorpicker.setColor(value);
        }
      } else if (va.type === 'checkbox') {
        va.input.checked = Number(value);
      } else {
        va.input.value = value;
      }
    }
  }

  function showColorpicker() {
    window.removeEventListener('keydown', messageBox.listeners.key, true);
    const box = $('#message-box-contents');
    colorpicker.show({
      va: this.va,
      color: this.va.value || this.va.default,
      top: this.getBoundingClientRect().bottom - 5,
      left: box.getBoundingClientRect().left - 360,
      hideDelay: 1e6,
      guessBrightness: box,
      callback: onColorChanged,
    });
  }

  function onColorChanged(newColor) {
    if (newColor) {
      this.va.value = newColor;
      this.va.input.style.backgroundColor = newColor;
      this.va.input.dispatchEvent(new Event('change', {bubbles: true}));
    }
    debounce(restoreEscInDialog);
  }

  function restoreEscInDialog() {
    if (!$('.colorpicker-popup') && messageBox.element) {
      window.addEventListener('keydown', messageBox.listeners.key, true);
    }
  }

  function adjustSizeForPopup(box) {
    const contents = box.firstElementChild;
    contents.style = 'max-width: none; max-height: none;'.replace(/;/g, '!important;');
    let {offsetWidth: width, offsetHeight: height} = contents;
    contents.style = '';

    const colorpicker = document.body.appendChild(
      $create('.colorpicker-popup', {style: 'display: none!important'}));
    const PADDING = 50;
    const MIN_WIDTH = parseFloat(getComputedStyle(colorpicker).width) || 350;
    const MIN_HEIGHT = 250 + PADDING;
    colorpicker.remove();

    width = constrain(MIN_WIDTH, 800, width + PADDING);
    height = constrain(MIN_HEIGHT, 600, height + PADDING);
    document.body.style.setProperty('min-width', width + 'px', 'important');
    document.body.style.setProperty('min-height', height + 'px', 'important');
  }

  function constrain(min, max, value) {
    return value < min ? min : value > max ? max : value;
  }
}
