/* global $ $$ */// dom.js
/* global API */// msg.js
/* exported StyleSettings */
'use strict';

function StyleSettings(editor) {
  let {style} = editor;

  const inputs = [
    createInput('.style-update-url input', () => style.updateUrl || '',
      e => API.styles.config(style.id, 'updateUrl', e.target.value)),
    createRadio('.style-prefer-scheme input', () => style.preferScheme || 'none',
      e => API.styles.config(style.id, 'preferScheme', e.target.value)),
    ...[
      ['.style-include', 'inclusions'],
      ['.style-exclude', 'exclusions'],
    ].map(createArea),
  ];

  update(style);

  editor.on('styleChange', update);

  function textToList(text) {
    const list = text.split(/\s*\r?\n\s*/g);
    return list.filter(Boolean);
  }

  function update(newStyle, reason) {
    if (!newStyle.id) return;
    if (reason === 'editSave') return;
    style = newStyle;
    $('.style-settings').disabled = false;
    inputs.forEach(i => i.update());
  }

  function createArea([parentSel, type]) {
    const sel = parentSel + ' textarea';
    const el = $(sel);
    el.on('input', () => {
      const val = el.value;
      el.rows = val.match(/^/gm).length + !val.endsWith('\n');
    });
    return createInput(sel,
      () => {
        const list = style[type] || [];
        const text = list.join('\n');
        el.rows = (list.length || 1) + 1;
        return text;
      },
      () => API.styles.config(style.id, type, textToList(el.value))
    );
  }

  function createRadio(selector, getter, setter) {
    const els = $$(selector);
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
    const el = $(selector);
    el.addEventListener('change', setter);
    return {
      update() {
        el.value = getter();
      },
    };
  }
}
