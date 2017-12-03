/* global messageBox */
'use strict';

function configDialog(style) {
  const data = style.usercssData;
  const varsHash = deepCopy(data.vars) || {};
  const varNames = Object.keys(varsHash);
  const vars = varNames.map(name => varsHash[name]);
  const elements = [];
  const colorpicker = window.colorpicker();

  buildConfigForm();
  renderValues();

  return messageBox({
    title: `${style.name} v${data.version}`,
    className: 'config-dialog',
    contents: [
      $create('.config-heading', data.supportURL &&
        $createLink({className: '.external-support', href: data.supportURL}, t('externalFeedback'))),
      $create('.config-body', elements)
    ],
    buttons: [
      t('confirmSave'),
      {
        textContent: t('confirmDefault'),
        onclick: useDefault
      },
      t('confirmCancel')
    ]
  }).then(({button, esc}) => {
    if (button !== 1) {
      colorpicker.hide();
    }
    if (button > 0 || esc || !vars.length || !vars.some(va => va.dirty)) {
      return;
    }
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
          va.value !== null && va.value !== undefined &&
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
    return numValid && BG.usercssHelper.save(style);
  });

  function buildConfigForm() {
    for (const va of vars) {
      let children;
      switch (va.type) {
        case 'color':
          va.inputColor = $create('.color-swatch', {va, onclick: showColorpicker});
          children = [
            $create('.cm-colorview', [
              va.inputColor,
            ]),
          ];
          break;

        case 'checkbox':
          va.input = $create('input.slider', {type: 'checkbox'});
          va.input.onchange = () => {
            va.dirty = true;
            va.value = String(Number(va.input.checked));
          };
          children = [
            $create('span.onoffswitch', [
              va.input,
              $create('span'),
            ])
          ];
          break;

        case 'select':
        case 'dropdown':
        case 'image':
          // TODO: a image picker input?
          va.input = $create('select',
            va.options.map(o =>
              $create('option', {value: o.name}, o.label)));
          va.input.onchange = () => {
            va.dirty = true;
            va.value = va.input.value;
          };
          children = [va.input];
          break;

        default:
          va.input = $create('input', {type: 'text'});
          va.input.oninput = () => {
            va.dirty = true;
            va.value = va.input.value;
          };
          children = [va.input];
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
      const useDefault = va.value === null || va.value === undefined;
      const value = useDefault ? va.default : va.value;
      if (va.type === 'color') {
        va.inputColor.style.backgroundColor = value;
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

  function useDefault() {
    for (const va of vars) {
      const hasValue = va.value !== null && va.value !== undefined;
      va.dirty = hasValue && va.value !== va.default;
      va.value = null;
    }
    renderValues();
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
      this.va.dirty = true;
      this.va.value = newColor;
      this.va.inputColor.style.backgroundColor = newColor;
    }
    debounce(restoreEscInDialog);
  }

  function restoreEscInDialog() {
    if (!$('.colorpicker-popup') && messageBox.element) {
      window.addEventListener('keydown', messageBox.listeners.key, true);
    }
  }
}
