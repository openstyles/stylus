/* global usercss messageBox */

'use strict';

function configDialog(style) {
  const {colorParser} = usercss;
  const form = buildConfigForm();

  return messageBox({
    title: `Configure ${style.name}`,
    className: 'config-dialog',
    contents: form.el,
    buttons: [
      t('confirmSave'),
      {
        textContent: t('confirmDefault'),
        onclick: form.useDefault
      },
      t('confirmCancel')
    ]
  }).then(result => {
    if (result.button !== 0 && !result.enter) {
      return;
    }
    return form.getVars();
  });

  function buildConfigForm() {
    const labels = [];
    const vars = deepCopy(style.vars);
    for (const key of Object.keys(vars)) {
      const va = vars[key];
      let appendChild;
      if (va.type === 'color') {
        va.inputColor = $element({tag: 'input', type: 'color'});
        // FIXME: i18n
        va.inputAlpha = $element({tag: 'input', type: 'range', min: 0, max: 1, title: 'Opacity', step: 'any'});
        va.inputColor.onchange = va.inputAlpha.oninput = () => {
          va.dirty = true;
          const color = colorParser.parse(va.inputColor.value);
          color.a = Number(va.inputAlpha.value);
          va.value = colorParser.format(color);
          va.inputColor.style.opacity = color.a;
        };
        appendChild = [va.label, va.inputColor, va.inputAlpha];
      } else if (va.type === 'checkbox') {
        va.input = $element({tag: 'input', type: 'checkbox'});
        va.input.onchange = () => {
          va.dirty = true;
          va.value = String(Number(va.input.checked));
        };
        appendChild = [va.input, $element({tag: 'span', appendChild: va.label})];
      } else if (va.type === 'select') {
        va.input = $element({
          tag: 'select',
          appendChild: Object.keys(va.select).map(key => $element({
            tag: 'option', value: key, appendChild: va.select[key]
          }))
        });
        va.input.onchange = () => {
          va.dirty = true;
          va.value = va.input.value;
        };
        appendChild = [va.label, va.input];
      } else {
        va.input = $element({tag: 'input', type: 'text'});
        va.input.oninput = () => {
          va.dirty = true;
          va.value = va.input.value;
        };
        appendChild = [va.label, va.input];
      }
      labels.push($element({
        tag: 'label',
        className: `config-${va.type}`,
        appendChild
      }));
    }
    drawValues();

    function drawValues() {
      for (const key of Object.keys(vars)) {
        const va = vars[key];
        const value = va.value === null || va.value === undefined ?
          va.default : va.value;

        if (va.type === 'color') {
          const color = colorParser.parse(value);
          va.inputAlpha.value = color.a;
          va.inputColor.style.opacity = color.a;
          delete color.a;
          va.inputColor.value = colorParser.formatHex(color);
        } else if (va.type === 'checkbox') {
          va.input.checked = Number(value);
        } else {
          va.input.value = value;
        }
      }
    }

    function useDefault() {
      for (const key of Object.keys(vars)) {
        const va = vars[key];
        va.dirty = va.value !== null && va.value !== undefined &&
          va.value !== va.default;
        va.value = null;
      }
      drawValues();
    }

    function getVars() {
      return vars;
    }

    return {
      el: labels,
      useDefault,
      getVars
    };
  }
}
