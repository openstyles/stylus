/* global API t */
/* exported StyleSettings */
'use strict';

function StyleSettings(editor) {
  let {style} = editor;

  const inputs = [
    createInput('.style-update-url input', () => style.updateUrl || '',
      e => API.styles.config(style.id, 'updateUrl', e.target.value)),
    createRadio('.style-prefer-scheme input', () => style.preferScheme || 'none',
      e => API.styles.config(style.id, 'preferScheme', e.target.value)),
    createInput('.style-priority input', () => style.priority || 0,
      e => API.styles.config(style.id, 'priority', e.target.valueAsNumber)),
    createRuleTable(document.querySelector('.style-include'), 'inclusions'),
    createRuleTable(document.querySelector('.style-exclude'), 'exclusions'),
  ];

  update(style);

  editor.on('styleChange', update);

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

  function createRuleTable(container, type) {
    const table = container.querySelector('.rule-table');
    container.querySelector('.add-rule').addEventListener('click', addRule);
    return {update};

    function update() {
      // TODO: don't recreate everything
      table.innerHTML = '';
      if (!style[type]) {
        style[type] = [];
      }
      container.dataset.length = style[type].length;
      style[type].forEach((rule, i) => {
        const input = document.createElement('input');
        input.value = rule;
        input.addEventListener('change', () => {
          style[type][i] = input.value;
          API.styles.config(style.id, type, style[type]);
        });
        table.append(input);

        const delButton = document.createElement('button');
        delButton.textContent = t('styleIncludeDeleteLabel');
        delButton.addEventListener('click', () => {
          style[type].splice(i, 1);
          API.styles.config(style.id, type, style[type]);
          update();
        });
        table.append(delButton);
      });
    }

    function addRule() {
      if (!style[type]) {
        style[type] = [];
      }
      style[type].push('');
      API.styles.config(style.id, type, style[type]);
      update();
    }
  }
}
