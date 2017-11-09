/* global colorParser messageBox makeLink */
'use strict';

function configDialog(style) {
  const form = buildConfigForm();

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
        appendChild: form.el
      })
    ],
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
    const vars = deepCopy(style.usercssData.vars);
    for (const key of Object.keys(vars)) {
      const va = vars[key];
      let appendChild;
      switch (va.type) {
        case 'color':
          va.inputColor = $element({tag: 'input', type: 'color'});
          va.inputAlpha = $element({
            tag: 'input',
            type: 'range',
            min: 0,
            max: 1,
            title: chrome.i18n.getMessage('alphaChannel'),
            step: 'any'
          });
          va.inputColor.onchange = va.inputAlpha.oninput = () => {
            va.dirty = true;
            const color = colorParser.parse(va.inputColor.value);
            color.a = Number(va.inputAlpha.value);
            va.value = colorParser.format(color);
            va.inputColor.style.opacity = color.a;
          };
          appendChild = [
            $element({appendChild: [va.inputColor, va.inputAlpha]})
          ];
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
      appendChild.unshift($element({tag: 'span', appendChild: va.label}));
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
        va.dirty = va.value !== null && va.value !== undefined && va.value !== va.default;
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
