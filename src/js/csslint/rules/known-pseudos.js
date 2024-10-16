export default [{
  name: 'Require use of known pseudo selectors',
  // eslint-disable-next-line max-len
  url: 'https://developer.mozilla.org/docs/Learn/CSS/Building_blocks/Selectors/Pseudo-classes_and_pseudo-elements',
}, (rule, parser, reporter) => {
  // 1 = requires ":"
  // 2 = requires "::"
  const Func = 4; // must be :function()
  const FuncToo = 8; // both :function() and :non-function
  const WK = 0x10;
  const Moz = 0x20;
  const DEAD = 0xDEAD0000; // deprecated
  const definitions = {
    // elements
    'after': 1 + 2, // also allows ":"
    'backdrop': 2,
    'before': 1 + 2, // also allows ":"
    'cue': 2,
    'cue-region': 2,
    'file-selector-button': 2,
    'first-letter': 1 + 2, // also allows ":"
    'first-line': 1 + 2, // also allows ":"
    'grammar-error': 2,
    'highlight': 2 + Func,
    'marker': 2,
    'part': 2 + Func,
    'placeholder': 2 + Moz,
    'selection': 2 + Moz,
    'slotted': 2 + Func,
    'spelling-error': 2,
    'target-text': 2,
    // classes
    'active': 1,
    'any-link': 1 + Moz + WK,
    'autofill': 1 + WK,
    'blank': 1,
    'checked': 1,
    'current': 1 + FuncToo,
    'default': 1,
    'defined': 1,
    'dir': 1 + Func,
    'disabled': 1,
    'drop': 1,
    'empty': 1,
    'enabled': 1,
    'first': 1,
    'first-child': 1,
    'first-of-type': 1,
    'focus': 1,
    'focus-visible': 1,
    'focus-within': 1,
    'fullscreen': 1,
    'future': 1,
    'has': 1 + Func,
    'host': 1 + FuncToo,
    'host-context': 1 + Func,
    'hover': 1,
    'in-range': 1,
    'indeterminate': 1,
    'invalid': 1,
    'is': 1 + Func,
    'lang': 1 + Func,
    'last-child': 1,
    'last-of-type': 1,
    'left': 1,
    'link': 1,
    'local-link': 1,
    'not': 1 + Func,
    'nth-child': 1 + Func,
    'nth-col': 1 + Func,
    'nth-last-child': 1 + Func,
    'nth-last-col': 1 + Func,
    'nth-last-of-type': 1 + Func,
    'nth-of-type': 1 + Func,
    'only-child': 1,
    'only-of-type': 1,
    'optional': 1,
    'out-of-range': 1,
    'past': 1,
    'paused': 1,
    'picture-in-picture': 1,
    'placeholder-shown': 1,
    'playing': 1,
    'read-only': 1,
    'read-write': 1,
    'required': 1,
    'right': 1,
    'root': 1,
    'scope': 1,
    'state': 1 + Func,
    'target': 1,
    'target-within': 1,
    'user-invalid': 1,
    'valid': 1,
    'visited': 1,
    'where': 1 + Func,
    'xr-overlay': 1,
    // ::-webkit-scrollbar specific classes
    'corner-present': 1,
    'decrement': 1,
    'double-button': 1,
    'end': 1,
    'horizontal': 1,
    'increment': 1,
    'no-button': 1,
    'single-button': 1,
    'start': 1,
    'vertical': 1,
    'window-inactive': 1 + Moz,
  };
  const definitionsPrefixed = {
    'any': 1 + Func + Moz + WK,
    'calendar-picker-indicator': 2 + WK,
    'clear-button': 2 + WK,
    'color-swatch': 2 + WK,
    'color-swatch-wrapper': 2 + WK,
    'date-and-time-value': 2 + WK,
    'datetime-edit': 2 + WK,
    'datetime-edit-ampm-field': 2 + WK,
    'datetime-edit-day-field': 2 + WK,
    'datetime-edit-fields-wrapper': 2 + WK,
    'datetime-edit-hour-field': 2 + WK,
    'datetime-edit-millisecond-field': 2 + WK,
    'datetime-edit-minute-field': 2 + WK,
    'datetime-edit-month-field': 2 + WK,
    'datetime-edit-second-field': 2 + WK,
    'datetime-edit-text': 2 + WK,
    'datetime-edit-week-field': 2 + WK,
    'datetime-edit-year-field': 2 + WK,
    'details-marker': 2 + WK + DEAD,
    'drag': 1 + WK,
    'drag-over': 1 + Moz,
    'file-upload-button': 2 + WK,
    'focus-inner': 2 + Moz,
    'focusring': 1 + Moz,
    'full-page-media': 1 + WK,
    'full-screen': 1 + Moz + WK,
    'full-screen-ancestor': 1 + Moz + WK,
    'inner-spin-button': 2 + WK,
    'input-placeholder': 1 + 2 + WK + Moz,
    'loading': 1 + Moz,
    'media-controls': 2 + WK,
    'media-controls-current-time-display': 2 + WK,
    'media-controls-enclosure': 2 + WK,
    'media-controls-fullscreen-button': 2 + WK,
    'media-controls-mute-button': 2 + WK,
    'media-controls-overlay-enclosure': 2 + WK,
    'media-controls-overlay-play-button': 2 + WK,
    'media-controls-panel': 2 + WK,
    'media-controls-play-button': 2 + WK,
    'media-controls-time-remaining-display': 2 + WK,
    'media-controls-timeline': 2 + WK,
    'media-controls-timeline-container': 2 + WK,
    'media-controls-toggle-closed-captions-button': 2 + WK,
    'media-controls-volume-slider': 2 + WK,
    'media-slider-container': 2 + WK,
    'media-slider-thumb': 2 + WK,
    'media-text-track-container': 2 + WK,
    'media-text-track-display': 2 + WK,
    'media-text-track-region': 2 + WK,
    'media-text-track-region-container': 2 + WK,
    'meter-bar': 2 + WK,
    'meter-even-less-good-value': 2 + WK,
    'meter-inner-element': 2 + WK,
    'meter-optimum-value': 2 + WK,
    'meter-suboptimum-value': 2 + WK,
    'outer-spin-button': 2 + WK,
    'progress-bar': 2 + WK,
    'progress-inner-element': 2 + WK,
    'progress-value': 2 + WK,
    'resizer': 2 + WK,
    'scrollbar': 2 + WK,
    'scrollbar-button': 2 + WK,
    'scrollbar-corner': 2 + WK,
    'scrollbar-thumb': 2 + WK,
    'scrollbar-track': 2 + WK,
    'scrollbar-track-piece': 2 + WK,
    'search-cancel-button': 2 + WK,
    'search-decoration': 2 + WK,
    'slider-container': 2 + WK,
    'slider-runnable-track': 2 + WK,
    'slider-thumb': 2 + WK,
    'textfield-decoration-container': 2 + WK,
  };
  const rx = /^(:+)(?:-(\w+)-)?([^(]+)(\()?/i;
  const allowsFunc = Func + FuncToo;
  const allowsPrefix = WK + Moz;
  const checkSelector = ({parts}) => {
    for (const {modifiers} of parts || []) {
      if (!modifiers) continue;
      for (const mod of modifiers) {
        if (mod.type === 'pseudo') {
          const {text} = mod;
          const [all, colons, prefix, name, paren] = rx.exec(text.toLowerCase()) || 0;
          const defPrefixed = definitionsPrefixed[name];
          const def = definitions[name] || defPrefixed;
          for (const err of !def ? ['Unknown pseudo'] : [
            colons.length > 1
              ? !(def & 2) && 'Must use : in'
              : !(def & 1) && all !== ':-moz-placeholder' && 'Must use :: in',
            paren
              ? !(def & allowsFunc) && 'Unexpected ( in'
              : (def & Func) && 'Must use ( after',
            prefix ?
              (
                !(def & allowsPrefix) ||
                prefix === 'webkit' && !(def & WK) ||
                prefix === 'moz' && !(def & Moz)
              ) && 'Unexpected prefix in'
              : defPrefixed && `Must use ${
                (def & WK) && (def & Moz) && '-webkit- or -moz-' ||
                (def & WK) && '-webkit-' || '-moz-'} prefix in`,
            (def & DEAD) && 'Deprecated',
          ]) {
            if (err) reporter.report(`${err} ${text.slice(0, all.length)}`, mod, rule);
          }
        } else if (mod.args) {
          mod.args.forEach(checkSelector);
        }
      }
    }
  };
  parser.addListener('startrule', e => e.selectors.forEach(checkSelector));
  parser.addListener('supportsSelector', e => checkSelector(e.selector));
}];
