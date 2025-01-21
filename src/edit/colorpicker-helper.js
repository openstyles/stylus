import {CodeMirror, extraKeys} from '@/cm';
import * as prefs from '@/js/prefs';
import '@/js/color/color-view';
import {t} from '@/js/util';
import cmFactory from './codemirror-factory';

const {defaults, commands} = CodeMirror;
const ECP = 'editor.colorpicker.';
const CP = 'colorpicker';

prefs.subscribe(ECP + 'hotkey', (id, hotkey) => {
  commands[CP] = invokeColorpicker;
  for (const key in extraKeys) {
    if (extraKeys[key] === CP) {
      delete extraKeys[key];
      break;
    }
  }
  if (hotkey) {
    extraKeys[hotkey] = CP;
  }
}, true);

prefs.subscribe(ECP.slice(0, -1), (id, enabled) => {
  const keyName = prefs.__values[ECP + 'hotkey'];
  defaults[CP] = enabled;
  if (enabled) {
    if (keyName) {
      commands[CP] = invokeColorpicker;
      extraKeys[keyName] = CP;
    }
    defaults[CP] = {
      tooltip: t('colorpickerTooltip'),
      popup: {
        tooltipForSwitcher: t('colorpickerSwitchFormatTooltip'),
        paletteLine: t('numberedLine'),
        paletteHint: t('colorpickerPaletteHint'),
        hexUppercase: prefs.__values[ECP + 'hexUppercase'],
        embedderCallback: state => {
          for (const k of ['hexUppercase', 'color'])
            if (state[k] !== prefs.__values[ECP + k])
              prefs.set(ECP + k, state[k]);
        },
        get maxHeight() {
          return prefs.__values[ECP + 'maxHeight'];
        },
        set maxHeight(h) {
          prefs.set(ECP + 'maxHeight', h);
        },
      },
    };
  } else {
    delete extraKeys[keyName];
  }
  cmFactory.globalSetOption(CP, defaults[CP]);
}, true);

function invokeColorpicker(cm) {
  cm.state[CP].openPopup(prefs.__values[ECP + 'color']);
}
