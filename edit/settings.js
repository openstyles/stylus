/* global $ $$ $create moveFocus */// dom.js
/* global API */// msg.js
/* global editor */
/* global helpPopup */// util.js
/* global t */// localization.js
/* exported StyleSettings */
'use strict';

function StyleSettings() {
  let {style} = editor;
  const ui = t.template.styleSettings.cloneNode(true);
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
  editor.on('styleUpdated', update);
  helpPopup.show(t('editorSettingLabel'), $create([
    ui,
    $create('.buttons', [
      $create('button', {onclick: helpPopup.close}, t('confirmClose')),
      createInfo({title: t('autosaveNotice')}),
    ]),
  ]));
  $('#help-popup').className = 'style-settings-popup';
  moveFocus(ui, 0);

  function textToList(text) {
    const list = text.split(/\s*\r?\n\s*/g);
    return list.filter(Boolean);
  }

  function update(newStyle, reason) {
    if (!newStyle.id) return;
    if (reason === 'editSave') return;
    style = newStyle;
    inputs.forEach(i => i.update());
  }

  function createArea([parentSel, type]) {
    const sel = parentSel + ' textarea';
    const el = $(sel, ui);
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
    const els = $$(selector, ui);
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

  function createInfo(props) {
    const info = $('.svg-icon.info').closest('a').cloneNode(true);
    info.id = '';
    info.dataset.cmd = 'note';
    return Object.assign(info, props);
  }

  function createInput(selector, getter, setter) {
    const el = $(selector, ui);
    el.addEventListener('change', setter);
    return {
      update() {
        el.value = getter();
      },
    };
  }
}
