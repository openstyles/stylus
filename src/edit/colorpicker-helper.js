import {CodeMirror, extraKeys} from '@/cm';
import * as prefs from '@/js/prefs';
import '@/js/color/color-view';
import {t} from '@/js/util';
import cmFactory from './codemirror-factory';

const {defaults, commands} = CodeMirror;

prefs.subscribe('editor.colorpicker.hotkey', (id, hotkey) => {
  commands.colorpicker = invokeColorpicker;
  for (const key in extraKeys) {
    if (extraKeys[key] === 'colorpicker') {
      delete extraKeys[key];
      break;
    }
  }
  if (hotkey) {
    extraKeys[hotkey] = 'colorpicker';
  }
}, true);

prefs.subscribe('editor.colorpicker', (id, enabled) => {
  const keyName = prefs.__values['editor.colorpicker.hotkey'];
  defaults.colorpicker = enabled;
  if (enabled) {
    if (keyName) {
      commands.colorpicker = invokeColorpicker;
      extraKeys[keyName] = 'colorpicker';
    }
    defaults.colorpicker = {
      tooltip: t('colorpickerTooltip'),
      popup: {
        tooltipForSwitcher: t('colorpickerSwitchFormatTooltip'),
        paletteLine: t('numberedLine'),
        paletteHint: t('colorpickerPaletteHint'),
        hexUppercase: prefs.__values['editor.colorpicker.hexUppercase'],
        embedderCallback: state => {
          ['hexUppercase', 'color']
            .filter(name => state[name] !== prefs.__values['editor.colorpicker.' + name])
            .forEach(name => prefs.set('editor.colorpicker.' + name, state[name]));
        },
        get maxHeight() {
          return prefs.__values['editor.colorpicker.maxHeight'];
        },
        set maxHeight(h) {
          prefs.set('editor.colorpicker.maxHeight', h);
        },
      },
    };
  } else {
    delete extraKeys[keyName];
  }
  cmFactory.globalSetOption('colorpicker', defaults.colorpicker);
}, true);

function invokeColorpicker(cm) {
  cm.state.colorpicker.openPopup(prefs.__values['editor.colorpicker.color']);
}
