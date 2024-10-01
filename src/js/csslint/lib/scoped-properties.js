import Properties from './properties';
import {pick} from './util';

const ScopedProperties = {
  __proto__: null,
  'counter-style': {
    'additive-symbols': '<pad>#',
    'fallback': '<ident-not-none>',
    'negative': '<prefix>{1,2}',
    'pad': '<int0+> && <prefix>',
    'prefix': '<string> | <image> | <custom-ident>',
    'range': '[ [ <int> | infinite ]{2} ]# | auto',
    'speak-as': 'auto | bullets | numbers | words | spell-out | <ident-not-none>',
    'suffix': '<prefix>',
    'symbols': '<prefix>+',
    'system': 'cyclic | numeric | alphabetic | symbolic | additive | [fixed <int>?] | ' +
      '[ extends <ident-not-none> ]',
  },
  'font-face': pick(Properties, [
    'font-family',
    'font-size',
    'font-variant',
    'font-variation-settings',
    'unicode-range',
  ], {
    'ascent-override': '[ normal | <pct0+> ]{1,2}',
    'descent-override': '[ normal | <pct0+> ]{1,2}',
    'font-display': 'auto | block | swap | fallback | optional',
    'font-stretch': 'auto | <font-stretch>{1,2}',
    'font-style': 'auto | normal | italic | oblique <angle>{0,2}',
    'font-weight': 'auto | [ normal | bold | <num1-1000> ]{1,2}',
    'line-gap-override': '[ normal | <pct0+> ]{1,2}',
    'size-adjust': '<pct0+>',
    'src': '[ url() [ format( <string># ) ]? | local( <family-name> ) ]#',
  }),
  'font-palette-values': pick(Properties, ['font-family'], {
    'base-palette': 'light | dark | <int0+>',
    'override-colors': '[ <int0+> <color> ]#',
  }),
  'media': {
    '<all>': true,
    'any-hover': 'none | hover',
    'any-pointer': 'none | coarse | fine',
    'color': '<int>',
    'color-gamut': 'srgb | p3 | rec2020',
    'color-index': '<int>',
    'grid': '<int0-1>',
    'hover': 'none | hover',
    'monochrome': '<int>',
    'overflow-block': 'none | scroll | paged',
    'overflow-inline': 'none | scroll',
    'pointer': 'none | coarse | fine',
    'resolution': '<resolution> | infinite',
    'scan': 'interlace | progressive',
    'update': 'none | slow | fast',
    // deprecated
    'device-aspect-ratio': '<ratio>',
    'device-height': '<len>',
    'device-width': '<len>',
  },
  'page': {
    '<all>': true,
    'bleed': 'auto | <len>',
    'marks': 'none | [ crop || cross ]',
    'size': '<len>{1,2} | auto | [ [ A3 | A4 | A5 | B4 | B5 | JIS-B4 | JIS-B5 | ' +
      'ledger | legal | letter ] || [ portrait | landscape ] ]',
  },
  'property': {
    'inherits': 'true | false',
    'initial-value': 1,
    'syntax': '<string>',
  },
};

export default ScopedProperties;
