/* global messageBox makeLink */
'use strict';

function configDialog(style) {
  const varsHash = deepCopy(style.usercssData.vars) || {};
  const varNames = Object.keys(varsHash);
  const vars = varNames.map(name => varsHash[name]);
  const elements = [];
  const colorpicker = window.colorpicker();

  buildConfigForm();
  renderValues();

  return messageBox({
    title: `${style.name} v${style.usercssData.version}`,
    className: 'config-dialog',
    contents: [
      $element({
        className: 'config-heading',
        appendChild: style.usercssData.supportURL && makeLink({
          className: 'external-support',
          href: style.usercssData.supportURL,
          textContent: t('externalFeedback')
        })
      }),
      $element({
        className: 'config-body',
        appendChild: elements
      })
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
        error = `${va.name}: deleted`;
      } else
      if (bgva.type !== va.type) {
        error = `${va.name}: type '${va.type}' != '${bgva.type}'`;
      } else
      if ((va.type === 'select' || va.type === 'dropdown') &&
          va.value !== null && va.value !== undefined &&
          bgva.options.every(o => o.name !== va.value)) {
        error = `${va.name}: '${va.value}' not in the updated '${va.type}' list`;
      } else if (!va.dirty) {
        continue;
      } else {
        styleVars[va.name].value = va.value;
        numValid++;
        continue;
      }
      invalid.push(error);
      delete styleVars[va.name];
    }
    if (invalid.length) {
      messageBox.alert([
        $element({textContent: t('usercssConfigIncomplete'), style: 'max-width: 34em'}),
        $element({
          tag: 'ol',
          style: 'text-align: left; font-weight: bold;',
          appendChild: invalid.map(s => $element({tag: 'li', textContent: s})),
        }),
      ]);
    }
    return numValid && BG.usercssHelper.save(style);
  });

  function buildConfigForm() {
    for (const va of vars) {
      let appendChild;
      switch (va.type) {
        case 'color':
          appendChild = [$element({
            className: 'cm-colorview',
            appendChild: va.inputColor = $element({
              va,
              className: 'color-swatch',
              onclick: showColorpicker,
            })
          })];
          break;

        case 'checkbox':
          va.input = $element({tag: 'input', type: 'checkbox'});
          va.input.onchange = () => {
            va.dirty = true;
            va.value = String(Number(va.input.checked));
          };
          appendChild = [
            $element({tag: 'span', className: 'onoffswitch', appendChild: [
              va.input,
              $element({tag: 'span'})
            ]})
          ];
          break;

        case 'select':
        case 'dropdown':
        case 'image':
          // TODO: a image picker input?
          va.input = $element({
            tag: 'select',
            appendChild: va.options.map(o => $element({
              tag: 'option', value: o.name, textContent: o.label
            }))
          });
          va.input.onchange = () => {
            va.dirty = true;
            va.value = va.input.value;
          };
          appendChild = [va.input];
          break;

        default:
          va.input = $element({tag: 'input', type: 'text'});
          va.input.oninput = () => {
            va.dirty = true;
            va.value = va.input.value;
          };
          appendChild = [va.input];
          break;
      }
      elements.push($element({
        tag: 'label',
        className: `config-${va.type}`,
        appendChild: [
          $element({tag: 'span', appendChild: va.label}),
          ...appendChild,
        ],
      }));
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
