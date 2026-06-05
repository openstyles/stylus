import {CodeMirror, extraKeys} from '@/cm';
import * as prefs from '@/js/prefs';
import '@/js/color/color-view';
import {CP, kHexUppercase} from '@/js/color/util';
import {t} from '@/js/util';
import cmFactory from './codemirror-factory';

const {defaults, commands} = CodeMirror;
const ECP = 'editor.colorpicker.';
const kColor = 'color';
const kHotkey = 'hotkey';
const kMaxHeight = 'maxHeight';

prefs.subscribe(ECP + kHotkey, (id, hotkey) => {
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
  const keyName = prefs.__values[ECP + kHotkey];
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
        [kHexUppercase]: prefs.__values[ECP + kHexUppercase],
        embedderCallback(state) {
          for (const k of [kColor, kHexUppercase])
            if (state[k] !== prefs.__values[ECP + k])
              prefs.set(ECP + k, state[k]);
        },
        get [kMaxHeight]() {
          return prefs.__values[ECP + kMaxHeight];
        },
        set [kMaxHeight](h) {
          prefs.set(ECP + kMaxHeight, h);
        },
        get defaultColor() {
          return prefs.__values[ECP + kColor];
        },
      },
    };
  } else {
    delete extraKeys[keyName];
  }
  cmFactory.globalSetOption(CP, defaults[CP]);
}, true);

function invokeColorpicker(cm) {
  cm.state[CP].openPopup();
}
