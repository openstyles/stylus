import {kEditorSettings} from '@/js/consts';
import {template} from '@/js/localization';
import {t} from '@/js/util';

export const kLineWrapping = 'lineWrapping';

export const getStyleAtPos = (styles, ch, pickOne) => {
  if (!styles) return;
  const len = styles.length;
  const end = styles[len - 2];
  if (ch > end) return;
  if (ch === end) {
    return pickOne === 0 ? styles[len - 1]
      : pickOne === 1 ? len - 2
        : [styles[len - 1], len - 2];
  }
  const mid = (ch / end * (len - 1) & ~1) + 1;
  let a = mid;
  let b;
  while (a > 1 && styles[a] > ch) {
    b = a;
    a = (a / 2 & ~1) + 1;
  }
  if (!b) b = mid;
  while (b < len && styles[b] < ch) b = ((len + b) / 2 & ~1) + 1;
  while (a < b - 3) {
    const c = ((a + b) / 2 & ~1) + 1;
    if (styles[c] > ch) b = c; else a = c;
  }
  while (a < len && styles[a] < ch) a += 2;
  return pickOne === 0 ? styles[a + 1]
    : pickOne === 1 ? a
      : [styles[a + 1], a];
};

export const disableWrappingForLongLine = (cm, {text, once}) => {
  const opts = cm.options;
  const max = Math.max(opts.maxHighlightLength, 100e3);
  if (!text && opts.value.length < max)
    return;
  (text ? text.some : cm.eachLine).call(text || cm, line => {
    line = (text ? line : line.text).length;
    if (line < max)
      return;
    const el = template[kEditorSettings]?.$('#lineWrapping-label + a');
    if (el) {
      el.hidden = false;
      el.title = t('cm_lineWrappingOff', [Math.round(line / 1000)]);
      el.parentElement.on('change', evt => !evt.target.checked && (el.hidden = true), {once: true});
    }
    if (once)
      cm.off('beforechange', disableWrappingForLongLine);
    cm.setOption(kLineWrapping, false);
    return true;
  });
};
