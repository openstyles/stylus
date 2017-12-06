/* global messageBox */
'use strict';

function configDialog(style) {
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
  }).then(() => {
    document.body.style.minWidth = '';
    document.body.style.minHeight = '';
    colorpicker.hide();
  });

  function getInitialValues(source) {
    const data = {};
    for (const name of varNames) {
      const va = source[name];
      data[name] = isDefault(va) ? va.default : va.value;
    }
    return data;
  }

  function onshow(box) {
    if (isPopup) {
      adjustSizeForPopup(box);
      box.style.animationDuration = '0s';
    }
    box.addEventListener('change', onchange);
    buttons.save = $('[data-cmd="save"]', box);
    buttons.default = $('[data-cmd="default"]', box);
    buttons.close = $('[data-cmd="close"]', box);
  }

  function onchange({target}) {
    // invoked after element's own onchange so 'va' contains the updated value
    const va = target.va;
    if (va) {
      va.dirty = varsInitial[va.name] !== (isDefault(va) ? va.default : va.value);
      target.closest('label').classList.toggle('dirty', va.dirty);
      updateButtons();
    }
  }

  function updateButtons() {
    const someDirty = vars.some(va => va.dirty);
    buttons.save.disabled = !someDirty;
    buttons.default.disabled = vars.every(isDefault);
    buttons.close.textContent = t(someDirty ? 'confirmCancel' : 'confirmClose');
  }

  function save() {
    if (!vars.length || !vars.some(va => va.dirty)) {
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
      } else if (!va.dirty) {
        continue;
      } else {
        styleVars[va.name].value = va.value;
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
      messageBox.alert([
        $create('div', {style: 'max-width: 34em'}, t('usercssConfigIncomplete')),
        $create('ol', {style: 'text-align: left'},
          invalid.map(msg =>
            $create({tag: 'li', appendChild: msg}))),
      ]);
    }
    return numValid && BG.usercssHelper.save(style).then(saved => {
      varsInitial = getInitialValues(deepCopy(saved.usercssData.vars));
      vars.forEach(va => onchange({target: va.input}));
      updateButtons();
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
                onchange() {
                  va.value = va.input.checked ? '1' : '0';
                },
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
                onchange() {
                  va.value = this.value;
                }
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
              oninput() {
                va.value = this.value;
                this.dispatchEvent(new Event('change', {bubbles: true}));
              },
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
    box.style = 'white-space: nowrap !important';
    box.firstElementChild.style = 'max-width: none; max-height: none;'.replace(/;/g, '!important;');
    const {offsetWidth, offsetHeight} = box.firstElementChild;
    box.style = box.firstElementChild.style = '';

    const colorpicker = document.body.appendChild(
      $create('.colorpicker-popup', {style: 'display: none!important'}));
    const MIN_WIDTH = parseFloat(getComputedStyle(colorpicker).width) || 350;
    const MIN_HEIGHT = 250;
    colorpicker.remove();

    const width = Math.max(Math.min(offsetWidth / 0.9 + 2, 800), MIN_WIDTH);
    const height = Math.max(Math.min(offsetHeight / 0.9 + 2, 600), MIN_HEIGHT);
    document.body.style.setProperty('min-width', width + 'px', 'important');
    document.body.style.setProperty('min-height', height + 'px', 'important');
  }
}
