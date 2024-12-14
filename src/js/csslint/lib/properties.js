/* eslint-disable max-len */
import {GlobalKeywords} from './util';

const Properties = {
  __proto__: null,
  'accent-color': 'auto | <color>',
  'align-items':
    'normal | stretch | <baseline-position> | [ <overflow-position>? <self-position> ]',
  'align-content': 'normal | <baseline-position> | <content-distribution> | ' +
        '<overflow-position>? <content-position>',
  'align-self':
    'auto | normal | stretch | <baseline-position> | <overflow-position>? <self-position>',
  'all': GlobalKeywords.join(' | '),
  'alignment-baseline': 'auto | baseline | use-script | before-edge | text-before-edge | ' +
    'after-edge | text-after-edge | central | middle | ideographic | alphabetic | ' +
    'hanging | mathematical',
  'animation': '[ <time0+> || <timing-function> || <time> || [ infinite | <num0+> ] || ' +
    '<animation-direction> || <animation-fill-mode> || ' +
    '[ running | paused ] || [ none | <custom-ident> | <string> ] || <animation-timeline> ]#',
  'animation-composition': '[ replace | add | accumulate ]#',
  'animation-delay': '<time>#',
  'animation-direction': '<animation-direction>#',
  'animation-duration': '[ auto | <time0+> ]#',
  'animation-fill-mode': '<animation-fill-mode>#',
  'animation-iteration-count': '[ <num> | infinite ]#',
  'animation-name': '[ none | <keyframes-name> ]#',
  'animation-play-state': '[ running | paused ]#',
  'animation-timeline': '<animation-timeline>#',
  'animation-timing-function': '<timing-function>#',
  'appearance': 'none | auto',
  '-moz-appearance':
    'none | button | button-arrow-down | button-arrow-next | button-arrow-previous | ' +
    'button-arrow-up | button-bevel | button-focus | caret | checkbox | checkbox-container | ' +
    'checkbox-label | checkmenuitem | dualbutton | groupbox | listbox | listitem | ' +
    'menuarrow | menubar | menucheckbox | menuimage | menuitem | menuitemtext | menulist | ' +
    'menulist-button | menulist-text | menulist-textfield | menupopup | menuradio | ' +
    'menuseparator | meterbar | meterchunk | progressbar | progressbar-vertical | ' +
    'progresschunk | progresschunk-vertical | radio | radio-container | radio-label | ' +
    'radiomenuitem | range | range-thumb | resizer | resizerpanel | scale-horizontal | ' +
    'scalethumbend | scalethumb-horizontal | scalethumbstart | scalethumbtick | ' +
    'scalethumb-vertical | scale-vertical | scrollbarbutton-down | scrollbarbutton-left | ' +
    'scrollbarbutton-right | scrollbarbutton-up | scrollbarthumb-horizontal | ' +
    'scrollbarthumb-vertical | scrollbartrack-horizontal | scrollbartrack-vertical | ' +
    'searchfield | separator | sheet | spinner | spinner-downbutton | spinner-textfield | ' +
    'spinner-upbutton | splitter | statusbar | statusbarpanel | tab | tabpanel | tabpanels | ' +
    'tab-scroll-arrow-back | tab-scroll-arrow-forward | textfield | textfield-multiline | ' +
    'toolbar | toolbarbutton | toolbarbutton-dropdown | toolbargripper | toolbox | tooltip | ' +
    'treeheader | treeheadercell | treeheadersortarrow | treeitem | treeline | treetwisty | ' +
    'treetwistyopen | treeview | -moz-mac-unified-toolbar | -moz-win-borderless-glass | ' +
    '-moz-win-browsertabbar-toolbox | -moz-win-communicationstext | ' +
    '-moz-win-communications-toolbox | -moz-win-exclude-glass | -moz-win-glass | ' +
    '-moz-win-mediatext | -moz-win-media-toolbox | -moz-window-button-box | ' +
    '-moz-window-button-box-maximized | -moz-window-button-close | ' +
    '-moz-window-button-maximize | -moz-window-button-minimize | -moz-window-button-restore | ' +
    '-moz-window-frame-bottom | -moz-window-frame-left | -moz-window-frame-right | ' +
    '-moz-window-titlebar | -moz-window-titlebar-maximized',
  '-ms-appearance':
    'none | icon | window | desktop | workspace | document | tooltip | dialog | button | ' +
    'push-button | hyperlink | radio | radio-button | checkbox | menu-item | tab | menu | ' +
    'menubar | pull-down-menu | pop-up-menu | list-menu | radio-group | checkbox-group | ' +
    'outline-tree | range | field | combo-box | signature | password | normal',
  '-webkit-appearance':
    'auto | none | button | button-bevel | caps-lock-indicator | caret | checkbox | ' +
    'default-button | listbox | listitem | media-fullscreen-button | media-mute-button | ' +
    'media-play-button | media-seek-back-button | media-seek-forward-button | media-slider | ' +
    'media-sliderthumb | menulist | menulist-button | menulist-text | menulist-textfield | ' +
    'push-button | radio | searchfield | searchfield-cancel-button | searchfield-decoration | ' +
    'searchfield-results-button | searchfield-results-decoration | slider-horizontal | ' +
    'slider-vertical | sliderthumb-horizontal | sliderthumb-vertical | square-button | ' +
    'textarea | textfield | scrollbarbutton-down | scrollbarbutton-left | ' +
    'scrollbarbutton-right | scrollbarbutton-up | scrollbargripper-horizontal | ' +
    'scrollbargripper-vertical | scrollbarthumb-horizontal | scrollbarthumb-vertical | ' +
    'scrollbartrack-horizontal | scrollbartrack-vertical',
  '-o-appearance':
    'none | window | desktop | workspace | document | tooltip | dialog | button | ' +
    'push-button | hyperlink | radio | radio-button | checkbox | menu-item | tab | menu | ' +
    'menubar | pull-down-menu | pop-up-menu | list-menu | radio-group | checkbox-group | ' +
    'outline-tree | range | field | combo-box | signature | password | normal',
  'aspect-ratio': 'auto || <ratio>',
  'backdrop-filter': '<filter-function-list> | none',
  'backface-visibility': '<vis-hid>',
  'background': '[ <bg-layer> , ]* <final-bg-layer>',
  'background-attachment': '<attachment>#',
  'background-blend-mode': '<blend-mode>',
  'background-clip': '[ <box> | text ]#',
  'background-color': '<color>',
  'background-image': '<bg-image>#',
  'background-origin': '<box>#',
  'background-position': '<bg-position>#',
  'background-position-x': '[ center | [ left | right ]? <len-pct>? ]#',
  'background-position-y': '[ center | [ top | bottom ]? <len-pct>? ]#',
  'background-repeat': '<repeat-style>#',
  'background-size': '<bg-size>#',
  'baseline-shift': 'baseline | sub | super | <len-pct>',
  'baseline-source': 'auto | first | last',
  'block-size': '<width>',
  'border-collapse': 'collapse | separate',
  'border-image': '[ none | <image> ] || <border-image-slice> ' +
    '[ / <border-image-width> | / <border-image-width>? / <border-image-outset> ]? || ' +
    '<border-image-repeat>',
  'border-image-outset': '[ <len> | <num> ]{1,4}',
  'border-image-repeat': '[ stretch | repeat | round | space ]{1,2}',
  'border-image-slice': '<border-image-slice>',
  'border-image-source': '<image> | none',
  'border-image-width': '[ <len-pct> | <num> | auto ]{1,4}',
  'border-spacing': '<len>{1,2}',

  'border-bottom-left-radius': '<len-pct>{1,2}',
  'border-bottom-right-radius': '<len-pct>{1,2}',
  'border-end-end-radius': '<len-pct>{1,2}',
  'border-end-start-radius': '<len-pct>{1,2}',
  'border-radius': '<len-pct0+>{1,4} [ / <len-pct0+>{1,4} ]?',
  'border-start-end-radius': '<len-pct>{1,2}',
  'border-start-start-radius': '<len-pct>{1,2}',
  'border-top-left-radius': '<len-pct>{1,2}',
  'border-top-right-radius': '<len-pct>{1,2}',

  'bottom': '<top>',
  'box-decoration-break': 'slice | clone',
  'box-shadow': 'none | <shadow>#',
  'box-sizing': 'content-box | border-box',
  'break-after': '<break-inside> | always | left | right | page | column',
  'break-before': '<break-after>',
  'break-inside': 'auto | avoid | avoid-page | avoid-column',

  'caret-color': 'auto | <color>',
  'caption-side': 'top | bottom | inline-start | inline-end',
  'clear': 'none | right | left | both | inline-start | inline-end',
  'clip': '<rect> | auto',
  'clip-path': '<url> | [ <basic-shape> || <geometry-box> ] | none',
  'clip-rule': '<fill-rule>',
  'color': '<color>',
  'color-interpolation': 'auto | sRGB | linearRGB',
  'color-interpolation-filters': '<color-interpolation>',
  'color-profile': 1,
  'color-rendering': 'auto | optimizeSpeed | optimizeQuality',
  'color-scheme': 'normal | [ light | dark | <custom-ident> ]+ && only?',
  'column-count': '<int> | auto',
  'column-fill': 'auto | balance',
  'column-gap': 'normal | <len-pct>',
  'column-rule': '<border-shorthand>',
  'column-rule-color': '<color>',
  'column-rule-style': '<border-style>',
  'column-rule-width': '<border-width>',
  'column-span': 'none | all',
  'column-width': '<len> | auto',
  'columns': 1,
  'contain': 'none | strict | content | [ size || layout || style || paint ]',
  'contain-intrinsic-size': '<contain-intrinsic>{1,2}',
  'container': '<container-name> [ / <container-type> ]?',
  'container-name': 'none | <custom-ident>+',
  'container-type': 'normal || [ size | inline-size ]',
  'content': 'normal | none | <content-list> [ / <string> ]?',
  'content-visibility': 'auto | <vis-hid>',
  'counter-increment': '<counter>',
  'counter-reset': '<counter>',
  'counter-set': '<counter>',
  'cursor': '[ [ <url> | image-set() ] [ <num> <num> ]? , ]* ' +
    '[ auto | default | none | context-menu | help | pointer | progress | wait | ' +
    'cell | crosshair | text | vertical-text | alias | copy | move | no-drop | ' +
    'not-allowed | grab | grabbing | e-resize | n-resize | ne-resize | nw-resize | ' +
    's-resize | se-resize | sw-resize | w-resize | ew-resize | ns-resize | ' +
    'nesw-resize | nwse-resize | col-resize | row-resize | all-scroll | ' +
    'zoom-in | zoom-out ]',
  'cx': '<x>',
  'cy': '<x>',

  'd': 1,
  'direction': 'ltr | rtl',
  'display': '[ <display-outside> || <display-inside> ] | ' +
    '<display-listitem> | <display-internal> | <display-box> | <display-legacy> | ' +
    '-webkit-box | -webkit-inline-box | -ms-flexbox', // deprecated and nonstandard
  'dominant-baseline': 'auto | text-bottom | alphabetic | ideographic | middle | central | ' +
    'mathematical | hanging | text-top',

  'empty-cells': 'show | hide',

  'field-sizing': 'fixed | content',
  'fill': '<paint>',
  'fill-opacity': '<num0-1>',
  'fill-rule': 'nonzero | evenodd',
  'filter': '<filter-function-list> | <ie-function> | none',
  'flex': 'none | [ <num>{1,2} || <width> ]',
  'flex-basis': '<width>',
  'flex-direction': 'row | row-reverse | column | column-reverse',
  'flex-flow': '<flex-direction> || <flex-wrap>',
  'flex-grow': '<num>',
  'flex-shrink': '<num>',
  'flex-wrap': 'nowrap | wrap | wrap-reverse',
  'float': 'left | right | none | inline-start | inline-end',
  'flood-color': 1,
  'flood-opacity': '<num0-1>',
  // matching no-pct first because Matcher doesn't retry for a longer match in nested definitions
  'font': '<font-short-tweak-no-pct>? <font-short-core> | ' +
    '[ <font-short-tweak-no-pct> || <pct> ]? <font-short-core> | ' +
    'caption | icon | menu | message-box | small-caption | status-bar',
  'font-family': '[ <generic-family> | <family-name> ]#',
  'font-feature-settings': '[ <ascii4> [ <int0+> | on | off ]? ]# | normal',
  'font-kerning': 'auto | normal | none',
  'font-language-override': 'normal | <string>',
  'font-optical-sizing': 'auto | none',
  'font-palette': 'none | normal | light | dark | <custom-ident>',
  'font-size': '<absolute-size> | <relative-size> | <len-pct0+>',
  'font-size-adjust': '<num> | none',
  'font-stretch': '<font-stretch-named> | <pct>',
  'font-style': 'normal | italic | oblique <angle>?',
  'font-synthesis': 'none | [ weight || style ]',
  'font-synthesis-style': 'auto | none',
  'font-synthesis-weight': 'auto | none',
  'font-synthesis-small-caps': 'auto | none',
  'font-variant': 'normal | none | [ ' +
    '<font-variant-ligatures> || <font-variant-alternates> || ' +
    '<font-variant-caps> || <font-variant-numeric> || <font-variant-east-asian> ]',
  'font-variant-alternates': '<font-variant-alternates> | normal',
  'font-variant-caps': '<font-variant-caps> | normal',
  'font-variant-east-asian': '<font-variant-east-asian> | normal',
  'font-variant-emoji': 'auto | text | emoji | unicode',
  'font-variant-ligatures': '<font-variant-ligatures> | normal | none',
  'font-variant-numeric': '<font-variant-numeric> | normal',
  'font-variant-position': 'normal | sub | super',
  'font-variation-settings': 'normal | [ <string> <num> ]#',
  'font-weight': 'normal | bold | bolder | lighter | <num1-1000>',
  'forced-color-adjust': 'auto | none | preserve-parent-color',

  'gap': '<column-gap>{1,2}',
  'grid':
    '<grid-template> | <grid-template-rows> / [ auto-flow && dense? ] <grid-auto-columns>? | ' +
    '[ auto-flow && dense? ] <grid-auto-rows>? / <grid-template-columns>',
  'grid-area': '<grid-line> [ / <grid-line> ]{0,3}',
  'grid-auto-columns': '<track-size>+',
  'grid-auto-flow': '[ row | column ] || dense',
  'grid-auto-rows': '<track-size>+',
  'grid-column': '<grid-line> [ / <grid-line> ]?',
  'grid-column-end': '<grid-line>',
  'grid-column-gap': -1,
  'grid-column-start': '<grid-line>',
  'grid-gap': -1,
  'grid-row': '<grid-line> [ / <grid-line> ]?',
  'grid-row-end': '<grid-line>',
  'grid-row-gap': -1,
  'grid-row-start': '<grid-line>',
  'grid-template': 'none | [ <grid-template-rows> / <grid-template-columns> ] | ' +
    '[ <line-names>? <string> <track-size>? <line-names>? ]+ [ / <explicit-track-list> ]?',
  'grid-template-areas': 'none | <string>+',
  'grid-template-columns': '<grid-template-rows>',
  'grid-template-rows': 'none | <track-list> | <auto-track-list> | ' +
    'subgrid [ <line-names> | repeat( [ <int1+> | auto-fill ] , <line-names>+ ) ]*',

  'hanging-punctuation': 'none | [ first || [ force-end | allow-end ] || last ]',
  'height': '<width>',
  'hyphenate-character': '<string> | auto',
  'hyphenate-limit-chars': '[ auto | <int> ]{1,3}',
  'hyphens': 'none | manual | auto',

  'image-orientation': 'from-image | none | [ <angle> || flip ]',
  'image-rendering': 'auto | smooth | high-quality | crisp-edges | pixelated | ' +
    'optimizeSpeed | optimizeQuality | -webkit-optimize-contrast',
  'image-resolution': 1,
  'inline-size': '<width>',
  'inset': '<top>{1,4}',
  'inset-block': '<top>{1,2}',
  'inset-block-end': '<top>',
  'inset-block-start': '<top>',
  'inset-inline': '<top>{1,2}',
  'inset-inline-end': '<top>',
  'inset-inline-start': '<top>',
  'isolation': 'auto | isolate',

  'justify-content': 'normal | <content-distribution> | ' +
    '<overflow-position>? [ <content-position> | left | right ]',
  'justify-items': 'normal | stretch | <baseline-position> | ' +
    '[ <overflow-position>? <self-position> ] | ' +
    '[ legacy || [ left | right | center ] ]',
  'justify-self': 'auto | normal | stretch | <baseline-position> | ' +
    '<overflow-position>? [ <self-position> | left | right ]',

  'left': '<top>',
  'letter-spacing': '<len> | normal',
  'lighting-color': '<color>',
  'line-height': '<line-height>',
  'line-break': 'auto | loose | normal | strict | anywhere',
  'list-style': '<list-style-position> || <list-style-image> || <list-style-type>',
  'list-style-image': '<image> | none',
  'list-style-position': 'inside | outside',
  'list-style-type': '<string> | disc | circle | square | decimal | decimal-leading-zero | ' +
    'lower-roman | upper-roman | lower-greek | lower-latin | upper-latin | armenian | ' +
    'georgian | lower-alpha | upper-alpha | none | symbols()',

  'math-depth': 'auto-add | add(<int>) | <int>',
  'math-shift': '<math-style>',
  'math-style': 'normal | compact',
  'margin': '<width>{1,4}',
  'margin-bottom': '<width>',
  'margin-left': '<width>',
  'margin-right': '<width>',
  'margin-top': '<width>',
  'margin-block': '<width>{1,2}',
  'margin-block-end': '<width>',
  'margin-block-start': '<width>',
  'margin-inline': '<width>{1,2}',
  'margin-inline-end': '<width>',
  'margin-inline-start': '<width>',
  'marker': -1,
  'marker-end': 1,
  'marker-mid': 1,
  'marker-start': 1,
  'mask': '[ [ none | <image> ] || <position> [ / <bg-size> ]? || <repeat-style> || ' +
    '<geometry-box> || [ <geometry-box> | no-clip ] || ' +
    '<compositing-operator> || <masking-mode> ]#',
  'mask-border': '<mask-border-source> ||' +
    '<mask-border-slice> [ / <mask-border-width>? [ / <mask-border-outset> ]? ]? ||' +
    '<mask-border-repeat> || <mask-border-mode>',
  'mask-border-mode': '<mask-type>',
  'mask-border-outset': '[ <len> | <num> ]{1,4}',
  'mask-border-repeat': '[ stretch | repeat | round | space ]{1,2}',
  'mask-border-slice': '<num-pct>{1,4} fill?',
  'mask-border-source': 'none | <image>',
  'mask-border-width': '[ <len-pct> | <num> | auto ]{1,4}',
  'mask-clip': '[ <coord-box> | no-clip ]#',
  'mask-composite': '<compositing-operator>#',
  'mask-image': '[ none | <image> ]#',
  'mask-mode': '<masking-mode>#',
  'mask-origin': '<coord-box>#',
  'mask-position': '<position>#',
  'mask-repeat': '<repeat-style>#',
  'mask-size': '<bg-size>#',
  'mask-type': 'luminance | alpha',
  'max-height': '<width-max>',
  'max-width': '<width-max>',
  'min-height': '<width>',
  'min-width': '<width>',
  'max-block-size': '<width-max>',
  'max-inline-size': '<width-max>',
  'min-block-size': '<width>',
  'min-inline-size': '<width>',
  'mix-blend-mode': '<blend-mode>',

  'object-fit': 'fill | contain | cover | none | scale-down',
  'object-position': '<position>',
  'object-view-box': 'none | <inset> | <rect> | <xywh>',
  'offset':
    '[ <offset-position>? <offset-path> [<len-pct> || <offset-rotate>]? | <offset-position> ] ' +
    '[ / <offset-anchor> ]?',
  'offset-anchor': 'auto | <position>',
  'offset-distance': '<len-pct>',
  'offset-path': 'none | [ <ray> | <url> | <basic-shape> ] || <coord-box>',
  'offset-position': 'auto | <position>',
  'offset-rotate': '[ auto | reverse ] || <angle>',
  'opacity': '<num0-1> | <pct>',
  'order': '<int>',
  'orphans': '<int>',
  'outline': '[ <color> | invert ] || [ auto | <border-style> ] || <border-width>',
  'outline-color': '<color> | invert',
  'outline-offset': '<len>',
  'outline-style': '<border-style> | auto',
  'outline-width': '<border-width>',
  'overflow': '<overflow>{1,2}',
  'overflow-anchor': 'auto | none',
  'overflow-block': '<overflow>',
  'overflow-clip-margin': 'visual-box | <len0+>',
  'overflow-inline': '<overflow>',
  'overflow-wrap': 'normal | break-word | anywhere',
  'overflow-x': '<overflow>',
  'overflow-y': '<overflow>',
  'overscroll-behavior': '<overscroll>{1,2}',
  'overscroll-behavior-block': '<overscroll>',
  'overscroll-behavior-inline': '<overscroll>',
  'overscroll-behavior-x': '<overscroll>',
  'overscroll-behavior-y': '<overscroll>',

  'padding': '<len-pct0+>{1,4}',
  'padding-block': '<len-pct0+>{1,2}',
  'padding-block-end': '<len-pct0+>',
  'padding-block-start': '<len-pct0+>',
  'padding-bottom': '<len-pct0+>',
  'padding-inline': '<len-pct0+>{1,2}',
  'padding-inline-end': '<len-pct0+>',
  'padding-inline-start': '<len-pct0+>',
  'padding-left': '<len-pct0+>',
  'padding-right': '<len-pct0+>',
  'padding-top': '<len-pct0+>',
  'page': 'auto | <custom-ident>',
  'page-break-after': 'auto | always | avoid | left | right | recto | verso',
  'page-break-before': '<page-break-after>',
  'page-break-inside': 'auto | avoid',
  'paint-order': 'normal | [ fill || stroke || markers ]',
  'perspective': 'none | <len0+>',
  'perspective-origin': '<position>',
  'place-content': '<align-content> <justify-content>?',
  'place-items': '[ normal | stretch | <baseline-position> | <self-position> ] ' +
    '[ normal | stretch | <baseline-position> | <self-position> ]?',
  'place-self': '<align-self> <justify-self>?',
  'pointer-events': 'auto | none | visiblePainted | visibleFill | visibleStroke | visible | ' +
    'painted | fill | stroke | all',
  'position': 'static | relative | absolute | fixed | sticky',
  'print-color-adjust': 'economy | exact',

  'quotes': 1,

  'r': 1, // SVG
  'rx': '<x> | auto', // SVG
  'ry': '<rx>', // SVG
  'rendering-intent': 1, // SVG
  'resize': 'none | both | horizontal | vertical | block | inline',
  'right': '<top>',
  'rotate': 'none | [ x | y | z | <num>{3} ]? && <angle>',
  'row-gap': '<column-gap>',
  'ruby-align': 1,
  'ruby-position': 1,

  'scale': 'none | <num-pct>{1,3}',
  'scroll-behavior': 'auto | smooth',
  'scroll-margin': '<len>{1,4}',
  'scroll-margin-bottom': '<len>',
  'scroll-margin-left': '<len>',
  'scroll-margin-right': '<len>',
  'scroll-margin-top': '<len>',
  'scroll-margin-block': '<len>{1,2}',
  'scroll-margin-block-end': '<len>',
  'scroll-margin-block-start': '<len>',
  'scroll-margin-inline': '<len>{1,2}',
  'scroll-margin-inline-end': '<len>',
  'scroll-margin-inline-start': '<len>',
  'scroll-padding': '<top>{1,4}',
  'scroll-padding-left': '<top>',
  'scroll-padding-right': '<top>',
  'scroll-padding-top': '<top>',
  'scroll-padding-bottom': '<top>',
  'scroll-padding-block': '<top>{1,2}',
  'scroll-padding-block-end': '<top>',
  'scroll-padding-block-start': '<top>',
  'scroll-padding-inline': '<top>{1,2}',
  'scroll-padding-inline-end': '<top>',
  'scroll-padding-inline-start': '<top>',
  'scroll-snap-align': '[ none | start | end | center ]{1,2}',
  'scroll-snap-stop': 'normal | always',
  'scroll-snap-type': 'none | [ x | y | block | inline | both ] [ mandatory | proximity ]?',
  'scroll-timeline': '[ <scroll-timeline-name> ' +
    '[ <scroll-timeline-axis> || <scroll-timeline-attachment> ]? ]#',
  'scroll-timeline-attachment': '[ local | defer | ancestor ]#',
  'scroll-timeline-axis': '<axis>#',
  'scroll-timeline-name': 'none | <custom-ident>#',
  'scrollbar-color': 'auto | dark | light | <color>{2}',
  'scrollbar-gutter': 'auto | stable && both-edges?',
  'scrollbar-width': 'auto | thin | none',
  'shape-image-threshold': '<num-pct>',
  'shape-margin': '<len-pct>',
  'shape-rendering': 'auto | optimizeSpeed | crispEdges | geometricPrecision',
  'shape-outside': 'none | [ <basic-shape> || <shape-box> ] | <image>',
  'speak': 'auto | never | always',
  'stop-color': 1,
  'stop-opacity': '<num0-1>',
  'stroke': '<paint>',
  'stroke-dasharray': 'none | <dasharray>',
  'stroke-dashoffset': '<len-pct> | <num>',
  'stroke-linecap': 'butt | round | square',
  'stroke-linejoin': 'miter | miter-clip | round | bevel | arcs',
  'stroke-miterlimit': '<num0+>',
  'stroke-opacity': '<num0-1>',
  'stroke-width': '<len-pct> | <num>',

  'table-layout': 'auto | fixed',
  'tab-size': '<num> | <len>',
  'text-align': '<text-align> | justify-all',
  'text-align-last': '<text-align> | auto',
  'text-anchor': 'start | middle | end',
  'text-combine-upright': 'none | all | [ digits <int2-4>? ]',
  'text-decoration': '<text-decoration-line> || <text-decoration-style> || <color>',
  'text-decoration-color': '<color>',
  'text-decoration-line': 'none | [ underline || overline || line-through || blink ]',
  'text-decoration-skip': 'none | auto',
  'text-decoration-skip-ink': 'none | auto | all',
  'text-decoration-style': 'solid | double | dotted | dashed | wavy',
  'text-decoration-thickness': 'auto | from-font | <len-pct>',
  'text-emphasis': '<text-emphasis-style> || <color>',
  'text-emphasis-color': '<color>',
  'text-emphasis-style': 'none | <string> | ' +
    '[ [ filled | open ] || [ dot | circle | double-circle | triangle | sesame ] ]',
  'text-emphasis-position': '[ over | under ] && [ right | left ]?',
  'text-indent': '<len-pct> && hanging? && each-line?',
  'text-justify': 'auto | none | inter-word | inter-character',
  'text-orientation': 'mixed | upright | sideways',
  'text-overflow': 'clip | ellipsis',
  'text-rendering': 'auto | optimizeSpeed | optimizeLegibility | geometricPrecision',
  'text-shadow': 'none | [ <color>? && <len>{2,3} ]#',
  'text-size-adjust': 'auto | none | <pct0+>',
  'text-transform': 'none | [ capitalize|uppercase|lowercase ] || full-width || full-size-kana',
  'text-underline-offset': '<len-pct> | auto',
  'text-underline-position': 'auto | [ under || [ left | right ] ]',
  'text-wrap': 'wrap | nowrap | balance | stable | pretty',
  'top': 'auto | <len-pct>',
  'touch-action':
    'auto | none | pan-x | pan-y | pan-left | pan-right | pan-up | pan-down | manipulation',
  'transform': 'none | <fn:transform>+',
  'transform-box': 'content-box | border-box | fill-box | stroke-box | view-box',
  'transform-origin': '[ left | center | right | <len-pct> ] ' +
    '[ top | center | bottom | <len-pct> ] <len>? | ' +
    '[ left | center | right | top | bottom | <len-pct> ] | ' +
    '[ [ center | left | right ] && [ center | top | bottom ] ] <len>?',
  'transform-style': 'flat | preserve-3d',
  'transition': '[ [ none | [ all | <custom-ident> ]# ] || <time> || <timing-function> || <time> || <txbhv> ]#',
  'transition-behavior': '<txbhv>#',
  'transition-delay': '<time>#',
  'transition-duration': '<time>#',
  'transition-property': 'none | [ all | <custom-ident> ]#',
  'transition-timing-function': '<timing-function>#',
  'translate': 'none | <len-pct> [ <len-pct> <len>? ]?',

  'unicode-range': '<unicode-range>#',
  'unicode-bidi': 'normal | embed | isolate | bidi-override | isolate-override | plaintext',
  'user-select': 'auto | text | none | contain | all',

  'vertical-align': 'auto | use-script | baseline | sub | super | top | text-top | ' +
    'central | middle | bottom | text-bottom | <len-pct>',
  'visibility': '<vis-hid> | collapse',

  'white-space': 'normal | pre | nowrap | pre-wrap | break-spaces | pre-line',
  'widows': '<int>',
  'width': '<width>',
  'will-change': 'auto | <animateable-feature>#',
  'word-break': 'normal | keep-all | break-all | break-word',
  'word-spacing': '<len> | normal',
  'word-wrap': 'normal | break-word | anywhere',
  'writing-mode': 'horizontal-tb | vertical-rl | vertical-lr | ' +
    'lr-tb | rl-tb | tb-rl | bt-rl | tb-lr | bt-lr | lr-bt | rl-bt | lr | rl | tb',

  'x': '<len-pct> | <num>',
  'y': '<x>',
  'z-index': '<int> | auto',
  'zoom': '<num> | <pct> | normal',

  // nonstandard https://compat.spec.whatwg.org/
  '-webkit-box-reflect': '[ above | below | right | left ]? <len>? <image>?',
  '-webkit-text-fill-color': '<color>',
  '-webkit-text-stroke': '<border-width> || <color>',
  '-webkit-text-stroke-color': '<color>',
  '-webkit-text-stroke-width': '<border-width>',
  '-webkit-user-modify': 'read-only | read-write | write-only',
};

for (const [k, reps] of Object.entries({
  'border': '{1,4}',
  'border-bottom': '',
  'border-left': '',
  'border-right': '',
  'border-top': '',
  'border-block': '{1,2}',
  'border-block-end': '',
  'border-block-start': '',
  'border-inline': '{1,2}',
  'border-inline-end': '',
  'border-inline-start': '',
})) {
  Properties[k] = '<border-shorthand>';
  Properties[`${k}-color`] = '<color>' + reps;
  Properties[`${k}-style`] = '<border-style>' + reps;
  Properties[`${k}-width`] = '<border-width>' + reps;
}
for (const k of ['width', 'height', 'block-size', 'inline-size']) {
  Properties[`contain-intrinsic-${k}`] = '<contain-intrinsic>';
}

export default Properties;
