'use strict';

(() => {
  //#region Properties

  const GlobalKeywords = ['initial', 'inherit', 'revert', 'unset'];
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

    'bottom': '<width>',
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

    'fill': '<paint>',
    'fill-opacity': '<num0-1>',
    'fill-rule': 'nonzero | evenodd',
    'filter': '<filter-function-list> | <ie-function> | none',
    'flex': '<flex-shorthand>',
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
    'height': 'auto | <width-height>',
    'hyphenate-character': '<string> | auto',
    'hyphenate-limit-chars': '[ auto | <int> ]{1,3}',
    'hyphens': 'none | manual | auto',

    'image-orientation': 'from-image | none | [ <angle> || flip ]',
    'image-rendering': 'auto | smooth | high-quality | crisp-edges | pixelated | ' +
      'optimizeSpeed | optimizeQuality | -webkit-optimize-contrast',
    'image-resolution': 1,
    'inline-size': '<width>',
    'inset': '<width>{1,4}',
    'inset-block': '<width>{1,2}',
    'inset-block-end': '<width>',
    'inset-block-start': '<width>',
    'inset-inline': '<width>{1,2}',
    'inset-inline-end': '<width>',
    'inset-inline-start': '<width>',
    'isolation': 'auto | isolate',

    'justify-content': 'normal | <content-distribution> | ' +
      '<overflow-position>? [ <content-position> | left | right ]',
    'justify-items': 'normal | stretch | <baseline-position> | ' +
      '[ <overflow-position>? <self-position> ] | ' +
      '[ legacy || [ left | right | center ] ]',
    'justify-self': 'auto | normal | stretch | <baseline-position> | ' +
      '<overflow-position>? [ <self-position> | left | right ]',

    'left': '<width>',
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
      '[ add | subtract | intersect | exclude ] || [ alpha | luminance | match-source ] ]#',
    'mask-image': '[ none | <image> ]#',
    'mask-type': 'luminance | alpha',
    'max-height': 'none | <width-height>',
    'max-width': 'none | <width-height>',
    'min-height': 'auto | <width-height>',
    'min-width': 'auto | <width-height>',
    'max-block-size': '<len-pct> | none',
    'max-inline-size': '<len-pct> | none',
    'min-block-size': '<len-pct>',
    'min-inline-size': '<len-pct>',
    'mix-blend-mode': '<blend-mode>',

    'object-fit': 'fill | contain | cover | none | scale-down',
    'object-position': '<position>',
    'object-view-box': 'none | <inset> | <rect> | <xywh>',
    'offset':
      '[ <offset-position>? <offset-path> [<len-pct> || <offset-rotate>]? | <offset-position> ] ' +
      '[ / <offset-anchor> ]?',
    'offset-anchor': 'auto | <position>',
    'offset-distance': '<len-pct>',
    'offset-path': 'none | [ ray() | <url> | <basic-shape> ] || <coord-box>',
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
    'right': '<width>',
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
    'scroll-padding': '<width>{1,4}',
    'scroll-padding-left': '<width>',
    'scroll-padding-right': '<width>',
    'scroll-padding-top': '<width>',
    'scroll-padding-bottom': '<width>',
    'scroll-padding-block': '<width>{1,2}',
    'scroll-padding-block-end': '<width>',
    'scroll-padding-block-start': '<width>',
    'scroll-padding-inline': '<width>{1,2}',
    'scroll-padding-inline-end': '<width>',
    'scroll-padding-inline-start': '<width>',
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
    'top': '<width>',
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
    'width': 'auto | <width-height>',
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
  const isOwn = Object.call.bind({}.hasOwnProperty);
  const pick = (obj, keys, dst = {}) => keys.reduce((res, k) => (((res[k] = obj[k]), res)), dst);
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

  //#endregion
  //#region Tokens & types

  /**
   * Based on https://www.w3.org/TR/css3-syntax/#lexical
   * Each key is re-assigned to a sequential index, starting with EOF=0.
   * Each value is converted into {name:string, text?:string} and stored as Tokens[index],
   * e.g. AMP:'&' becomes AMP:1 and a new element is added at 1: {name:'AMP', text:'&'}.
   */
  const Tokens = {
    __proto__: null,
    EOF: {}, // must be the first token
    AMP: '&',
    AT: {},
    ATTR_EQ: ['|=', '~=', '^=', '*=', '$='],
    CDCO: {}, // CDO and CDC
    CHAR: {},
    COLON: ':',
    COMBINATOR: ['~', '||'], // "+" and ">" are also math ops
    COMMA: ',',
    COMMENT: {},
    DELIM: '!',
    DOT: '.',
    EQUALS: '=',
    EQ_CMP: ['>=', '<='],
    FUNCTION: {},
    GT: '>',
    HASH: '#',
    IDENT: {},
    INVALID: {},
    LBRACE: '{',
    LBRACKET: '[',
    LPAREN: '(',
    MINUS: '-',
    PIPE: '|',
    PLUS: '+',
    RBRACE: '}',
    RBRACKET: ']',
    RPAREN: ')',
    SEMICOLON: ';',
    STAR: '*',
    STRING: {},
    URANGE: {},
    URI: {},
    UVAR: {}, /*[[userstyles-org-variable]]*/
    WS: {},
    // numbers
    ANGLE: {},
    DIMENSION: {},
    FLEX: {},
    FREQUENCY: {},
    LENGTH: {},
    NUMBER: {},
    PCT: {},
    RESOLUTION: {},
    TIME: {},
  };
  const TokenIdByCode = [];
  for (let id = 0, arr = Object.keys(Tokens), key, val, text; (key = arr[id]); id++) {
    text = ((val = Tokens[key]).slice ? val = {text: val} : val).text;
    Tokens[val.name = key] = id;
    Tokens[id] = val;
    if (text) {
      for (const str of typeof text === 'string' ? [text] : text) {
        if (str.length === 1) TokenIdByCode[str.charCodeAt(0)] = id;
      }
    }
  }
  const {ANGLE, IDENT, LENGTH, NUMBER, PCT, STRING, TIME} = Tokens;

  const Units = {__proto__: null};
  const UnitTypeIds = {__proto__: null};
  for (const [id, units] of [
    [ANGLE, 'deg,grad,rad,turn'],
    [Tokens.FLEX, 'fr'],
    [Tokens.FREQUENCY, 'hz,khz'],
    [LENGTH, 'cap,ch,em,ex,ic,lh,' +
      'rcap,rch,rem,rex,ric,rlh,' +
      'cm,mm,in,pc,pt,px,q,' +
      'cqw,cqh,cqi,cqb,cqmin,cqmax,' + // containers
      'vb,vi,vh,vw,vmin,vmax' +
      'dvb,dvi,dvh,dvw,dvmin,dvmax' +
      'lvb,lvi,lvh,lvw,lvmin,lvmax' +
      'svb,svi,svh,svw,svmin,svmax'],
    [Tokens.RESOLUTION, 'dpcm,dpi,dppx,x'],
    [TIME, 'ms,s'],
  ]) {
    const type = Tokens[id].name.toLowerCase();
    for (const u of units.split(',')) Units[u] = type;
    UnitTypeIds[type] = id;
  }

  const Combinators = [];
  /*  \t   */ Combinators[9] =
  /*  \n   */ Combinators[10] =
  /*  \f   */ Combinators[12] =
  /*  \r   */ Combinators[13] =
  /*  " "  */ Combinators[32] = 'descendant';
  /*   >   */ Combinators[62] = 'child';
  /*   +   */ Combinators[43] = 'adjacent-sibling';
  /*   ~   */ Combinators[126] = 'sibling';
  /*  ||   */ Combinators[124] = 'column';

  /** Much faster than flat array or regexp */
  class Bucket {
    constructor(src) {
      this.addFrom(src);
    }
    /**
     * @param {string|string[]} src - length < 100
     * @return {Bucket}
     */
    addFrom(src) {
      for (let str of typeof src === 'string' ? [src] : src) {
        let c = (str = str.toLowerCase()).charCodeAt(0);
        if (c === 34 /* " */) c = (str = str.slice(1, -1)).charCodeAt(0);
        src = this[c = c * 100 + str.length];
        if (src == null) this[c] = str;
        else if (typeof src === 'string') this[c] = [src, str];
        else src.push(str);
      }
      return this;
    }
    /** @return {string} */
    join(sep) {
      let res = '';
      for (const v of Object.values(this)) {
        res += `${res ? sep : ''}${typeof v === 'string' ? v : v.join(sep)}`;
      }
      return res;
    }
    /**
     * @param {Token} tok
     * @param {number} [c] - first char code
     * @param {string} [lowText] - text to use instead of token's text
     * @return {boolean | any}
     */
    has(tok, c = tok.code, lowText) {
      const len = (lowText || tok).length;
      if (!isOwn(this, c = c * 100 + len)) return false;
      if (len === 1) return true;
      const val = this[c];
      const low = lowText || tok.lowText || (tok.lowText = tok.text.toLowerCase());
      return typeof val === 'string' ? val === low : val.includes(low);
    }
  }

  /**
   * CSS2 system colors: https://www.w3.org/TR/css3-color/#css2-system
   * CSS4 system colors: https://drafts.csswg.org/css-color-4/#css-system-colors
   */
  const NamedColors = ('currentColor,transparent,' +
    'aliceblue,antiquewhite,aqua,aquamarine,azure,' +
    'beige,bisque,black,blanchedalmond,blue,blueviolet,brown,burlywood,' +
    'cadetblue,chartreuse,chocolate,coral,cornflowerblue,cornsilk,crimson,cyan,' +
    'darkblue,darkcyan,darkgoldenrod,darkgray,darkgrey,darkgreen,darkkhaki,' +
    'darkmagenta,darkolivegreen,darkorange,darkorchid,darkred,darksalmon,' +
    'darkseagreen,darkslateblue,darkslategray,darkslategrey,darkturquoise,' +
    'darkviolet,deeppink,deepskyblue,dimgray,dimgrey,dodgerblue,' +
    'firebrick,floralwhite,forestgreen,fuchsia,' +
    'gainsboro,ghostwhite,gold,goldenrod,gray,grey,green,greenyellow,' +
    'honeydew,hotpink,indianred,indigo,ivory,khaki,' +
    'lavender,lavenderblush,lawngreen,lemonchiffon,lightblue,lightcoral,lightcyan,' +
    'lightgoldenrodyellow,lightgray,lightgrey,lightgreen,lightpink,lightsalmon,lightseagreen,' +
    'lightskyblue,lightslategray,lightslategrey,lightsteelblue,lightyellow,lime,limegreen,linen,' +
    'magenta,maroon,mediumaquamarine,mediumblue,mediumorchid,mediumpurple,mediumseagreen,' +
    'mediumslateblue,mediumspringgreen,mediumturquoise,mediumvioletred,' +
    'midnightblue,mintcream,mistyrose,moccasin,navajowhite,navy,' +
    'oldlace,olive,olivedrab,orange,orangered,orchid,' +
    'palegoldenrod,palegreen,paleturquoise,palevioletred,' +
    'papayawhip,peachpuff,peru,pink,plum,powderblue,purple,' +
    'rebeccapurple,red,rosybrown,royalblue,' +
    'saddlebrown,salmon,sandybrown,seagreen,seashell,sienna,silver,' +
    'skyblue,slateblue,slategray,slategrey,snow,springgreen,steelblue,' +
    'tan,teal,thistle,tomato,turquoise,violet,wheat,white,whitesmoke,yellow,yellowgreen,' +
    'ActiveBorder,ActiveCaption,ActiveText,AppWorkspace,' +
    'Background,ButtonBorder,ButtonFace,ButtonHighlight,ButtonShadow,ButtonText,' +
    'Canvas,CanvasText,CaptionText,Field,FieldText,GrayText,Highlight,HighlightText,' +
    'InactiveBorder,InactiveCaption,InactiveCaptionText,InfoBackground,InfoText,' +
    'LinkText,Mark,MarkText,Menu,MenuText,Scrollbar,ThreeDDarkShadow,ThreeDFace,ThreeDHighlight,' +
    'ThreeDLightShadow,ThreeDShadow,VisitedText,Window,WindowFrame,WindowText').split(',');
  const buAlpha = new Bucket('alpha');
  const buGlobalKeywords = new Bucket(GlobalKeywords);
  const rxAltSep = /\s*\|\s*/;

  //#endregion
  //#region Grammar

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
    '<coord-box>': '<box> | <box-fsv>',
    '<contain-intrinsic>': 'auto? [ none | <len> ]',
    '<content-distribution>': 'space-between | space-around | space-evenly | stretch',
    '<content-list>':
      '[ <string> | <image> | <attr> | ' +
      'content( text | before | after | first-letter | marker ) | ' +
      'counter() | counters() | leader() | ' +
      'open-quote | close-quote | no-open-quote | no-close-quote | ' +
      'target-counter() | target-counters() | target-text() ]+',
    '<content-position>': 'center | start | end | flex-start | flex-end',
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
    '<flex-shorthand>': 'none | [ <num>{1,2} || <width> ]',
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
    '<width-height>': '<len-pct> | min-content | max-content | fit-content | ' +
      '-moz-available | -webkit-fill-available | fit-content( <len-pct> )',
    '<xywh>': 'xywh( <xywh-arg> )',
    '<xywh-arg>': '<len-pct>{2} <len-pct0+>{2} <border-radius-round>?',
  };

  const VTFunctions = {
    color: {
      __proto__: null,
      'color-mix': 'in [ srgb | srgb-linear | lab | oklab | xyz | xyz-d50 | xyz-d65 ' +
        '| [ hsl | hwb | lch | oklch ] [ [ shorter | longer | increasing | decreasing ] hue ]? ' +
        '] , [ <color> && <pct0-100>? ]#{2}',
      'color': 'from <color> [ ' +
          '<custom-prop> [ <num-pct-none> <custom-ident> ]# | ' +
          '<rgb-xyz> [ <num-pct-none> | r | g | b | x | y | z ]{3} ' +
        '] [ / <num-pct-none> | r | g | b | x | y | z ]? | ' +
        '[ <rgb-xyz> <num-pct-none>{3} | <custom-prop> <num-pct-none># ] <alpha>?',
      'hsl': '<hue> , <pct>#{2} [ , <num-pct0+> ]? | ' +
        '[ <hue> | none ] <num-pct-none>{2} <alpha>? | ' +
        'from <color> [ <hue> | <rel-hsl> ] <rel-hsl-num-pct>{2} [ / <rel-hsl-num-pct> ]?',
      'hwb': '[ <hue> | none ] <num-pct-none>{2} <alpha>? | ' +
        'from <color> [ <hue> | <rel-hwb> ] <rel-hwb-num-pct>{2} [ / <rel-hwb-num-pct> ]?',
      'lab': '<num-pct-none>{3} <alpha>? | ' +
        'from <color> <rel-lab-num-pct>{3} [ / <rel-lab-num-pct> ]?',
      'lch': '<num-pct-none>{2} [ <hue> | none ] <alpha>? | ' +
        'from <color> <rel-lch-num-pct>{2} [ <hue> | <rel-lch> ] [ / <rel-lch-num-pct> ]?',
      'rgb': '[ <num>#{3} | <pct>#{3} ] [ , <num-pct0+> ]? | ' +
        '<num-pct-none>{3} <alpha>? | ' +
        'from <color> <rel-rgb-num-pct>{3} [ / <rel-rgb-num-pct> ]?',
    },
    filter: {
      __proto__: null,
      'blur': '<len>?',
      'brightness': '<num-pct>?',
      'contrast': '<num-pct>?',
      'drop-shadow': '[ <len>{2,3} && <color>? ]?',
      'grayscale': '<num-pct>?',
      'hue-rotate': '<angle-or-0>?',
      'invert': '<num-pct>?',
      'opacity': '<num-pct>?',
      'saturate': '<num-pct>?',
      'sepia': '<num-pct>?',
    },
    basicShape: {
      'circle': '<shape-radius> [ at <position> ]?',
      'ellipse': '[ <shape-radius>{2} ]? [ at <position> ]?',
      'inset': '<inset-arg>',
      'path': '[ <fill-rule> , ]? <string>',
      'polygon': '[ <fill-rule> , ]? [ <len-pct> <len-pct> ]#',
      'rect': '<rect-arg>',
      'xywh': '<xywh-arg>',
    },
    transform: {
      __proto__: null,
      matrix: '<num>#{6}',
      matrix3d: '<num>#{16}',
      perspective: '<len0+> | none',
      rotate: '<angle-or-0> | none',
      rotate3d: '<num>#{3} , <angle-or-0>',
      rotateX: '<angle-or-0>',
      rotateY: '<angle-or-0>',
      rotateZ: '<angle-or-0>',
      scale: '[ <num-pct> ]#{1,2} | none',
      scale3d: '<num-pct>#{3}',
      scaleX: '<num-pct>',
      scaleY: '<num-pct>',
      scaleZ: '<num-pct>',
      skew: '<angle-or-0> [ , <angle-or-0> ]?',
      skewX: '<angle-or-0>',
      skewY: '<angle-or-0>',
      translate: '<len-pct>#{1,2} | none',
      translate3d: '<len-pct>#{2} , <len>',
      translateX: '<len-pct>',
      translateY: '<len-pct>',
      translateZ: '<len>',
    },
  };
  {
    let obj = VTFunctions.color;
    for (const k of ['hsl', 'rgb']) obj[k + 'a'] = obj[k];
    for (const k of ['lab', 'lch']) obj['ok' + k] = obj[k];
    obj = VTFunctions.transform;
    for (const key in obj) {
      const low = key.toLowerCase();
      if (low !== key) Object.defineProperty(obj, low, {value: obj[key], writable: true});
    }
  }

  const VTSimple = {
    __proto__: null,
    '<animateable-feature-name>': customIdentChecker('will-change,auto,scroll-position,contents'),
    '<angle>': p => p.isCalc || p.id === ANGLE,
    '<angle-or-0>': p => p.isCalc || p.is0 || p.id === ANGLE,
    '<ascii4>': p => p.id === STRING && p.length === 4 && !/[^\x20-\x7E]/.test(p.text),
    '<attr>': p => p.isAttr,
    '<custom-ident>': p => p.id === IDENT && !buGlobalKeywords.has(p),
    '<custom-prop>': p => p.type === 'custom-prop',
    '<flex>': p => p.isCalc || p.units === 'fr' && p.number >= 0,
    '<func>': p => p.type === 'fn',
    '<hue>': p => p.isCalc || p.id === NUMBER || p.id === ANGLE,
    '<ident>': p => p.id === IDENT,
    '<ident-for-grid>': customIdentChecker('span,auto'),
    '<ident-not-none>': p => p.id === IDENT && !p.isNone,
    '<ie-function>': p => p.ie,
    '<int>': p => p.isCalc || p.isInt,
    '<int0-1>': p => p.isCalc || p.is0 || p.isInt && p.number === 1,
    '<int0+>': p => p.isCalc || p.isInt && p.number >= 0,
    '<int1+>': p => p.isCalc || p.isInt && p.number > 0,
    '<int2-4>': p => p.isCalc || p.isInt && (p = p.number) >= 2 && p <= 4,
    '<len>': p => p.isCalc || p.is0 || p.id === LENGTH,
    '<len0+>': p => p.isCalc || p.is0 || p.id === LENGTH && p.number >= 0,
    '<len-pct>': p => p.isCalc || p.is0 || p.id === LENGTH || p.id === PCT,
    '<len-pct0+>': p => p.isCalc || p.is0 || p.number >= 0 && (p.id === PCT || p.id === LENGTH),
    '<named-or-hex-color>': p => p.type === 'color',
    '<num>': p => p.isCalc || p.id === NUMBER,
    '<num0+>': p => p.isCalc || p.id === NUMBER && p.number >= 0,
    '<num0-1>': p => p.isCalc || p.id === NUMBER && (p = p.number) >= 0 && p <= 1,
    '<num1-1000>': p => p.isCalc || p.id === NUMBER && (p = p.number) >= 1 && p <= 1000,
    '<num-pct>': p => p.isCalc || p.id === NUMBER || p.id === PCT,
    '<num-pct0+>': p => p.isCalc || p.number >= 0 && (p.id === NUMBER || p.id === PCT),
    '<num-pct-none>': p => p.isCalc || p.isNone || p.id === NUMBER || p.id === PCT,
    '<pct>': p => p.isCalc || p.is0 || p.id === PCT,
    '<pct0+>': p => p.isCalc || p.is0 || p.number >= 0 && p.id === PCT,
    '<pct0-100>': p => p.isCalc || p.is0 || p.id === PCT && (p = p.number) >= 0 && p <= 100,
    '<keyframes-name>': customIdentChecker('', p => p.id === STRING),
    '<resolution>': p => p.id === Tokens.RESOLUTION,
    '<string>': p => p.id === STRING,
    '<time>': p => p.isCalc || p.id === TIME,
    '<time0+>': p => p.isCalc || p.id === TIME && p.number >= 0,
    '<unicode-range>': p => p.id === Tokens.URANGE,
    '<uri>': p => p.uri != null,
    '<width>': p => p.isAuto || p.isCalc || p.is0 || p.id === LENGTH || p.id === PCT,
  };
  for (const type of ['hsl', 'hwb', 'lab', 'lch', 'rgb']) {
    const letters = {};
    for (let i = 0; i < type.length;) letters[type.charCodeAt(i++)] = 1;
    VTSimple[`<rel-${type}>`] = p => p.isNone
      || (p.length === 1 ? isOwn(letters, p.code) : p.length === 5 && buAlpha.has(p));
    VTSimple[`<rel-${type}-num-pct>`] = p => p.isNone
      || p.isCalc || p.id === NUMBER || p.id === PCT
      || (p.length === 1 ? isOwn(letters, p.code) : p.length === 5 && buAlpha.has(p));
  }

  //#endregion
  //#region StringSource

  class StringSource {

    constructor(text) {
      // https://www.w3.org/TR/css-syntax-3/#input-preprocessing
      this._break = (
        this.string = text.replace(/\r\n?|\f/g, '\n')
      ).indexOf('\n');
      this.line = 1;
      this.col = 1;
      this.offset = 0;
    }
    eof() {
      return this.offset >= this.string.length;
    }
    /** @return {number} */
    peek(distance = 1) {
      return this.string.charCodeAt(this.offset + distance - 1);
    }
    mark() {
      this._bookmark = {o: this.offset, l: this.line, c: this.col, b: this._break};
    }
    reset() {
      const b = this._bookmark;
      if (b) {
        ({o: this.offset, l: this.line, c: this.col, b: this._break} = b);
        this._bookmark = null;
      }
    }
    /**
     * Reads characters that match either text or a regular expression and returns those characters.
     * If a match is found, the row and column are adjusted.
     * @param {RegExp} m - must be `sticky`
     * @param {boolean} [asRe]
     * @return {string|RegExpExecArray|void}
     */
    readMatch(m, asRe) {
      const res = (m.lastIndex = this.offset, m.exec(this.string));
      if (res) return (m = res[0]) && this.read(m.length, m) && (asRe ? res : m);
    }
    /** @param {number} code */
    readMatchCode(code) {
      if (code === this.string.charCodeAt(this.offset)) {
        return this.read();
      }
    }
    /** @param {string} m */
    readMatchStr(m) {
      const len = m.length;
      const {offset: i, string: str} = this;
      if (!len || str.charCodeAt(i) === m.charCodeAt(0) && (
        len === 1 ||
        str.charCodeAt(i + len - 1) === m.charCodeAt(len - 1) && str.substr(i, len) === m
      )) {
        return m && this.read(len, m);
      }
    }
    /**
     * Reads a given number of characters. If the end of the input is reached,
     * it reads only the remaining characters and does not throw an error.
     * @param {number} count The number of characters to read.
     * @param {string} [text] Use an already extracted text and only increment the cursor
     * @return {string}
     */
    read(count = 1, text) {
      let {offset: i, _break: br, string} = this;
      if (count <= 0 || text == null && !(text = string.substr(i, count))) return '';
      this.offset = i += (count = text.length); // may be less than requested
      if (i <= br || br < 0) {
        this.col += count;
      } else {
        let brPrev;
        let {line} = this;
        do ++line; while ((br = string.indexOf('\n', (brPrev = br) + 1)) >= 0 && br < i);
        this._break = br;
        this.line = line;
        this.col = i - brPrev;
      }
      return text;
    }
    /** @return {number|undefined} */
    readCode() {
      const c = this.string.charCodeAt(this.offset++);
      if (c === 10) {
        this.col = 1;
        this.line++;
        this._break = this.string.indexOf('\n', this.offset);
      } else if (c >= 0) { // fast NaN check
        this.col++;
      } else {
        this.offset--; // restore EOF
        return;
      }
      return c;
    }
  }

  //#endregion
  //#region EventTarget

  class EventTarget {
    constructor() {
      /** @type {Record<string,Set>} */
      this._listeners = {__proto__: null};
    }
    addListener(type, fn) {
      (this._listeners[type] || (this._listeners[type] = new Set())).add(fn);
    }
    fire(event) {
      const type = typeof event === 'object' && event.type;
      const list = this._listeners[type || event];
      if (!list) return;
      if (!type) event = {type};
      list.forEach(fn => fn(event));
    }
    removeListener(type, fn) {
      const list = this._listeners[type];
      if (list) list.delete(fn);
    }
  }

  //#endregion
  //#region Matcher

  const rxAndAndSep = /\s*&&\s*/y;
  const rxBraces = /{\s*(\d+)\s*(?:(,)\s*(?:(\d+)\s*)?)?}/y; // {n,} = {n,Infinity}
  const rxFuncBegin = /([-\w]+)\(\s*(\))?/y;
  const rxFuncEnd = /\s*\)/y;
  const rxGroupBegin = /\[\s*/y;
  const rxGroupEnd = /\s*]/y;
  const rxOrOrSep = /\s*\|\|\s*/y;
  const rxOrSep = /\s*\|(?!\|)\s*/y;
  const rxPlainTextAlt = /[-\w]+(?:\s*\|\s*[-\w]+)*(?=\s*\|(?!\|)\s*|\s*]|\s+\)|\s*$)/y;
  const rxSeqSep = /\s+(?![&|)\]])/y;
  const rxTerm = /<[^>\s]+>|"[^"]*"|'[^']*'|[^\s?*+#{}()[\]|&]+/y;

  /**
   * This class implements a combinator library for matcher functions.
   * https://developer.mozilla.org/docs/Web/CSS/Value_definition_syntax#Component_value_combinators
   */
  class Matcher {
    /**
     * @param {(this: Matcher, expr: PropValueIterator, p?: Token) => boolean} matchFunc
     * @param {string|function} toString
     * @param {?} [arg]
     * @param {boolean} [isMeta] - true for alt/seq/many/braces that control matchers
     */
    constructor(matchFunc, toString, arg, isMeta) {
      this.matchFunc = matchFunc;
      if (arg != null) this.arg = arg;
      if (isMeta) this.isMeta = isMeta;
      if (toString.call) this.toString = toString; else this._string = toString;
    }
    /**
     * @param {PropValueIterator} expr
     * @param {Token} [p]
     * @return {boolean}
     */
    match(expr, p) {
      const {i} = expr; if (!p && !(p = expr.parts[i])) return this.arg.min === 0;
      const isMeta = this.isMeta;
      const res = !isMeta && p.isVar ||
        this.matchFunc(expr, p) ||
        !isMeta && expr.tryAttr && p.isAttr;
      if (!res) expr.i = i;
      else if (!isMeta && expr.i < expr.parts.length) ++expr.i;
      return res;
    }
    toString() {
      return this._string;
    }
    /** Matcher for one or more juxtaposed words, which all must occur, in the given order. */
    static alt(ms) {
      let str; // Merging stringArray hubs
      for (let SAT = Matcher.stringArrTest, m, i = 0; (m = ms[i]);) {
        if (m.matchFunc === SAT) {
          str = (str ? str + ' | ' : '') + m._string;
          ms.splice(i, 1);
        } else i++;
      }
      if (str) ms.unshift(Matcher.term(str));
      return !ms[1] ? ms[0] : new Matcher(Matcher.altTest, Matcher.altToStr, ms, true);
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {Token} p
     * @return {!boolean|void}
     */
    static altTest(expr, p) {
      for (let i = 0, m; (m = this.arg[i++]);) {
        if (m.match(expr, p)) return true;
      }
    }
    /** @this {Matcher} */
    static altToStr(prec) {
      return (prec = prec > Matcher.ALT ? '[ ' : '') +
        this.arg.map(m => m.toString(Matcher.ALT)).join(' | ') +
        (prec ? ' ]' : '');
    }
    braces(min, max, marker, sep) {
      return new Matcher(Matcher.bracesTest, Matcher.bracesToStr, {
        m: this,
        min, max, marker,
        sep: sep && Matcher.seq([sep.matchFunc ? sep : Matcher.term(sep), this]),
      }, true);
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {Token} p
     * @return {!boolean|number}
     */
    static bracesTest(expr, p) {
      let i = 0;
      const {min, max, sep, m} = this.arg;
      while (i < max && (i && sep || m).match(expr, p)) {
        p = undefined; // clearing because expr points to the next part now
        i++;
      }
      return i >= min && (i || true);
    }
    /** @this {Matcher} */
    static bracesToStr() {
      const {marker, min, max, m} = this.arg;
      return m.toString(Matcher.MOD) + (marker || '') + (
        !marker || marker === '#' && !(min === 1 || max === Infinity)
          ? `{${min}${min === max ? '' : `,${max === Infinity ? '' : max}`}}`
          : '');
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {Token} p
     * @return {!boolean|number|void}
     */
    static funcTest(expr, p) {
      const pn = p.name; if (!pn) return;
      const pnv = (p.prefix || '') + pn;
      const {name, body, list} = this.arg;
      const m = list ? list[pn] || list[pnv]
        : name === pn || name === pnv ? (body || '')
          : null; if (m == null) return;
      const e = p.expr; if (!e && m) return m.arg.min === 0;
      const vi = m && !e.isVar && new PropValueIterator(e); // eslint-disable-line no-use-before-define
      const mm = !vi || m.matchFunc ? m :
        list[pn] = (m.call ? m(Matcher) : Matcher.cache[m] || Matcher.parse(m));
      return !vi || mm.match(vi) && vi.i >= vi.parts.length || !(expr.badFunc = [e, mm]);
    }
    /** @this {Matcher} */
    static funcToStr(prec) {
      const {name, body, list} = this.arg;
      return name ? `${name}(${body ? ` ${body} ` : ''})` :
        (prec = prec > Matcher.ALT ? '[ ' : '') +
        Object.keys(list).join('() | ') +
        (prec ? '() ]' : '()');
    }
    static many(req, ms) {
      if (!ms[1]) return ms[0];
      const m = new Matcher(Matcher.manyTest, Matcher.manyToStr, ms, true);
      m.req = req === true ? Array(ms.length).fill(true) :
        req == null ? ms.map(m => !m.arg || m.arg.marker !== '?')
          : req;
      return m;
    }
    /**
     * Matcher for two or more options: double bar (||) and double ampersand (&&) operators,
     * as well as variants of && where some of the alternatives are optional.
     * This will backtrack through even successful matches to try to
     * maximize the number of items matched.
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @return {!boolean}
     */
    static manyTest(expr) {
      const state = [];
      state.expr = expr;
      state.max = 0;
      // If couldn't get a complete match, retrace our steps to make the
      // match with the maximum # of required elements.
      if (!this.manyTestRun(state, 0)) this.manyTestRun(state, 0, true);
      if (!this.req) return state.max > 0;
      // Use finer-grained specification of which matchers are required.
      for (let i = 0; i < this.req.length; i++) {
        if (this.req[i] && !state[i]) return false;
      }
      return true;
    }
    manyTestRun(state, count, retry) {
      for (let i = 0, {expr} = state, ms = this.arg, m, ei, x; (m = ms[i]); i++) {
        if (!state[i] && (
          (ei = expr.i) + 1 > expr.parts.length ||
          (x = m.match(expr)) && (x > 1 || x === 1 || m.arg.min !== 0)
          // Seeing only real matches e.g. <foo> inside <foo>? or <foo>* or <foo>#{0,n}
          // Not using `>=` because `true>=1` and we don't want booleans here
        )) {
          state[i] = true;
          if (this.manyTestRun(state, count + (!this.req || this.req[i] ? 1 : 0), retry)) {
            return true;
          }
          state[i] = false;
          expr.i = ei;
        }
      }
      if (retry) return count === state.max;
      state.max = Math.max(state.max, count);
      return count === this.arg.length;
    }
    /** @this {Matcher} */
    static manyToStr(prec) {
      const {req} = this;
      const p = Matcher[req ? 'ANDAND' : 'OROR'];
      const s = this.arg.map((m, i) =>
        !req || req[i]
          ? m.toString(p)
          : m.toString(Matcher.MOD).replace(/[^?]$/, '$&?')
      ).join(req ? ' && ' : ' || ');
      return prec > p ? `[ ${s} ]` : s;
    }
    /** Simple recursive-descent parseAlt to build matchers from strings. */
    static parse(str) {
      const source = new StringSource(str);
      const res = Matcher.parseAlt(source);
      if (!source.eof()) {
        const {offset: i, string} = source;
        throw new Error(`Internal grammar error. Unexpected "${
          clipString(string.slice(i, 31), 30)}" at position ${i} in "${string}".`);
      }
      Matcher.cache[str] = res;
      return res;
    }
    /**
     * ALT: OROR [ " | " OROR ]*  (exactly one matches)
     * OROR: ANDAND [ " || " ANDAND ]*  (at least one matches in any order)
     * ANDAND: SEQ [ " && " SEQ ]*  (all match in any order)
     * SEQ: TERM [" " TERM]*  (all match in specified order)
     * TERM: [ "<" type ">" | literal | "[ " ALT " ]" | fn "()" | fn "( " ALT " )" ] MOD?
     * MOD: "?" | "*" | "+" | "#" | [ "{" | "#{" ] <num>[,[<num>]?]? "}" ]
     * The specified literal spaces like " | " are optional except " " in SEQ (i.e. \s+)
     * @param {StringSource} src
     * @return {Matcher}
     */
    static parseAlt(src) {
      const alts = [];
      do {
        const pt = src.readMatch(rxPlainTextAlt);
        if (pt) {
          alts.push(Matcher.term(pt));
        } else {
          const ors = [];
          do {
            const ands = [];
            do {
              const seq = [];
              do seq.push(Matcher.parseTerm(src));
              while (src.readMatch(rxSeqSep));
              ands.push(Matcher.seq(seq));
            } while (src.readMatch(rxAndAndSep));
            ors.push(Matcher.many(null, ands));
          } while (src.readMatch(rxOrOrSep));
          alts.push(Matcher.many(false, ors));
        }
      } while (src.readMatch(rxOrSep));
      return Matcher.alt(alts);
    }
    /**
     * @param {StringSource} src
     * @return {Matcher}
     */
    static parseTerm(src) {
      let m, fn;
      if (src.readMatch(rxGroupBegin)) {
        m = Matcher.parseAlt(src);
        if (!src.readMatch(rxGroupEnd)) Matcher.parsingFailed(src, rxGroupEnd);
      } else if ((fn = src.readMatch(rxFuncBegin, true))) {
        m = new Matcher(Matcher.funcTest, Matcher.funcToStr, {
          name: fn[1].toLowerCase(),
          body: !fn[2] && Matcher.parseAlt(src),
        });
        if (!fn[2] && !src.readMatch(rxFuncEnd)) Matcher.parsingFailed(src, rxFuncEnd);
      } else {
        m = Matcher.term(src.readMatch(rxTerm) || Matcher.parsingFailed(src, rxTerm));
      }
      fn = src.peek();
      if (fn === 123/* { */ || fn === 35/* # */ && src.peek(2) === 123) {
        const hash = fn === 35 ? src.read() : '';
        const [, a, comma, b = comma ? Infinity : a] = src.readMatch(rxBraces, true)
          || Matcher.parsingFailed(src, rxBraces);
        return m.braces(+a, +b, hash, hash && ',');
      }
      switch (fn) {
        case 63: /* ? */ return m.braces(0, 1, src.read());
        case 42: /* * */ return m.braces(0, Infinity, src.read());
        case 43: /* + */ return m.braces(1, Infinity, src.read());
        case 35: /* # */ return m.braces(1, Infinity, src.read(), ',');
      }
      return m;
    }
    /**
     * @param {StringSource} src
     * @param {RegExp|string} m
     * @throws
     */
    static parsingFailed(src, m) {
      throw new Error('Internal grammar error. ' +
        `Expected ${m} at ${src.offset} in ${src.string}`);
    }
    static seq(ms) {
      return !ms[1] ? ms[0] : new Matcher(Matcher.seqTest, Matcher.seqToStr, ms, true);
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {Token} p
     * @return {!boolean|void}
     */
    static seqTest(expr, p) {
      let min1, i, m, res;
      for (i = 0; (m = this.arg[i++]); p = undefined) {
        if (!(res = m.match(expr, p))) return;
        if (!min1 && (m.arg.min !== 0 || res === 1 || res > 1)) min1 = true;
        // a number >= 1 is returned only from bracesTest
      }
      return true;
    }
    /** @this {Matcher} */
    static seqToStr(prec) {
      return (prec = prec > Matcher.SEQ ? '[ ' : '') +
        this.arg.map(m => m.toString(Matcher.SEQ)).join(' ') +
        (prec ? ' ]' : '');
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {Token} p
     * @return {!boolean}
     */
    static simpleTest(expr, p) {
      return !!this.arg(p);
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {Token} p
     * @return {!boolean|void}
     */
    static stringArrTest(expr, p) {
      // If the bucket has -vendor-prefixed-text we will use the token as-is without unprefixing it
      return this.arg.has(p) || p.vendorCode &&
        (expr = this.arg[p.vendorCode * 100 + p.length - p.vendorPos]) &&
        (p = p.text.slice(p.vendorPos).toLowerCase()) &&
        (typeof expr === 'string' ? expr === p : expr.includes(p));
    }
    /** @this {Matcher} */
    static stringArrToStr(prec) {
      return (prec = prec > Matcher.ALT && this._string.includes(' ') ? '[ ' : '') +
        this._string + (prec ? ' ]' : '');
    }
    /** Matcher for a single type */
    static term(str) {
      const origStr = str;
      let m = Matcher.cache[str = str.toLowerCase()]; if (m) return m;
      if (str[0] !== '<') {
        m = new Matcher(Matcher.stringArrTest, Matcher.stringArrToStr,
          new Bucket(str.split(rxAltSep)));
        m._string = str;
      } else if (str.startsWith('<fn:')) {
        m = new Matcher(Matcher.funcTest, Matcher.funcToStr, {list: VTFunctions[origStr.slice(4, -1)]});
      } else if ((m = VTSimple[str])) {
        m = new Matcher(Matcher.simpleTest, str, m);
      } else {
        m = VTComplex[str] || Properties[str.slice(1, -1)];
        m = m.matchFunc ? m : m.call ? m(Matcher) : Matcher.cache[m] || Matcher.parse(m);
        if (str === '<url>') { m._string = str; delete m.toString; }
      }
      Matcher.cache[str] = m;
      return m;
    }
  }

  /** @type {{[key:string]: Matcher}} */
  Matcher.cache = {__proto__:null};
  // Precedence of combinators.
  Matcher.MOD = 5;
  Matcher.SEQ = 4;
  Matcher.ANDAND = 3;
  Matcher.OROR = 2;
  Matcher.ALT = 1;

  //#endregion
  //#region Validation

  const validationCache = new Map();

  /** @property {Array} [badFunc] */
  class PropValueIterator {
    /** @param {TokenValue} value */
    constructor(value) {
      this.i = 0;
      this.parts = value.parts;
      this.value = value;
    }
    get hasNext() {
      return this.i + 1 < this.parts.length;
    }
    /** @returns {?Token} */
    next() {
      if (this.i < this.parts.length) return this.parts[++this.i];
    }
  }

  class ValidationError extends Error {
    constructor(message, pos) {
      super();
      this.col = pos.col;
      this.line = pos.line;
      this.offset = pos.offset;
      this.message = message;
    }
  }

  /**
   * @param {Token} tok
   * @param {TokenValue} value
   * @param {TokenStream} stream
   * @param {string|Object} Props
   * @return {ValidationError|void}
   */
  function validateProperty(tok, value, stream, Props) {
    const pp = value.parts;
    const p0 = pp[0];
    if (p0.type === 'ident' && buGlobalKeywords.has(p0)) {
      return pp[1] && vtFailure(pp[1], true);
    }
    Props = typeof Props === 'string' ? ScopedProperties[Props] : Props || Properties;
    let spec, res, vp;
    let prop = tok.lowText || tok.text.toLowerCase();
    do spec = Props[prop] || Props['<all>'] && (Props = Properties)[prop];
    while (!spec && !res && (vp = tok.vendorPos) && (res = prop = prop.slice(vp)));
    if (typeof spec === 'number' || !spec && vp) {
      return;
    }
    if (!spec) {
      prop = Props === Properties || !Properties[prop] ? 'Unknown' : 'Misplaced';
      return new ValidationError(`${prop} property "${tok}".`, tok);
    }
    if (value.isVar) {
      return;
    }
    const valueSrc = value.text.trim();
    let known = validationCache.get(prop);
    if (known && known.has(valueSrc)) {
      return;
    }
    // Property-specific validation.
    const expr = new PropValueIterator(value);
    let m = Matcher.cache[spec] || Matcher.parse(spec);
    res = m.match(expr, p0);
    if ((!res || expr.hasNext) && /\battr\(/i.test(valueSrc)) {
      if (!res) {
        expr.i = 0;
        expr.tryAttr = true;
        res = m.match(expr);
      }
      for (let p; (p = expr.parts[expr.i]) && p.isAttr;) {
        expr.next();
      }
    }
    if (expr.hasNext && (res || expr.i)) return vtFailure(expr.parts[expr.i]);
    if (!res && (m = expr.badFunc)) return vtFailure(m[0], vtDescribe(spec, m[1]));
    if (!res) return vtFailure(expr.value, vtDescribe(spec));
    if (!known) validationCache.set(prop, (known = new Set()));
    known.add(valueSrc);
  }

  function vtDescribe(type, m) {
    if (!m) m = VTComplex[type] || type[0] === '<' && Properties[type.slice(1, -1)];
    return m instanceof Matcher ? m.toString(0) : vtExplode(m || type);
  }

  function vtExplode(text) {
    return !text.includes('<') ? text
      : (Matcher.cache[text] || Matcher.parse(text)).toString(0);
  }

  function vtFailure(unit, what) {
    if (!what || what === true ? (what = 'end of value') : !unit.isVar) {
      return new ValidationError(`Expected ${what} but found "${clipString(unit)}".`, unit);
    }
  }

  //#endregion

  function clipString(s, len = 30) {
    return (s = `${s}`).length > len ? s.slice(0, len) + '...' : s;
  }
  function customIdentChecker(str = '', alt) {
    const b = new Bucket(GlobalKeywords);
    if (str) b.addFrom(str.split(','));
    return p => p.id === IDENT && !b.has(p) || alt && alt(p);
  }

  /** @namespace parserlib */
  const parserlib = {
    css: {
      Combinators,
      GlobalKeywords,
      NamedColors,
      Properties,
      ScopedProperties,
      Tokens,
      Units,
    },
    util: {
      Bucket,
      EventTarget,
      Matcher,
      StringSource,
      TokenIdByCode,
      VTComplex,
      VTFunctions,
      VTSimple,
      UnitTypeIds,
      clipString,
      describeProp: vtExplode,
      isOwn,
      pick,
      validateProperty,
    },
  };
  if (typeof self !== 'undefined') self.parserlib = parserlib;
  else module.exports = parserlib; // eslint-disable-line no-undef
})();
