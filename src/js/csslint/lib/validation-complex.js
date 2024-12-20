/* eslint-disable max-len */
const VTComplex = {
  __proto__: null,
  '<absolute-size>': 'xx-small | x-small | small | medium | large | x-large | xx-large',
  '<alpha>': '/ <num-pct-none>',
  '<animateable-feature>': 'scroll-position | contents | <animateable-feature-name>',
  '<animation-direction>': 'normal | reverse | alternate | alternate-reverse',
  '<animation-fill-mode>': 'none | forwards | backwards | both',
  '<animation-timeline>': 'auto | none | <custom-ident> | ' +
    'scroll( [ [ root | nearest | self ] || <axis> ]? ) | ' +
    'view( [ <axis> || [ [ auto | <len-pct> ]{1,2} ]# ]? )',
  '<attachment>': 'scroll | fixed | local',
  '<auto-repeat>':
    'repeat( [ auto-fill | auto-fit ] , [ <line-names>? <fixed-size> ]+ <line-names>? )',
  '<auto-track-list>':
    '[ <line-names>? [ <fixed-size> | <fixed-repeat> ] ]* <line-names>? <auto-repeat> ' +
    '[ <line-names>? [ <fixed-size> | <fixed-repeat> ] ]* <line-names>?',
  '<axis>': 'block | inline | vertical | horizontal',
  '<baseline-position>': '[ first | last ]? baseline',
  '<basic-shape>': '<fn:basicShape>',
  '<bg-image>': '<image> | none',
  '<bg-layer>': '<bg-image> || <bg-position> [ / <bg-size> ]? || <repeat-style> || ' +
    '<attachment> || <box>{1,2}',
  '<bg-position>':
    '[ center | [ left | right ] <len-pct>? ] && [ center | [ top | bottom ] <len-pct>? ] | ' +
    '[ left | center | right | <len-pct> ] [ top | center | bottom | <len-pct> ] | ' +
    '[ left | center | right | top | bottom | <len-pct> ]',
  '<bg-size>': '[ <len-pct> | auto ]{1,2} | cover | contain',
  '<blend-mode>': 'normal | multiply | screen | overlay | darken | lighten | color-dodge | ' +
    'color-burn | hard-light | soft-light | difference | exclusion | hue | ' +
    'saturation | color | luminosity | plus-darker | plus-lighter',
  '<border-image-slice>': M => M.many([true],
    // [<num> | <pct>]{1,4} && fill?
    // but 'fill' can appear between any of the numbers
    ['<num-pct0+>', '<num-pct0+>', '<num-pct0+>', '<num-pct0+>', 'fill'].map(M.term)),
  '<border-radius-round>': 'round <border-radius>',
  '<border-shorthand>': '<border-width> || <border-style> || <color>',
  '<border-style>':
    'none | hidden | dotted | dashed | solid | double | groove | ridge | inset | outset',
  '<border-width>': '<len> | thin | medium | thick',
  '<box>': 'padding-box | border-box | content-box',
  '<box-fsv>': 'fill-box | stroke-box | view-box',
  '<color>': '<named-or-hex-color> | <fn:color>',
  '<compositing-operator>': 'add | subtract | intersect | exclude',
  '<contain-intrinsic>': 'auto? [ none | <len> ]',
  '<content-distribution>': 'space-between | space-around | space-evenly | stretch',
  '<content-list>':
    '[ <string> | <image> | <attr> | ' +
    'content( text | before | after | first-letter | marker ) | ' +
    'counter() | counters() | leader() | ' +
    'open-quote | close-quote | no-open-quote | no-close-quote | ' +
    'target-counter() | target-counters() | target-text() ]+',
  '<content-position>': 'center | start | end | flex-start | flex-end',
  '<coord-box>': '<box> | <box-fsv>',
  '<counter>': '[ <ident-not-none> <int>? ]+ | none',
  '<dasharray>': M => M.alt([M.term('<len-pct0+>'), M.term('<num0+>')])
    .braces(1, Infinity, '#', M.term(',').braces(0, 1, '?')),
  '<display-box>': 'contents | none',
  '<display-inside>': 'flow | flow-root | table | flex | grid | ruby',
  '<display-internal>': 'table-row-group | table-header-group | table-footer-group | ' +
    'table-row | table-cell | table-column-group | table-column | table-caption | ' +
    'ruby-base | ruby-text | ruby-base-container | ruby-text-container',
  '<display-legacy>': 'inline-block | inline-table | inline-flex | inline-grid',
  '<display-listitem>': '<display-outside>? && [ flow | flow-root ]? && list-item',
  '<display-outside>': 'block | inline | run-in',
  '<explicit-track-list>': '[ <line-names>? <track-size> ]+ <line-names>?',
  '<family-name>': '<string> | <custom-ident>+',
  // https://drafts.fxtf.org/filter-effects/#supported-filter-functions
  // Value may be omitted in which case the default is used
  '<filter-function-list>': '[ <fn:filter> | <url> ]+',
  '<final-bg-layer>': '<color> || <bg-image> || <bg-position> [ / <bg-size> ]? || ' +
    '<repeat-style> || <attachment> || <box>{1,2}',
  '<fixed-repeat>': 'repeat( [ <int1+> ] , [ <line-names>? <fixed-size> ]+ <line-names>? )',
  '<fixed-size>':
    '<len-pct> | minmax( <len-pct> , <track-breadth> | <inflexible-breadth> , <len-pct> )',
  '<flex-direction>': 'row | row-reverse | column | column-reverse',
  '<flex-wrap>': 'nowrap | wrap | wrap-reverse',
  '<font-short-core>': '<font-size> [ / <line-height> ]? <font-family>',
  '<font-short-tweak-no-pct>':
    '<font-style> || [ normal | small-caps ] || <font-weight> || <font-stretch-named>',
  '<font-stretch-named>': 'normal | ultra-condensed | extra-condensed | condensed | ' +
    'semi-condensed | semi-expanded | expanded | extra-expanded | ultra-expanded',
  '<font-variant-alternates>': 'stylistic() || historical-forms || styleset() || ' +
    'character-variant() || swash() || ornaments() || annotation()',
  '<font-variant-caps>':
    'small-caps | all-small-caps | petite-caps | all-petite-caps | unicase | titling-caps',
  '<font-variant-east-asian>': '[ jis78|jis83|jis90|jis04|simplified|traditional ] || ' +
    '[ full-width | proportional-width ] || ruby',
  '<font-variant-ligatures>': '[ common-ligatures | no-common-ligatures ] || ' +
    '[ discretionary-ligatures | no-discretionary-ligatures ] || ' +
    '[ historical-ligatures | no-historical-ligatures ] || ' +
    '[ contextual | no-contextual ]',
  '<font-variant-numeric>': '[ lining-nums | oldstyle-nums ] || ' +
    '[ proportional-nums | tabular-nums ] || ' +
    '[ diagonal-fractions | stacked-fractions ] || ' +
    'ordinal || slashed-zero',
  '<generic-family>': 'serif | sans-serif | cursive | fantasy | monospace | system-ui | ' +
    'emoji | math | fangsong | ui-serif | ui-sans-serif | ui-monospace | ui-rounded',
  '<geometry-box>': '<shape-box> | <box-fsv>',
  '<gradient>': 'radial-gradient() | linear-gradient() | conic-gradient() | gradient() | ' +
    'repeating-radial-gradient() | repeating-linear-gradient() | repeating-conic-gradient() | ' +
    'repeating-gradient()',
  '<grid-line>': 'auto | [ <int> && <ident-for-grid>? ] | <ident-for-grid> | ' +
    '[ span && [ <int> || <ident-for-grid> ] ]',
  '<image>': '<image-no-set> | image-set( <image-set># )',
  '<image-no-set>': '<url> | <gradient> | -webkit-cross-fade()',
  '<image-set>': '[ <image-no-set> | <string> ] [ <resolution> || type( <string> ) ]',
  '<inflexible-breadth>': '<len-pct> | min-content | max-content | auto',
  '<inset>': 'inset( <inset-arg> )',
  '<inset-arg>': '<len-pct>{1,4} <border-radius-round>?',
  '<line-height>': '<num> | <len-pct> | normal',
  '<line-names>': '"[" <ident-for-grid> "]"',
  '<masking-mode>': 'alpha | luminance | match-source',
  '<overflow-position>': 'unsafe | safe',
  '<overflow>': '<vis-hid> | clip | scroll | auto | overlay', // TODO: warning about `overlay`
  '<overscroll>': 'contain | none | auto',
  '<paint>': 'none | <color> | <url> [ none | <color> ]? | context-fill | context-stroke',
  // Because our `alt` combinator is ordered, we need to test these
  // in order from longest possible match to shortest.
  '<position>':
    '[ [ left | right ] <len-pct> ] && [ [ top | bottom ] <len-pct> ] | ' +
    '[ left | center | right | <len-pct> ] ' +
    '[ top | center | bottom | <len-pct> ]? | ' +
    '[ left | center | right ] || [ top | center | bottom ]',
  '<ratio>': '<num0+> [ / <num0+> ]?',
  '<ray>': 'ray( <angle> && [closest-side | closest-corner | farthest-side | farthest-corner | sides]?' +
    ' && contain? && [at <position>]? )',
  '<rect>': 'rect( <rect-arg> )',
  '<rect-arg>': '[ <len> | auto ]#{4} <border-radius-round>?',
  '<relative-size>': 'smaller | larger',
  '<repeat-style>': 'repeat-x | repeat-y | [ repeat | space | round | no-repeat ]{1,2}',
  '<rgb-xyz>': 'srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65',
  '<self-position>': 'center | start | end | self-start | self-end | flex-start | flex-end',
  '<shadow>': 'inset? && [ <len>{2,4} && <color>? ]',
  '<shape-box>': '<box> | margin-box',
  '<shape-radius>': '<len-pct0+> | closest-side | farthest-side',
  '<timing-function>': 'linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end | ' +
    'cubic-bezier( <num0-1> , <num> , <num0-1> , <num> ) | ' +
    'linear( [ <num> && [ <pct>{1,2} ]? ]# ) | ' +
    'steps( <int> [ , [ jump-start | jump-end | jump-none | jump-both | start | end ] ]? )',
  '<text-align>': 'start | end | left | right | center | justify | match-parent',
  '<track-breadth>': '<len-pct> | <flex> | min-content | max-content | auto',
  '<track-list>': '[ <line-names>? [ <track-size> | <track-repeat> ] ]+ <line-names>?',
  '<track-repeat>': 'repeat( [ <int1+> ] , [ <line-names>? <track-size> ]+ <line-names>? )',
  '<track-size>': '<track-breadth> | minmax( <inflexible-breadth> , <track-breadth> ) | ' +
    'fit-content( <len-pct> )',
  '<txbhv>': 'normal | allow-discrete',
  '<url>': '<uri> | src( <string> [ <ident> | <func> ]* )',
  '<vis-hid>': 'visible | hidden',
  '<width>': 'auto | <width-base>',
  '<width-base>': '<len-pct> | min-content | max-content | ' +
    '-moz-available | -webkit-fill-available | fit-content',
  '<width-max>': 'none | <width-base>',
  '<xywh>': 'xywh( <xywh-arg> )',
  '<xywh-arg>': '<len-pct>{2} <len-pct0+>{2} <border-radius-round>?',
};

export default VTComplex;
