import {CodeMirror} from '@/cm';
import {CP, kHexUppercase} from '@/js/consts';
import * as prefs from '@/js/prefs';
import '@/js/color/color-view';
import {t} from '@/js/util';
import cmFactory from './codemirror-factory';
import {HOTKEYS} from './util';

const {defaults} = CodeMirror;
const ECP = 'editor.colorpicker.';
const kColor = 'color';
const kHotkey = 'hotkey';
const kMaxHeight = 'maxHeight';

HOTKEYS[ECP + kHotkey] = CP;
CodeMirror.commands[CP] = cm => cm.state[CP]?.openPopup();

prefs.subscribe(ECP.slice(0, -1), (id, enabled) => {
  defaults[CP] = enabled && {
    tooltip: t('colorpickerTooltip'),
    popup: {
      tooltipForSwitcher: t('colorpickerSwitchFormatTooltip'),
      paletteLine: t('numberedLine'),
      paletteHint: t('colorpickerPaletteHint'),
      get [kHexUppercase]() {
        return prefs.__values[ECP + kHexUppercase];
      },
      set [kHexUppercase](val) {
        prefs.set(ECP + kHexUppercase, val);
      },
      embedderCallback(state) {
        if (state[kColor] !== prefs.__values[ECP + kColor])
          prefs.set(ECP + kColor, state[kColor]);
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
  cmFactory.globalSetOption(CP, defaults[CP]);
}, true);
