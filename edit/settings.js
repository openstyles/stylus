/* global API */
/* exported StyleSettings */
'use strict';

function StyleSettings(editor) {
  let {style} = editor;

  const inputs = [
    createInput('.style-update-url input', () => style.updateUrl || '',
      e => API.styles.config(style.id, 'updateUrl', e.target.value)),
    createRadio('.style-prefer-scheme input', () => style.preferScheme || 'none',
      e => API.styles.config(style.id, 'preferScheme', e.target.value)),
    createInput('.style-include textarea', () => (style.inclusions || []).join('\n'),
      e => API.styles.config(style.id, 'inclusions', textToList(e.target.value))),
    createInput('.style-exclude textarea', () => (style.exclusions || []).join('\n'),
      e => API.styles.config(style.id, 'exclusions', textToList(e.target.value))),
  ];

  update(style);

  editor.on('styleChange', update);

  function textToList(text) {
    const list = text.split(/\s*\r?\n\s*/g);
    return list.filter(Boolean);
  }

  function update(newStyle, reason) {
    if (!newStyle.id) return;
    if (reason === 'editSave' || reason === 'config') return;
    style = newStyle;
    document.querySelector('.style-settings').disabled = false;
    inputs.forEach(i => i.update());
  }

  function createRadio(selector, getter, setter) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      el.addEventListener('change', e => {
        if (el.checked) {
          setter(e);
        }
      });
    }
    return {
      update() {
        for (const el of els) {
          if (el.value === getter()) {
            el.checked = true;
          }
        }
      },
    };
  }

  function createInput(selector, getter, setter) {
    const el = document.querySelector(selector);
    el.addEventListener('change', setter);
    return {
      update() {
        el.value = getter();
      },
    };
  }
}
