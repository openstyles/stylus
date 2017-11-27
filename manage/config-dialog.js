/* global messageBox makeLink */
'use strict';

function configDialog(style) {
  const form = buildConfigForm();
  const colorpicker = window.colorpicker();

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
        appendChild: form.elements
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
  }).then(({button, enter}) => {
    if (button !== 1) {
      colorpicker.hide();
    }
    if (button === 0 || enter) {
    return form.getVars();
    }
  });

  function buildConfigForm() {
    const labels = [];
    const vars = deepCopy(style.usercssData.vars);
    for (const key of Object.keys(vars)) {
      const va = vars[key];
      let appendChild;
      switch (va.type) {
        case 'color':
          appendChild = [$element({
            className: 'cm-colorview',
            appendChild: va.inputColor = $element({
              va,
              className: 'color-swatch',
              onclick: onColorClicked,
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
        const useDefault = va.value === null || va.value === undefined;
        const value = useDefault ? va.default : va.value;
        if (va.type === 'color') {
          va.inputColor.style.backgroundColor = value;
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

    function onColorClicked() {
      window.removeEventListener('keydown', messageBox.listeners.key, true);
      const box = $('#message-box-contents');
      colorpicker.show({
        color: this.va.value || this.va.default,
        top: this.getBoundingClientRect().bottom - 5,
        left: box.getBoundingClientRect().left - 360,
        hideDelay: 1e6,
        guessBrightness: box,
        callback: newColor => {
          if (newColor) {
            this.va.dirty = true;
            this.va.value = newColor;
            this.style.backgroundColor = newColor;
          }
          setTimeout(() => {
            if (!$('.colorpicker-popup')) {
              window.addEventListener('keydown', messageBox.listeners.key, true);
            }
          });
        },
      });
    }

    return {
      elements: labels,
      useDefault,
      getVars
    };
  }
}
