/*
Modded by tophf <github.com/tophf>
========== Original disclaimer:

Parser-Lib
Copyright (c) 2009-2016 Nicholas C. Zakas. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
'use strict';
/* eslint-disable class-methods-use-this */

self.parserlib = (() => {

  //#region Properties

  // Global keywords that can be set for any property are conveniently listed in `all` prop:
  // https://drafts.csswg.org/css-cascade/#all-shorthand
  const GlobalKeywords = ['initial', 'inherit', 'revert', 'unset'];
  const Properties = {
    __proto__: null,
    'accent-color': 'auto | <color>',
    'align-items': 'normal | stretch | <baseline-position> | [ <overflow-position>? <self-position> ]',
    'align-content': 'normal | <baseline-position> | <content-distribution> | ' +
          '<overflow-position>? <content-position>',
    'align-self': 'auto | normal | stretch | <baseline-position> | <overflow-position>? <self-position>',
    'all': GlobalKeywords.join(' | '),
    'alignment-baseline': 'auto | baseline | use-script | before-edge | text-before-edge | ' +
      'after-edge | text-after-edge | central | middle | ideographic | alphabetic | ' +
      'hanging | mathematical',
    'animation': '[ <time> || <single-timing-function> || <time> || [ infinite | <number> ] || ' +
      '<single-animation-direction> || <single-animation-fill-mode> || ' +
      '[ running | paused ] || [ none | <custom-ident> | <string> ] ]#',
    'animation-delay': '<time>#',
    'animation-direction': '<single-animation-direction>#',
    'animation-duration': '<time>#',
    'animation-fill-mode': '<single-animation-fill-mode>#',
    'animation-iteration-count': '[ <number> | infinite ]#',
    'animation-name': '[ none | <keyframes-name> ]#',
    'animation-play-state': '[ running | paused ]#',
    'animation-timing-function': '<single-timing-function>#',
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
    'aspect-ratio': 'auto || [ <num0+> [ / <num0+> ]? ]',
    'azimuth': '<angle> | leftwards | rightwards | [ ' +
      '[ left-side | far-left | left | center-left | center | center-right | right | far-right | right-side ' +
      '] || behind ]',
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
    'bleed': '<length>',
    'block-size': '<width>',
    'border-collapse': 'collapse | separate',
    'border-image': '[ none | <image> ] || <border-image-slice> ' +
      '[ / <border-image-width> | / <border-image-width>? / <border-image-outset> ]? || ' +
      '<border-image-repeat>',
    'border-image-outset': '[ <length> | <number> ]{1,4}',
    'border-image-repeat': '[ stretch | repeat | round | space ]{1,2}',
    'border-image-slice': '<border-image-slice>',
    'border-image-source': '<image> | none',
    'border-image-width': '[ <len-pct> | <number> | auto ]{1,4}',
    'border-spacing': '<length>{1,2}',

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
    'clip-path': '<uri> | [ <basic-shape> || <geometry-box> ] | none',
    'clip-rule': 'nonzero | evenodd',
    'color': '<color>',
    'color-interpolation': 'auto | sRGB | linearRGB',
    'color-interpolation-filters': '<color-interpolation>',
    'color-profile': 1,
    'color-rendering': 'auto | optimizeSpeed | optimizeQuality',
    'color-scheme': 'normal | [ light | dark | <custom-ident> ]+ && only?',
    'column-count': '<integer> | auto',
    'column-fill': 'auto | balance',
    'column-gap': 'normal | <len-pct>',
    'column-rule': '<border-shorthand>',
    'column-rule-color': '<color>',
    'column-rule-style': '<border-style>',
    'column-rule-width': '<border-width>',
    'column-span': 'none | all',
    'column-width': '<length> | auto',
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
    'cursor': '[ <uri> [ <number> <number> ]? , ]* ' +
      '[ auto | default | none | context-menu | help | pointer | progress | wait | ' +
      'cell | crosshair | text | vertical-text | alias | copy | move | no-drop | ' +
      'not-allowed | grab | grabbing | e-resize | n-resize | ne-resize | nw-resize | ' +
      's-resize | se-resize | sw-resize | w-resize | ew-resize | ns-resize | ' +
      'nesw-resize | nwse-resize | col-resize | row-resize | all-scroll | ' +
      'zoom-in | zoom-out ]',

    'direction': 'ltr | rtl',
    'display': '[ <display-outside> || <display-inside> ] | ' +
      '<display-listitem> | <display-internal> | <display-box> | <display-legacy> | ' +
      // deprecated and nonstandard
      '-webkit-box | -webkit-inline-box | -ms-flexbox',
    'dominant-baseline': 'auto | use-script | no-change | reset-size | ideographic | alphabetic | ' +
      'hanging | mathematical | central | middle | text-after-edge | text-before-edge',

    'elevation': '<angle> | below | level | above | higher | lower',
    'empty-cells': 'show | hide',
    'enable-background': 1, // SVG

    'fill': '<paint>',
    'fill-opacity': '<opacity>',
    'fill-rule': 'nonzero | evenodd',
    'filter': '<filter-function-list> | <ie-function> | none',
    'flex': '<flex-shorthand>',
    'flex-basis': '<width>',
    'flex-direction': 'row | row-reverse | column | column-reverse',
    'flex-flow': '<flex-direction> || <flex-wrap>',
    'flex-grow': '<number>',
    'flex-shrink': '<number>',
    'flex-wrap': 'nowrap | wrap | wrap-reverse',
    'float': 'left | right | none | inline-start | inline-end',
    'flood-color': 1,
    'flood-opacity': '<opacity>',
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
    'font-size-adjust': '<number> | none',
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
    'font-variation-settings': 'normal | [ <string> <number> ]#',
    'font-weight': 'normal | bold | bolder | lighter | <num1-1000>',
    'forced-color-adjust': 'auto | none | preserve-parent-color',

    'gap': '<column-gap>{1,2}',
    'glyph-orientation-horizontal': '<glyph-angle>',
    'glyph-orientation-vertical': 'auto | <glyph-angle>',

    'grid': '<grid-template> | <grid-template-rows> / [ auto-flow && dense? ] <grid-auto-columns>? | ' +
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
    'grid-template-rows': 'none | <track-list> | <auto-track-list>',

    'hanging-punctuation': 'none | [ first || [ force-end | allow-end ] || last ]',
    'height': 'auto | <width-height>',
    'hyphenate-character': '<string> | auto',
    'hyphenate-limit-chars': '[ auto | <integer> ]{1,3}',
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

    'kerning': 'auto | <length>',

    'left': '<width>',
    'letter-spacing': '<length> | normal',
    'line-height': '<line-height>',
    'line-break': 'auto | loose | normal | strict | anywhere',
    'list-style': '<list-style-position> || <list-style-image> || <list-style-type>',
    'list-style-image': '<image> | none',
    'list-style-position': 'inside | outside',
    'list-style-type': '<string> | disc | circle | square | decimal | decimal-leading-zero | ' +
      'lower-roman | upper-roman | lower-greek | lower-latin | upper-latin | armenian | ' +
      'georgian | lower-alpha | upper-alpha | none',

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
      '<geometry-box> || [ <geometry-box> | no-clip ] || [ add | subtract | intersect | exclude ] || ' +
      '[ alpha | luminance | match-source ] ]#',
    'mask-image': '[ none | <image> ]#',
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
    'offset': '[ <offset-position>? <offset-path> [ <len-pct> || <offset-rotate> ]? | <offset-position> ] ' +
      '[ / <offset-anchor> ]?',
    'offset-anchor': 'auto | <position>',
    'offset-distance': '<len-pct>',
    'offset-path': 'none | ray() | path() | <uri> | [ <basic-shape> && <coord-box>? ] | <coord-box>',
    'offset-position': 'auto | <position>',
    'offset-rotate': '[ auto | reverse ] || <angle>',
    'opacity': '<opacity> | <pct>',
    'order': '<integer>',
    'orphans': '<integer>',
    'outline': '[ <color> | invert ] || [ auto | <border-style> ] || <border-width>',
    'outline-color': '<color> | invert',
    'outline-offset': '<length>',
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

    'rendering-intent': 1,
    'resize': 'none | both | horizontal | vertical | block | inline',
    'right': '<width>',
    'rotate': 'none | [ x | y | z | <number>{3} ]? && <angle>',
    'row-gap': '<column-gap>',
    'ruby-align': 1,
    'ruby-position': 1,

    'scale': 'none | <num-pct>{1,3}',
    'scroll-behavior': 'auto | smooth',
    'scroll-margin': '<length>{1,4}',
    'scroll-margin-bottom': '<length>',
    'scroll-margin-left': '<length>',
    'scroll-margin-right': '<length>',
    'scroll-margin-top': '<length>',
    'scroll-margin-block': '<length>{1,2}',
    'scroll-margin-block-end': '<length>',
    'scroll-margin-block-start': '<length>',
    'scroll-margin-inline': '<length>{1,2}',
    'scroll-margin-inline-end': '<length>',
    'scroll-margin-inline-start': '<length>',
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
    'scrollbar-color': 'auto | dark | light | <color>{2}',
    'scrollbar-gutter': 'auto | stable && both-edges?',
    'scrollbar-width': 'auto | thin | none',
    'shape-rendering': 'auto | optimizeSpeed | crispEdges | geometricPrecision',
    'speak': 'auto | never | always',
    'speak-as': 1,
    'stop-color': 1,
    'stop-opacity': '<opacity>',
    'stroke': '<paint>',
    'stroke-dasharray': 'none | <dasharray>',
    'stroke-dashoffset': '<len-pct> | <number>',
    'stroke-linecap': 'butt | round | square',
    'stroke-linejoin': 'miter | miter-clip | round | bevel | arcs',
    'stroke-miterlimit': '<num0+>',
    'stroke-opacity': '<opacity>',
    'stroke-width': '<len-pct> | <number>',

    'table-layout': 'auto | fixed',
    'tab-size': '<number> | <length>',
    'text-align': '<text-align> | justify-all',
    'text-align-last': '<text-align> | auto',
    'text-anchor': 'start | middle | end',
    'text-decoration': '<text-decoration-line> || <text-decoration-style> || <color>',
    'text-decoration-color': '<color>',
    'text-decoration-line': 'none | [ underline || overline || line-through || blink ]',
    'text-decoration-skip': 'none | ' +
      '[ objects || [ spaces | [ leading-spaces || trailing-spaces ] ] || edges || box-decoration ]',
    'text-decoration-style': 'solid | double | dotted | dashed | wavy',
    'text-emphasis': '<text-emphasis-style> || <color>',
    'text-emphasis-color': '<color>',
    'text-emphasis-style': 'none | <string> | ' +
      '[ [ filled | open ] || [ dot | circle | double-circle | triangle | sesame ] ]',
    'text-emphasis-position': '[ over | under ] && [ right | left ]?',
    'text-indent': '<len-pct> && hanging? && each-line?',
    'text-justify': 'auto | none | inter-word | inter-character',
    'text-overflow': 'clip | ellipsis',
    'text-rendering': 'auto | optimizeSpeed | optimizeLegibility | geometricPrecision',
    'text-shadow': 'none | [ <color>? && <length>{2,3} ]#',
    'text-transform': 'none | [ capitalize | uppercase | lowercase ] || full-width || full-size-kana',
    'text-underline-position': 'auto | [ under || [ left | right ] ]',
    'top': '<width>',
    'touch-action': 'auto | none | pan-x | pan-y | pan-left | pan-right | pan-up | pan-down | manipulation',
    'transform': 'none | <fn:transform>+',
    'transform-box': 'border-box | fill-box | view-box',
    'transform-origin': '[ left | center | right | <len-pct> ] ' +
      '[ top | center | bottom | <len-pct> ] <length>? | ' +
      '[ left | center | right | top | bottom | <len-pct> ] | ' +
      '[ [ center | left | right ] && [ center | top | bottom ] ] <length>?',
    'transform-style': 'flat | preserve-3d',
    'transition': '<transition>#',
    'transition-delay': '<time>#',
    'transition-duration': '<time>#',
    'transition-property': 'none | [ all | <custom-ident> ]#',
    'transition-timing-function': '<single-timing-function>#',
    'translate': 'none | <len-pct> [ <len-pct> <length>? ]?',

    'unicode-range': '<unicode-range>#',
    'unicode-bidi': 'normal | embed | isolate | bidi-override | isolate-override | plaintext',
    'user-select': 'auto | text | none | contain | all',

    'vertical-align': 'auto | use-script | baseline | sub | super | top | text-top | ' +
      'central | middle | bottom | text-bottom | <len-pct>',
    'visibility': '<vis-hid> | collapse',

    'white-space': 'normal | pre | nowrap | pre-wrap | break-spaces | pre-line',
    'widows': '<integer>',
    'width': 'auto | <width-height>',
    'will-change': 'auto | <animateable-feature>#',
    'word-break': 'normal | keep-all | break-all | break-word',
    'word-spacing': '<length> | normal',
    'word-wrap': 'normal | break-word | anywhere',
    'writing-mode': 'horizontal-tb | vertical-rl | vertical-lr | ' +
      'lr-tb | rl-tb | tb-rl | bt-rl | tb-lr | bt-lr | lr-bt | rl-bt | lr | rl | tb',

    'z-index': '<integer> | auto',
    'zoom': '<number> | <pct> | normal',

    // nonstandard https://compat.spec.whatwg.org/
    '-webkit-box-reflect': '[ above | below | right | left ]? <length>? <image>?',
    '-webkit-text-fill-color': '<color>',
    '-webkit-text-stroke': '<border-width> || <color>',
    '-webkit-text-stroke-color': '<color>',
    '-webkit-text-stroke-width': '<border-width>',
    '-webkit-user-modify': 'read-only | read-write | write-only',
  };

  const ScopedProperties = {
    __proto__: null,
    '@font-face': Object.assign({
      'ascent-override': '[ normal | <pct0+> ]{1,2}',
      'descent-override': '[ normal | <pct0+> ]{1,2}',
      'font-display': 'auto | block | swap | fallback | optional',
      'font-stretch': 'auto | <font-stretch>{1,2}',
      'font-style': 'auto | normal | italic | oblique <angle>{0,2}',
      'font-weight': 'auto | [ normal | bold | <num1-1000> ]{1,2}',
      'line-gap-override': '[ normal | <pct0+> ]{1,2}',
      'size-adjust': '<pct0+>',
      'src': '[ url() [ format( <string># ) ]? | local( <family-name> ) ]#',
    }, ...[
      'font-family',
      'font-size',
      'font-variant',
      'font-variation-settings',
      'unicode-range',
    ].map(p => ({[p]: Properties[p]}))),

    '@font-palette-values': Object.assign({
      'base-palette': 'light | dark | <int0+>',
      'override-colors': '[ <int0+> <color> ]#',
    }, ...[
      'font-family',
    ].map(p => ({[p]: Properties[p]}))),

    '@page': {
      '': true, // include Properties
      'bleed': 'auto | <length>',
      'marks': 'none | [ crop || cross ]',
      'size': '<length>{1,2} | auto | [ [ A3 | A4 | A5 | B4 | B5 | JIS-B4 | JIS-B5 | ' +
        'ledger | legal | letter ] || [ portrait | landscape ] ]',
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
  //#region Types

  const UNITS = JSON.parse(`{${Object.entries({
    angle: 'deg,grad,rad,turn',
    frequency: 'hz,khz',
    length: 'cap,ch,em,ex,ic,lh,rlh,rem,' +
      'cm,mm,in,pc,pt,px,q,' +
      'cqw,cqh,cqi,cqb,cqmin,cqmax,' + // containers
      'fr,' + // grids
      'vb,vi,vh,vw,vmin,vmax'.replace(/\w+/g, '$&,d$&,l$&,s$&'),
    resolution: 'dpcm,dpi,dppx,x',
    time: 'ms,s',
  }).map(([type, units]) => units.replace(/\w+/g, `"$&":"${type}"`)).join(',')}}`);
  // Sticky `y` flag must be used in expressions used with peekTest and readMatch
  const rxIdentStartPct = /[-\\_a-zA-Z\u00A0-\uFFFF%]/uy;
  const rxNameCharNoEsc = /[-_\da-zA-Z\u00A0-\uFFFF]+/yu; // must not match \\
  // CSS2 system colors: https://www.w3.org/TR/css3-color/#css2-system
  // CSS4 system colors: https://drafts.csswg.org/css-color-4/#css-system-colors
  // 2-5 times faster than Array.includes(val.toLowerCase()) or a branched regexp like /a(foo|bar)/i
  const rxNamedColor = /^(currentColor|transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgrey|darkgreen|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|grey|green|greenyellow|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgrey|lightgreen|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen|ActiveBorder|ActiveCaption|ActiveText|AppWorkspace|Background|ButtonBorder|ButtonFace|ButtonHighlight|ButtonShadow|ButtonText|Canvas|CanvasText|CaptionText|Field|FieldText|GrayText|Highlight|HighlightText|InactiveBorder|InactiveCaption|InactiveCaptionText|InfoBackground|InfoText|LinkText|Mark|MarkText|Menu|MenuText|Scrollbar|ThreeDDarkShadow|ThreeDFace|ThreeDHighlight|ThreeDLightShadow|ThreeDShadow|VisitedText|Window|WindowFrame|WindowText)$/i;
  const rxUnquotedUrlCharNoEsc = /[-!#$%&*-[\]-~\u00A0-\uFFFF]+/yu; // must not match \\
  const rxVendorPrefix = /^(?:-(webkit|moz|ms|o)-)?(.+)/i;

  //#endregion
  //#region ValidationTypes - definitions

  const VTSimple = {
    __proto__: null,
    '<animateable-feature-name>': customIdentChecker('will-change|auto|scroll-position|contents'),
    '<angle>': p => p.type === 'angle' || p.isCalc,
    '<angle-or-0>': p => p.is0 || p.type === 'angle' || p.isCalc,
    '<ascii4>': p => p.type === 'string' && p.text.length === 4 && !/[^\x20-\x7E]/.test(p.text),
    '<attr>': vtIsAttr,
    '<custom-ident>': customIdentChecker(),
    '<custom-prop>': p => p.type === 'custom-prop',
    '<flex>': p => p.type === 'grid' && p.value >= 0 || p.isCalc,
    '<glyph-angle>': p => p.type === 'angle' && p.units === 'deg',
    '<hue>': p => p.type === 'number' || p.type === 'angle' || p.isCalc,
    '<ident-for-grid>': customIdentChecker('span|auto'),
    '<ident-not-none>': p => p.tokenType === Tokens.IDENT && !p.is === 'none', //eslint-disable-line no-use-before-define
    '<ie-function>': p => p.tokenType === Tokens.IE_FUNCTION, //eslint-disable-line no-use-before-define
    '<integer>': p => p.isInt,
    '<int0+>': p => p.isInt && p.value >= 0,
    '<int1+>': p => p.isInt && p.value > 0,
    '<length>': vtIsLength,
    '<len0+>': p => p.value >= 0 && vtIsLength(p) || p.isCalc,
    '<len-pct>': p => p.type === 'length' || p.type === 'pct' || p.is0 || p.isCalc,
    '<len-pct0+>': p => p.value > 0 ? p.type === 'pct' || p.type === 'length' : p.is0 || p.isCalc,
    '<number>': p => p.type === 'number' || p.isCalc,
    '<num0+>': p => p.type === 'number' && p.value >= 0 || p.isCalc,
    '<num1-1000>': p => p.type === 'number' && p.value >= 1 && p.value <= 1000 || p.isCalc,
    '<num-pct>': p => p.type === 'number' || p.type === 'pct' || p.isCalc,
    '<num-pct0+>': p => (p.type === 'number' || p.type === 'pct') && p.value >= 0 || p.isCalc,
    '<num-pct-none>': p => p.type === 'number' || p.type === 'pct' || p.is === 'none' || p.isCalc,
    '<opacity>': p => p.type === 'number' && p.value >= 0 && p.value <= 1 || p.isCalc,
    '<pct>': vtIsPct,
    '<pct0+>': p => p.type === 'pct' && p.value >= 0 || p.isCalc,
    '<pct0-100>': p => p.type === 'pct' && p.value >= 0 && p.value <= 100 || p.isCalc,
    '<keyframes-name>': customIdentChecker('', '^-?[a-z_][-a-z0-9_]+$', p => p.type === 'string'),
    '<string>': p => p.type === 'string',
    '<time>': p => p.type === 'time',
    '<unicode-range>': p => /^U\+[0-9a-f?]{1,6}(-[0-9a-f?]{1,6})?\s*$/i.test(p.text),
    '<uri>': p => p.type === 'uri',
    '<width>': p => p.is === 'auto' || VTSimple['<len-pct>'],
  };
  for (const type of ['hsl', 'hwb', 'lab', 'lch', 'rgb']) {
    const rx = RegExp(`^(none|${type.replace(/./g, '$&|')}alpha)$`, 'i');
    VTSimple[`<rel-${type}>`] = p => rx.test(p.text);
    VTSimple[`<rel-${type}-np>`] = p => p.type === 'number' || p.type === 'pct' || p.isCalc ||
      rx.test(p.text);
  }

  const VTFunctions = {
    color: {
      __proto__: null,
      'color-mix': 'in [ <re:srgb(-linear)?|(ok)?lab|xyz(-d(50|65))?> ' +
        '| <re:hsl|hwb|(ok)?lch> [ <re:(short|long)er|(in|de)creasing> hue ]? ' +
        '] , [ <color> && <pct0-100>? ]#{2}',
      'color': 'from <color> [ ' +
          '<custom-prop> [ <num-pct-none> <custom-ident> ]# | ' +
          '<rgb-xyz> [ <num-pct-none> | <re:[rgbxyz]> ]{3} ' +
        '] [ / <num-pct-none> | <re:[rgbxyz]> ]? | ' +
        '[ <rgb-xyz> <num-pct-none>{3} | <custom-prop> <num-pct-none># ] <alpha>?',
      'hsl': '<hue> , <pct>#{2} [ , <num-pct0+> ]? | ' +
        '[ <hue> | none ] <num-pct-none>{2} <alpha>? | ' +
        'from <color> [ <hue> | <rel-hsl> ] <rel-hsl-np>{2} [ / <rel-hsl-np> ]?',
      'hwb': '[ <hue> | none ] <num-pct-none>{2} <alpha>? | ' +
        'from <color> [ <hue> | <rel-hwb> ] <rel-hwb-np>{2} [ / <rel-hwb-np> ]?',
      'lab': '<num-pct-none>{3} <alpha>? | ' +
        'from <color> <rel-lab-np>{3} [ / <rel-lab-np> ]?',
      'lch': '<num-pct-none>{2} [ <hue> | none ] <alpha>? | ' +
        'from <color> <rel-lch-np>{2} [ <hue> | <rel-lch> ] [ / <rel-lch-np> ]?',
      'rgb': '[ <number>#{3} | <pct>#{3} ] [ , <num-pct0+> ]? | ' +
        '<num-pct-none>{3} <alpha>? | ' +
        'from <color> <rel-rgb-np>{3} [ / <rel-rgb-np> ]?',
    },
    filter: {
      __proto__: null,
      'blur': '<length>?',
      'brightness': '<num-pct>?',
      'contrast': '<num-pct>?',
      'drop-shadow': '[ <length>{2,3} && <color>? ]?',
      'grayscale': '<num-pct>?',
      'hue-rotate': '<angle-or-0>?',
      'invert': '<num-pct>?',
      'opacity': '<num-pct>?',
      'saturate': '<num-pct>?',
      'sepia': '<num-pct>?',
    },
    transform: {
      __proto__: null,
      matrix: '<number>#{6}',
      matrix3d: '<number>#{16}',
      perspective: '<len0+> | none',
      rotate: '<angle-or-0> | none',
      rotate3d: '<number>#{3} , <angle-or-0>',
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
      translate3d: '<len-pct>#{2} , <length>',
      translateX: '<len-pct>',
      translateY: '<len-pct>',
      translateZ: '<length>',
    },
  };
  for (const k of ['hsl', 'rgb']) VTFunctions.color[k + 'a'] = VTFunctions.color[k];
  for (const k of ['lab', 'lch']) VTFunctions.color['ok' + k] = VTFunctions.color[k];

  const VTComplex = {
    __proto__: null,
    '<absolute-size>': 'xx-small | x-small | small | medium | large | x-large | xx-large',
    '<alpha>': '/ <num-pct-none>',
    '<animateable-feature>': 'scroll-position | contents | <animateable-feature-name>',
    '<attachment>': 'scroll | fixed | local',
    '<auto-repeat>':
      'repeat( [ auto-fill | auto-fit ] , [ <line-names>? <fixed-size> ]+ <line-names>? )',
    '<auto-track-list>':
      '[ <line-names>? [ <fixed-size> | <fixed-repeat> ] ]* <line-names>? <auto-repeat> ' +
      '[ <line-names>? [ <fixed-size> | <fixed-repeat> ] ]* <line-names>?',
    '<baseline-position>': '[ first | last ]? baseline',
    '<basic-shape>':
      '<inset> | ' +
      'circle( <len-pct-side>? [ at <position> ]? ) | ' +
      'ellipse( [ <len-pct-side>{2} ]? [ at <position> ]? ) | ' +
      'path( [ [ nonzero | evenodd ] , ]? <string> ) | ' +
      'polygon( [ [ nonzero | evenodd | inherit ] , ]? [ <len-pct> <len-pct> ]# )',
    '<bg-image>': '<image> | none',
    '<bg-layer>':
      '<bg-image> || <bg-position> [ / <bg-size> ]? || <repeat-style> || <attachment> || <box>{1,2}',
    '<bg-position>':
      '[ center | [ left | right ] <len-pct>? ] && [ center | [ top | bottom ] <len-pct>? ] | ' +
      '[ left | center | right | <len-pct> ] [ top | center | bottom | <len-pct> ] | ' +
      '[ left | center | right | top | bottom | <len-pct> ]',
    '<bg-size>': '[ <len-pct> | auto ]{1,2} | cover | contain',
    '<blend-mode>': 'normal | multiply | screen | overlay | darken | lighten | color-dodge | ' +
      'color-burn | hard-light | soft-light | difference | exclusion | hue | ' +
      'saturation | color | luminosity | plus-darker | plus-lighter',
    '<border-image-slice>': M => M.many([true],
      // [<number> | <pct>]{1,4} && fill?
      // but 'fill' can appear between any of the numbers
      ['<num-pct0+>', '<num-pct0+>', '<num-pct0+>', '<num-pct0+>', 'fill'].map(M.fromType)),
    '<border-radius-round>': 'round <border-radius>',
    '<border-shorthand>': '<border-width> || <border-style> || <color>',
    '<border-style>': 'none | hidden | dotted | dashed | solid | double | groove | ridge | inset | outset',
    '<border-width>': '<length> | thin | medium | thick',
    '<box>': 'padding-box | border-box | content-box',
    '<box-fsv>': 'fill-box | stroke-box | view-box',
    '<color>': M => M.seq(
      new M((expr, p) => p.type === 'color', '<named-color> | <hex-color> |'),
      M.fromType('<fn:color?>')),
    '<coord-box>': '<box> | <box-fsv>',
    '<contain-intrinsic>': 'none | <length> | auto <length>',
    '<content-distribution>': 'space-between | space-around | space-evenly | stretch',
    '<content-list>':
      '[ <string> | <image> | <attr> | ' +
      'content( text | before | after | first-letter | marker ) | ' +
      'counter() | counters() | leader() | ' +
      'open-quote | close-quote | no-open-quote | no-close-quote | ' +
      'target-counter() | target-counters() | target-text() ]+',
    '<content-position>': 'center | start | end | flex-start | flex-end',
    '<counter>': '[ <ident-not-none> <integer>? ]+ | none',
    '<cubic-bezier-timing-function>': 'ease | ease-in | ease-out | ease-in-out | ' +
      'cubic-bezier( <number>#{4} )',
    '<dasharray>': M => M.parse('<len-pct0+> | <num0+>')
      .braces(1, Infinity, '#', M.fromType(',').braces(0, 1, '?')),
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
    '<filter-function-list>': '[ <fn:filter> | <uri> ]+',
    '<final-bg-layer>': '<color> || <bg-image> || <bg-position> [ / <bg-size> ]? || ' +
      '<repeat-style> || <attachment> || <box>{1,2}',
    '<fixed-repeat>': 'repeat( [ <int1+> ] , [ <line-names>? <fixed-size> ]+ <line-names>? )',
    '<fixed-size>': '<len-pct> | minmax( <len-pct> , <track-breadth> | <inflexible-breadth> , <len-pct> )',
    '<flex-direction>': 'row | row-reverse | column | column-reverse',
    '<flex-shorthand>': 'none | [ <number>{1,2} || <width> ]',
    '<flex-wrap>': 'nowrap | wrap | wrap-reverse',
    '<font-short-core>': '<font-size> [ / <line-height> ]? <font-family>',
    '<font-short-tweak-no-pct>':
      '<font-style> || [ normal | small-caps ] || <font-weight> || <font-stretch-named>',
    '<font-stretch-named>': 'normal | ultra-condensed | extra-condensed | condensed | ' +
      'semi-condensed | semi-expanded | expanded | extra-expanded | ultra-expanded',
    '<font-variant-alternates>': 'stylistic() || historical-forms || styleset() || ' +
      'character-variant() || swash() || ornaments() || annotation()',
    '<font-variant-caps>': 'small-caps | all-small-caps | petite-caps | all-petite-caps | unicase | titling-caps',
    '<font-variant-east-asian>': '[ jis78 | jis83 | jis90 | jis04 | simplified | traditional ] || ' +
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
    '<geometry-box>': '<shape-box> | <box2>',
    '<gradient>': 'radial-gradient() | linear-gradient() | conic-gradient() | gradient() | ' +
      'repeating-radial-gradient() | repeating-linear-gradient() | repeating-conic-gradient() | ' +
      'repeating-gradient()',
    '<grid-line>': 'auto | [ <integer> && <ident-for-grid>? ] | <ident-for-grid> | ' +
      '[ span && [ <integer> || <ident-for-grid> ] ]',
    '<image>': '<uri> | <gradient> | cross-fade()',
    '<inflexible-breadth>': '<len-pct> | min-content | max-content | auto',
    '<inset>': 'inset( <len-pct>{1,4} <border-radius-round>? )',
    '<len-pct-side>': '<len-pct> | closest-side | farthest-side',
    '<line-height>': '<number> | <len-pct> | normal',
    '<line-names>': '"[" <ident-for-grid> "]"',
    '<overflow-position>': 'unsafe | safe',
    '<overflow>': '<vis-hid> | clip | scroll | auto',
    '<overscroll>': 'contain | none | auto',
    '<paint>': 'none | <color> | <uri> [ none | <color> ]? | context-fill | context-stroke',
    // Because our `alt` combinator is ordered, we need to test these
    // in order from longest possible match to shortest.
    '<position>':
      '[ [ left | right ] <len-pct> ] && [ [ top | bottom ] <len-pct> ] | ' +
      '[ left | center | right | <len-pct> ] ' +
      '[ top | center | bottom | <len-pct> ]? | ' +
      '[ left | center | right ] || [ top | center | bottom ]',
    '<rect>': 'rect( [ <length> | auto ]#{4} <border-radius-round>? )',
    '<relative-size>': 'smaller | larger',
    '<repeat-style>': 'repeat-x | repeat-y | [ repeat | space | round | no-repeat ]{1,2}',
    '<rgb-xyz>': 'srgb | srgb-linear | display-p3 | a98-rgb | prophoto-rgb | rec2020 | xyz | xyz-d50 | xyz-d65',
    '<self-position>': 'center | start | end | self-start | self-end | flex-start | flex-end',
    '<shadow>': 'inset? && [ <length>{2,4} && <color>? ]',
    '<shape-box>': '<box> | margin-box',
    '<single-animation-direction>': 'normal | reverse | alternate | alternate-reverse',
    '<single-animation-fill-mode>': 'none | forwards | backwards | both',
    '<single-timing-function>':
      'linear | <cubic-bezier-timing-function> | <step-timing-function> | frames( <integer> )',
    '<step-timing-function>': 'step-start | step-end | ' +
      'steps( <integer> [ , <re:jump-(start|end|none|both)|start|end> ]? )',
    '<text-align>': 'start | end | left | right | center | justify | match-parent',
    '<track-breadth>': '<len-pct> | <flex> | min-content | max-content | auto',
    '<track-list>': '[ <line-names>? [ <track-size> | <track-repeat> ] ]+ <line-names>?',
    '<track-repeat>': 'repeat( [ <int1+> ] , [ <line-names>? <track-size> ]+ <line-names>? )',
    '<track-size>': '<track-breadth> | minmax( <inflexible-breadth> , <track-breadth> ) | ' +
      'fit-content( <len-pct> )',
    '<transition>': '[ none | [ all | <custom-ident> ]# ] || <time> || <single-timing-function> || <time>',
    '<vis-hid>': 'visible | hidden',
    '<width-height>': '<len-pct> | min-content | max-content | fit-content | ' +
      '-moz-available | -webkit-fill-available | fit-content( <len-pct> )',
    '<xywh>': 'xywh( <len-pct>{2} <len-pct0+>{2} <border-radius-round>? )',
  };

  //#endregion
  //#region Tokens

  /* https://www.w3.org/TR/css3-syntax/#lexical */
  /** @type {Record<string,(number|{})>}*/
  const Tokens = {
    __proto__: null,
    EOF: {}, // must be the first token
    // HTML-style comments
    CDC: {},
    CDO: {},
    // ignorables
    COMMENT: {hide: true},
    S: {},
    // attribute equality
    DASHMATCH: {text: '|='},
    INCLUDES: {text: '~='},
    PREFIXMATCH: {text: '^='},
    SUBSTRINGMATCH: {text: '*='},
    SUFFIXMATCH: {text: '$='},
    // identifier types
    HASH: {},
    IDENT: {},
    STRING: {},
    // at-keywords
    CHARSET_SYM: {text: '@charset'},
    CONTAINER_SYM: {text: '@container'},
    DOCUMENT_SYM: {text: ['@document', '@-moz-document']},
    FONT_FACE_SYM: {text: '@font-face'},
    FONT_PALETTE_VALUES_SYM: {text: '@font-palette-values'},
    IMPORT_SYM: {text: '@import'},
    KEYFRAMES_SYM: {text: ['@keyframes', '@-webkit-keyframes', '@-moz-keyframes', '@-o-keyframes']},
    LAYER_SYM: {text: '@layer'},
    MEDIA_SYM: {text: '@media'},
    NAMESPACE_SYM: {text: '@namespace'},
    PAGE_SYM: {text: '@page'},
    SUPPORTS_SYM: {text: '@supports'},
    UNKNOWN_SYM: {},
    VIEWPORT_SYM: {text: ['@viewport', '@-ms-viewport', '@-o-viewport']},
    // measurements
    ANGLE: {},
    DIMENSION: {},
    FREQUENCY: {},
    LENGTH: {},
    NUMBER: {},
    PERCENTAGE: {},
    RESOLUTION: {},
    TIME: {},
    // functions
    FUNCTION: {},
    URI: {},
    // Unicode ranges
    UNICODE_RANGE: {},
    // invalid string
    INVALID: {},
    // combinators
    COMMA: {text: ','},
    // The following token names are not defined in any CSS specification.
    CHAR: {},
    COLON: {text: ':'},
    COMBINATOR: {text: ['>', '+', '~', '||']},
    DOT: {text: '.'},
    EQUALS: {text: '='},
    IE_FUNCTION: {},
    IMPORTANT: {},
    LBRACE: {text: '{', end: '}'},
    LBRACKET: {text: '[', end: ']'},
    LPAREN: {text: '(', end: ')'},
    MARGIN_SYM: (map => ({
      text: '@B-center@B-L-C@B-L@B-R-C@B-R@L-B@L-M@L-T@R-B@R-M@R-T@T-center@T-L-C@T-L@T-R-C@T-R'
        .replace(/[A-Z]/g, s => map[s]).split(/(?=@)/),
    }))({B: 'bottom', C: 'corner', L: 'left', M: 'middle', R: 'right'}),
    MINUS: {text: '-'},
    PIPE: {text: '|'},
    PSEUDO_FUNC_SEL: {text: ['any', '-webkit-any', '-moz-any', 'has', 'is', 'not', 'where']},
    RBRACE: {text: '}'},
    RBRACKET: {text: ']'},
    RPAREN: {text: ')'},
    SEMICOLON: {text: ';'},
    SLASH: {text: '/'},
    STAR: {text: '*'},
    USO_VAR: {},
  };
  const getTokenName = index => (Tokens[index] || {}).name;
  const TokenTypeByText = {__proto__: null};
  for (let i = 0, arr = Object.keys(Tokens); i < arr.length; i++) {
    const key = arr[i];
    const val = Tokens[i] = Tokens[key];
    const {text} = val;
    Tokens[key] = i;
    val.name = key;
    if (Array.isArray(text)) for (const str of text) TokenTypeByText[str] = i;
    else if (text) TokenTypeByText[text] = i;
  }
  Tokens.UNKNOWN = -1;

  const TT = {
    __proto__: null,
    attrMatch: [
      Tokens.PREFIXMATCH,
      Tokens.SUFFIXMATCH,
      Tokens.SUBSTRINGMATCH,
      Tokens.EQUALS,
      Tokens.INCLUDES,
      Tokens.DASHMATCH,
    ],
    cruft: [
      Tokens.S,
      Tokens.CDO,
      Tokens.CDC,
    ],
    identString: [
      Tokens.IDENT,
      Tokens.STRING,
      Tokens.USO_VAR,
    ],
    mediaValue: [
      Tokens.IDENT,
      Tokens.NUMBER,
      Tokens.DIMENSION,
      Tokens.LENGTH,
    ],
    pseudo: [
      Tokens.FUNCTION,
      Tokens.IDENT,
    ],
    semiS: [
      Tokens.SEMICOLON,
      Tokens.S,
    ],
    stringUri: [
      Tokens.STRING,
      Tokens.URI,
      Tokens.USO_VAR,
    ],
    usoS: [
      Tokens.USO_VAR,
      Tokens.S,
    ],
  };

  //#endregion
  //#region StringReader

  class StringReader {

    constructor(text) {
      this._input = text.replace(/\r\n?/g, '\n');
      this._line = 1;
      this._col = 1;
      this._cursor = 0;
    }

    eof() {
      return this._cursor >= this._input.length;
    }

    peek(count = 1) {
      return this._input[this._cursor + count - 1];
    }

    peekTest(stickyRx) {
      stickyRx.lastIndex = this._cursor;
      return stickyRx.test(this._input);
    }

    read() {
      const c = this._input[this._cursor];
      if (!c) return null;
      if (c === '\n') {
        this._line++;
        this._col = 1;
      } else {
        this._col++;
      }
      this._cursor++;
      return c;
    }

    mark() {
      this._bookmark = {
        cursor: this._cursor,
        line: this._line,
        col: this._col,
      };
    }

    reset() {
      if (this._bookmark) {
        this._cursor = this._bookmark.cursor;
        this._line = this._bookmark.line;
        this._col = this._bookmark.col;
        delete this._bookmark;
      }
    }

    /**
     * Reads characters that match either text or a regular expression and returns those characters.
     * If a match is found, the row and column are adjusted.
     * @param {String|RegExp} m
     * @return {String} string or null if there was no match.
     */
    readMatch(m) {
      const {_cursor: i, _input: str} = this;
      if (typeof m === 'string') {
        if (!m || str[i] === m[0] && (
          m.length === 1 ||
          str[i + m.length - 1] === m[m.length - 1] && str.substr(i, m.length) === m
        )) {
          return m && this.readCount(m.length, m);
        }
      } else {
        m = m.sticky
          ? (m.lastIndex = i, m.exec(str))
          : m.exec(str.slice(i));
        if (m) {
          m = m[0];
          return m && this.readCount(m.length, m);
        }
      }
    }

    /**
     * Reads a given number of characters. If the end of the input is reached,
     * it reads only the remaining characters and does not throw an error.
     * @param {number} count The number of characters to read.
     * @param {string} [text] Use an already extracted text and only increment the cursor
     */
    readCount(count, text) {
      if (count <= 0) return '';
      const str = this._input;
      let i = this._cursor;
      if (!text) text = str.substr(i, count);
      if (!text) return; // EOF
      this._cursor = i + (count = text.length); // may be less than requested
      let prev = -1;
      let line = this._line;
      for (i = 0; (i = text.indexOf('\n', i)) >= 0; prev = i, i++) line++;
      this._col = prev < 0 ? this._col + count : (this._line = line, count - prev);
      return text;
    }
  }

  //#endregion
  //#region Matcher

  /**
   * Reuses a Matcher for a ValidationTypes definition string instead of reparsing it.
   * @type {Map<string, Matcher>}
   */
  const matcherCache = new Map();

  /**
   * This class implements a combinator library for matcher functions.
   * https://developer.mozilla.org/docs/Web/CSS/Value_definition_syntax#Component_value_combinators
   */
  class Matcher {
    /**
     * @param {(this: Matcher, expr: PropValueIterator, p?: SyntaxUnit) => boolean} matchFunc
     * @param {string | ((prec?:number)=>string)} toString
     * @param {?} [options]
     */
    constructor(matchFunc, toString, options) {
      this.matchFunc = matchFunc;
      if (toString.call) this.toString = toString; else this._string = toString;
      this.options = options != null ? options : false;
    }
    /**
     * @param {PropValueIterator} expr
     * @param {SyntaxUnit} [p]
     * @return {any | boolean}
     */
    match(expr, p = expr._parts[expr._i]) {
      return p ? expr._marks.push(expr._i) && expr.popMark(this.matchFunc(expr, p))
        : this.options.min === 0;
    }
    braces(min, max, marker, sep) {
      return new Matcher(Matcher.funcBraces, Matcher.toStringBraces, {
        min, max, marker,
        sep: sep && Matcher.seq(sep, this),
        embraced: this,
      });
    }
    toString() {
      return this._string;
    }

    static parse(str) {
      let m = matcherCache.get(str);
      if (m) return m;
      m = Matcher.doParse(str);
      matcherCache.set(str, m);
      return m;
    }
    /** Simple recursive-descent grammar to build matchers from strings. */
    static doParse(str) {
      const reader = new StringReader(str);
      const result = Matcher.parseGrammar(reader);
      if (!reader.eof()) {
        throw new Error('Internal grammar error. ' +
          `Expected end of string at ${reader._cursor}: ${reader._input}.`);
      }
      return result;
    }
    static cast(m) {
      return m instanceof Matcher ? m : Matcher.parse(m);
    }
    /**
     * @this {PropValueIterator}
     * @param {Matcher} m
     */
    static invoke(m) {
      return m.match(this);
    }
    // Matcher for a single type.
    static fromType(type) {
      let m = matcherCache.get(type);
      if (!m) {
        if (type.startsWith('<fn:')) {
          m = type.endsWith('?>');
          m = new Matcher(Matcher.funcFunc, Matcher.toStringFunc, {
            optional: m,
            list: type.slice(4, m ? -2 : -1),
          });
        } else {
          m = new Matcher(Matcher.funcFromType, type,
            type.startsWith('<re:') ? {re: RegExp(`^(${type.slice(4, -1)})$`, 'i')}
              : type.endsWith('()') ? {name: type.toLowerCase().slice(0, -2)}
                : {type});
        }
        matcherCache.set(type, m);
      }
      return m;
    }
    /**
     * @param {string} name - functio name
     * @param {Matcher} body - matcher for function body
     * @returns {Matcher}
     */
    static func(name, body) {
      return new Matcher(Matcher.funcFunc, Matcher.toStringFunc, {name, body});
    }
    // Matcher for one or more juxtaposed words, which all must occur, in the given order.
    static seq(...args) {
      const ms = args.map(Matcher.cast);
      if (ms.length === 1) return ms[0];
      return new Matcher(Matcher.funcSeq, Matcher.toStringSeq, ms);
    }
    // Matcher for one or more alternatives, where exactly one must occur.
    static alt(...args) {
      const ms = args.map(Matcher.cast);
      if (ms.length === 1) return ms[0];
      return new Matcher(Matcher.funcAlt, Matcher.toStringAlt, ms);
    }
    /**
     * Matcher for two or more options: double bar (||) and double ampersand (&&) operators,
     * as well as variants of && where some of the alternatives are optional.
     * This will backtrack through even successful matches to try to
     * maximize the number of items matched.
     */
    static many(required, ...args) {
      const ms = args.map(Matcher.cast);
      const m = new Matcher(Matcher.funcMany, Matcher.toStringMany, ms);
      m.required = required === true ? Array(ms.length).fill(true) : required;
      return m;
    }

    /**************************** matchFunc **********************/

    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     */
    static funcAlt(expr) {
      return this.options.some(Matcher.invoke, expr);
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {SyntaxUnit} [p]
     */
    static funcBraces(expr, p) {
      const {min, max, sep, embraced} = this.options;
      let i = 0;
      while (i < max && (i && sep || embraced).match(expr, p)) {
        p = undefined; // clearing because expr points to the next part now
        i++;
      }
      return i >= min;
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {SyntaxUnit} part
     */
    static funcFromType(expr, part) {
      let result, m, opt, name, type;
      if (part.isVar) {
        result = true;
      } else if ((name = (opt = this.options).name)) {
        result = part.name === name;
      } else if ((m = opt.re)) {
        result = m.test(part.text);
      } else if ((type = opt.type)[0] !== '<') {
        m = part.text;
        result = m.length >= type.length &&
          (type === m || m[0] === '-' && lowerCmp(type, m.match(rxVendorPrefix)[2]));
      } else if ((m = VTSimple[type])) {
        result = m(part);
      } else if ((m = VTComplex[type] || Properties[type.slice(1, -1)])) {
        result = (m.matchFunc ? m : vtCompile(type, m)).match(expr, part);
        if (result) return true;
      }
      if (result || expr.tryAttr && part.name === 'attr' && (result = vtIsAttr(part))) {
        expr.next();
      }
      return result;
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     * @param {SyntaxUnit} p
     */
    static funcFunc(expr, p) {
      const opt = this.options;
      const {name} = p;
      let e, m, list;
      let res = !name && opt.optional;
      if (!res && name && name === (opt.name || name) && (e = p.expr) && !(res = hasVarParts(e)) &&
          ((m = opt.body) != null || (m = (list = VTFunctions[opt.list])[name]))) {
        const vi = new PropValueIterator(e); // eslint-disable-line no-use-before-define
        if (!m.matchFunc) m = vtCompile(name, m, list);
        res = m.match(vi) && !vi.hasNext;
      }
      if (res) expr.next();
      return res;
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     */
    static funcMany(expr) {
      const seen = [];
      const {/** @type {Matcher[]} */options: ms, required} = this;
      let max = 0;
      let pass = 0;
      // If couldn't get a complete match, retrace our steps to make the
      // match with the maximum # of required elements.
      if (!tryMatch(0)) {
        pass++;
        tryMatch(0);
      }
      if (required === false) {
        return max > 0;
      }
      // Use finer-grained specification of which matchers are required.
      for (let i = 0; i < ms.length; i++) {
        if (required[i] && !seen[i]) {
          return false;
        }
      }
      return true;
      function tryMatch(matchCount) {
        for (let i = 0; i < ms.length; i++) {
          if (seen[i]) continue;
          expr.mark();
          if (expr.hasNext && !ms[i].matchFunc(expr, expr._parts[expr._i])) {
            expr.popMark(true);
            continue;
          }
          seen[i] = true;
          // Increase matchCount if this was a required element
          // (or if all the elements are optional)
          if (tryMatch(matchCount + (required === false || required[i] ? 1 : 0))) {
            expr.popMark(true);
            return true;
          }
          // Backtrack: try *not* matching using this rule, and
          // let's see if it leads to a better overall match.
          expr.popMark();
          seen[i] = false;
        }
        if (pass === 0) {
          max = Math.max(matchCount, max);
          return matchCount === ms.length;
        } else {
          return matchCount === max;
        }
      }
    }
    /**
     * @this {Matcher}
     * @param {PropValueIterator} expr
     */
    static funcSeq(expr) {
      return this.options.every(Matcher.invoke, expr);
    }

    /**************************** toStringFunc **********************/

    /** @this {Matcher} */
    static toStringAlt(prec) {
      const p = Matcher.prec.ALT;
      const s = this.options.map(m => m.toString(p)).join(' | ');
      return prec > p ? `[ ${s} ]` : s;
    }
    /** @this {Matcher} */
    static toStringBraces() {
      const {marker, min, max, embraced} = this.options;
      return embraced.toString(Matcher.prec.MOD) + (
        !marker || marker === '#'
          ? `${marker || ''}{${min}${min === max ? '' : ',' + max}}`
          : marker);
    }
    /** @this {Matcher} */
    static toStringFunc() {
      const {name, body, list} = this.options;
      return list ? `[ ${Object.keys(VTFunctions[list]).join('() | ')}() ]`
        : `${name}(${body || ''})`;
    }
    /** @this {Matcher} */
    static toStringMany(prec) {
      const {required} = this;
      const p = Matcher.prec[required ? 'ANDAND' : 'OROR'];
      const s = this.options.map((m, i) =>
        !required || required[i]
          ? m.toString(p)
          : m.toString(Matcher.prec.MOD).replace(/[^?]$/, '$&?')
      ).join(required ? ' && ' : ' || ');
      return prec > p ? `[ ${s} ]` : s;
    }
    /** @this {Matcher} */
    static toStringSeq(prec) {
      const p = Matcher.prec.SEQ;
      const s = this.options.map(m => m.toString(p)).join(' ');
      return prec > p ? `[ ${s} ]` : s;
    }
  }

  // Precedence table of combinators.
  Matcher.prec = {
    __proto__: null,
    MOD: 5,
    SEQ: 4,
    ANDAND: 3,
    OROR: 2,
    ALT: 1,
  };

  Matcher.parseGrammar = (() => {
    /** @type {StringReader} */
    let reader;
    return newReader => {
      reader = newReader;
      return alt();
    };
    function alt() {
      // alt = oror (" | " oror)*
      const alts = [];
      do alts.push(oror()); while (reader.readMatch(' | '));
      return alts.length === 1 ? alts[0] : Matcher.alt(...alts);
    }
    // Matcher for two or more options in any order, at least one must be present.
    function oror() {
      // oror = andand ( " || " andand)*
      const ors = [];
      do ors.push(andand()); while (reader.readMatch(' || '));
      return ors.length === 1 ? ors[0] : Matcher.many(false, ...ors);
    }
    // Matcher for two or more options in any order, all mandatory.
    function andand() {
      // andand = seq ( " && " seq)*
      const ands = [];
      const required = [];
      let reqPrev = true;
      do {
        const m = seq();
        const {options} = m;
        const req = !options || options.marker !== '?';
        // Matcher.many apparently can't handle optional items first
        if (req && !reqPrev) {
          ands.unshift(m);
          required.unshift(req);
        } else {
          ands.push(m);
          required.push(req);
          reqPrev = req;
        }
      } while (reader.readMatch(' && '));
      return ands.length === 1 ? ands[0] : Matcher.many(required, ...ands);
    }
    function seq() {
      // seq = mod ( " " mod)*
      const mods = [];
      do mods.push(mod()); while (reader.readMatch(/\s(?![&|)\]])/y));
      return Matcher.seq(...mods);
    }
    function mod() {
      // mod = term ( "?" | "*" | "+" | "#" | "{<num>,<num>}" )?
      // term = <nt> | literal | "[ " expression " ]" | fn "( " alt " )"
      let m, fn;
      if (reader.readMatch('[ ')) {
        m = alt();
        eat(' ]');
      } else if ((fn = reader.readMatch(/[-\w]+\(\s/y))) {
        m = alt();
        eat(' )');
        return Matcher.func(fn.slice(0, -2).toLowerCase(), m);
      } else if ((m = reader.readMatch(/([-\w]+(?:\s+\|\s+[-\w]+)+)(?=\s+(]|\|\s+)|\s*$)/y))) {
        return Matcher.fromType(`<re:${m.replace(/\s+\|\s+/g, '|')}>`);
      } else {
        m = Matcher.fromType(eat(/<[^>]+>|[^\s?*+#{]+/y).replace(/^(['"`])(.*)\1$/g, '$1'));
      }
      let hash;
      switch (reader.readMatch(/[?*+#{]/y)) {
        case '?': return m.braces(0, 1, '?');
        case '*': return m.braces(0, Infinity, '*');
        case '+': return m.braces(1, Infinity, '+');
        case '#':
          if (reader.peek() !== '{') return m.braces(1, Infinity, '#', ',');
          reader.read();
          hash = '#';
          // fallthrough
        case '{': {
          const [min, max] = eat(/\s*\d+\s*(,\s*\d+\s*)?}/y).trim().split(/\s+|,|}/);
          return m.braces(min | 0, max | min | 0, hash, hash && ',');
        }
      }
      return m;
    }
    function eat(pattern) {
      const s = reader.readMatch(pattern);
      if (s != null) return s;
      throw new Error('Internal grammar error. ' +
        `Expected ${pattern} at ${reader._cursor} in ${reader._input}`);
    }
  })();

  //#endregion
  //#region EventTarget

  class EventTarget {
    constructor() {
      this._listeners = new Map();
    }
    addListener(type, fn) {
      let list = this._listeners.get(type);
      if (!list) this._listeners.set(type, (list = new Set()));
      list.add(fn);
    }
    fire(event) {
      if (typeof event === 'string') {
        event = {type: event};
      }
      event.target = this;
      const list = this._listeners.get(event.type);
      if (list) {
        for (const fn of list) {
          fn.call(this, event);
        }
      }
    }
    removeListener(type, fn) {
      const list = this._listeners.get(type);
      if (list) list.delete(fn);
    }
  }

  //#endregion
  //#region Syntax units

  class SyntaxUnit {
    /**
     * @param {string} text
     * @param {parserlib.Token} tok
     * @param {string} type
     */
    constructor(text, tok, type) {
      // TODO: add `endOffset` and getters for col/line/text
      this.col = tok.col;
      this.line = tok.line;
      this.offset = tok.offset;
      this.type = type;
      if (text) this.text = text;
      if (tok.tokenType == null) {
        this.tokenType = tok.type;
        let x;
        if ((x = tok.prefix)) this.prefix = x;
        if ((x = tok.name)) this.name = x;
        if ((x = tok.expr)) this.expr = x;
      }
    }
    valueOf() {
      return this.text;
    }
    toString() {
      return this.text;
    }
  }

  class SyntaxError extends Error {
    constructor(message, pos) {
      super();
      this.name = this.constructor.name;
      this.col = pos.col;
      this.line = pos.line;
      this.offset = pos.offset;
      this.message = message;
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

  // individual media query
  class MediaQuery extends SyntaxUnit {
    constructor(modifier, mediaType, features, pos) {
      super('', pos, mediaType);
      this.modifier = modifier;
      this.features = features;
    }
    get text() {
      const mod = this.modifier || '';
      const feats = this.features.join(' and ');
      return define(this, 'text',
        `${mod}${mod ? ' ' : ''}${this.type || ''}${feats ? ' and ' : ''}${feats}`);
    }
  }

  /**
   * A single part of a selector string i.e. element name and modifiers.
   * Does not include combinators such as spaces, +, >, etc.
   */
  class SelectorPart extends SyntaxUnit {
    constructor(elementName, modifiers, text, pos) {
      super(text, pos, '');
      this.elementName = elementName;
      this.modifiers = modifiers;
    }
  }

  class SelectorSubPart extends SyntaxUnit {
    constructor(text, type, pos, args) {
      super(text, pos, type);
      this.args = args || [];
    }
  }

  class SelectorPseudoFunc extends SelectorSubPart {
    constructor(tok, colons, args) {
      super('', tok, 'pseudo', args);
      this.colons = colons;
      this.name = tok.name;
    }
    get text() {
      return define(this, 'text', `${this.colons}${this.name}(${this.args.join(',')})`);
    }
  }

  class Combinator extends SyntaxUnit {
    constructor(token) {
      const {value} = token;
      super(value, token,
        value === '>' ? 'child' :
        value === '+' ? 'adjacent-sibling' :
        value === '~' ? 'sibling' :
        value === '||' ? 'column' :
        !value.trim() ? 'descendant' :
          'unknown');
    }
  }

  class PropName extends SyntaxUnit {
    constructor(text, pos, hack) {
      super(text, pos, '');
      this.hack = hack;
    }
    toString() {
      return (this.hack || '') + this.text;
    }
  }

  /**
   * A single value between ":" and ";", that is if there are multiple values
   * separated by commas, this type represents just one of the values.
   */
  class PropValue extends SyntaxUnit {
    constructor(parts, pos = parts[0]) {
      super('', pos, 'val');
      this.parts = parts;
    }
    get text() {
      return define(this, 'text', this.parts.join(' '));
    }
  }

  class PropValueFunc extends SyntaxUnit {
    constructor(tok, name = tok.name) {
      const {uri} = tok;
      if (uri) {
        super('', tok, 'uri');
        this.uri = uri;
      } else if ( // Checking string equality is much faster than regexp
        name === 'rgb' || name === 'rgba' || name === 'hsl' || name === 'hsla' ||
        name === 'lab' || name === 'lch' || name === 'oklab' || name === 'oklch' ||
        name === 'hwb' || name === 'color' || name === 'color-mix'
      ) {
        super('', tok, 'color');
      } else {
        super('', tok, 'fn');
        this.isCalc = !(
          this.isVar = name === 'var' || name === 'env'
        ) && (name === 'calc' || name === 'clamp' || name === 'min' || name === 'max');
      }
    }
    get text() {
      return define(this, 'text', `${this.prefix || ''}${this.name}(${this.expr || this.uri || ''})`);
    }
  }

  class PropValueNumber extends SyntaxUnit {
    constructor(val, tok, num) {
      super(val, tok, tok.unitsType);
      let x = val === '0';
      this.is0 = x;
      this.isInt = x ||
        // Numbers like 1e-2 or 1e2 or 1. aren't integers
        // Checking int32 and string equality is much faster than regexp
        (num === (num | 0)) && (
          val === (x = `${num}${tok.units || ''}`) ||
          val.length === x.length + 1 && val[0] === '+' && val.endsWith(x)
        );
      this.units = tok.units;
      this.value = num;
    }
  }

  class PropValueMaybeColor extends SyntaxUnit {
    get type() {
      return define(this, 'type', rxNamedColor.test(this.text) ? 'color' : 'ident');
    }
    set type(val) {}
  }

  function PropValueUnit(tok) {
    if (!tok) return;
    let {type, value: val, number: n} = tok;
    if (n != null) {
      tok = new PropValueNumber(val, tok, n);
    } else if (type === Tokens.HASH) {
      tok = new SyntaxUnit(val, tok, 'color');
    } else if (type === Tokens.STRING) {
      tok = new SyntaxUnit(parseString(val), tok, 'string');
      tok.raw = val;
    } else if (type === Tokens.IDENT) {
      tok = tok.isCust ? new SyntaxUnit(val, tok, 'custom-prop')
        : val.length < 3 || val.length > 20
          ? new SyntaxUnit(val, tok, 'ident')
          : new PropValueMaybeColor(val, tok, '');
    } else if ((n = tok.name)) {
      tok = new PropValueFunc(tok, n);
    } else {
      tok = new SyntaxUnit(val, tok, '');
      if (type === Tokens.USO_VAR) tok.isVar = true;
    }
    return tok;
  }

  class PropValueIterator {
    /**
     * @param {PropValue} value
     */
    constructor(value) {
      this._i = 0;
      this._parts = value.parts;
      this._marks = [];
      this.value = value;
      this.hasNext = this._parts.length > 0;
    }
    /** @returns {SyntaxUnit|null} */
    peek(count = 0) {
      return this._parts[this._i + count];
    }
    /** @returns {?SyntaxUnit} */
    next() {
      if (this.hasNext) {
        this.hasNext = this._i + 1 < this._parts.length;
        return this._parts[this._i++];
      }
    }
    /** @returns {PropValueIterator} */
    mark() {
      this._marks.push(this._i);
      return this;
    }
    popMark(success) {
      const i = this._marks.pop();
      if (!success && i != null) {
        this._i = i;
        this.hasNext = i < this._parts.length;
      }
      return success;
    }
    resetTo(i) {
      this._i = i;
      this.hasNext = this._parts.length > i;
    }
  }

  //#endregion
  //#region ValidationTypes - implementation

  function vtCompile(id, val, obj = VTComplex) {
    val = obj[id] = val.call ? val(Matcher) : Object.assign(Matcher.parse(val), {_text: val});
    return val;
  }

  function vtDescribe(type) {
    const complex = VTComplex[type] || type[0] === '<' && Properties[type.slice(1, -1)];
    return complex instanceof Matcher ? complex.toString(0) : vtExplode(type);
  }

  function vtExplode(text) {
    return text.includes('<') ? Matcher.parse(text).toString(0) : text;
  }

  /** @param {SyntaxUnit} p */
  function vtIsAttr(p) {
    return p.name === 'attr' && (p = p.expr) && (p = p.parts) && (p = p[0]) &&
      p.tokenType === Tokens.IDENT;
  }

  /** @param {SyntaxUnit} p */
  function vtIsLength(p) {
    return p.type === 'length' || p.is0 || p.isCalc;
  }

  /** @param {SyntaxUnit} p */
  function vtIsPct(p) {
    return p.type === 'pct' || p.is0 || p.isCalc;
  }

  //#endregion
  //#region Validation

  const validationCache = new Map();

  function validateProperty(name, value, stream, Props) {
    const pp = value.parts;
    if (pp[0].type === 'ident' && GlobalKeywords.includes(pp[0].text.toLowerCase())) {
      if (pp[1]) failValidation(pp[1], true);
      return;
    }
    Props = typeof Props === 'string' ? ScopedProperties[Props] : Props || Properties;
    let prop = name.toLowerCase();
    let spec, result;
    do spec = Props[prop] || Props[''] && (Props = Properties)[prop];
    while (!spec && (result = rxVendorPrefix.exec(prop))[1] && (prop = result[2]));
    if (typeof spec === 'number' || !spec && name.startsWith('-')) {
      return;
    }
    if (!spec) {
      prop = Props === Properties || !Properties[prop] ? 'Unknown' : 'Misplaced';
      throw new ValidationError(`${prop} property '${name}'.`, value);
    }
    if (hasVarParts(value)) {
      return;
    }
    const valueSrc = stream._reader._input.slice(pp[0].offset, stream.LT(1).offset);
    let known = validationCache.get(prop);
    if (known && known.has(valueSrc)) {
      return;
    }
    // Property-specific validation.
    const expr = new PropValueIterator(value);
    const m = Matcher.parse(spec);
    result = m.match(expr);
    if ((!result || expr.hasNext) && /\battr\(/i.test(valueSrc)) {
      if (!result) {
        expr.tryAttr = true;
        expr.resetTo(0);
        result = m.match(expr);
      }
      for (let p; (p = expr.peek()) && vtIsAttr(p);) {
        expr.next();
      }
    }
    if (result) {
      if (expr.hasNext) failValidation(expr.next());
    } else if (expr.hasNext && expr._i) {
      failValidation(expr.peek());
    } else {
      failValidation(expr.value, vtDescribe(spec));
    }
    if (!known) validationCache.set(prop, (known = new Set()));
    known.add(valueSrc);
  }

  //#endregion
  //#region TokenStream

  const LT_SIZE = 5;

  /**
   * Generic TokenStream providing base functionality.
   * @typedef TokenStream
   */
  class TokenStream {

    constructor(input) {
      this._reader = new StringReader(input ? input.toString() : '');
      this.resetLT();
    }

    resetLT() {
      /** @type {parserlib.Token} Last consumed token object */
      this._token = null;
      // Lookahead token buffer.
      this._lt = Array(LT_SIZE).fill(null);
      this._ltIndex = 0;
      this._ltAhead = 0;
      this._ltShift = 0;
    }

    /**
     * Consumes the next token if that matches any of the given token type(s).
     * @param {number|number[]} tokenTypes
     * @param {string|string[]} [values]
     * @return {parserlib.Token|boolean|number} token or `false` or EOF (0)
     */
    match(tokenTypes, values) {
      const isArray = typeof tokenTypes === 'object';
      for (let token, tt; (tt = (token = this.get(true)).type);) {
        if ((isArray ? tokenTypes.includes(tt) : tt === tokenTypes) &&
            (!values || values.some(lowerCmpThis, token.value))) {
          return token;
        }
        if (tt !== Tokens.COMMENT) {
          if (!tt) return 0;
          break;
        }
      }
      this.unget();
      return false;
    }

    /**
     * @param {Number|Number[]} tokenTypes
     * @param {Boolean} [skipCruftBefore=true] - skip comments/whitespace before matching
     * @returns {Object} token
     */
    mustMatch(tokenTypes, skipCruftBefore = true) {
      if (skipCruftBefore && tokenTypes !== Tokens.S) {
        this.skipComment(true);
      }
      return this.match(tokenTypes) ||
        this.throwUnexpected(this.LT(1), tokenTypes);
    }

    /**
     * Keeps reading until one of the specified token types is found or EOF.
     * @param {number|number[]} tokenTypes
     */
    advance(tokenTypes) {
      let tok;
      while ((tok = this.match(tokenTypes)) === false) {/**/}
      return tok;
    }

    /**
     * Consumes the next token from the token stream.
     * @param {boolean} [asToken]
     * @return {number|parserlib.Token} The token type
     */
    get(asToken) {
      const i = this._ltIndex;
      const next = i + 1;
      const slot = (i + this._ltShift) % LT_SIZE;
      if (i < this._ltAhead) {
        this._ltIndex = next;
        const token = this._token = this._lt[slot];
        return asToken ? token : token.type;
      }
      const token = this._getToken();
      const {type} = token;
      const hide = type && (Tokens[type] || {}).hide;
      if (type >= 0 && !hide) {
        this._token = token;
        this._lt[slot] = token;
        if (this._ltAhead < LT_SIZE) {
          this._ltIndex = next;
          this._ltAhead++;
        } else {
          this._ltShift = (this._ltShift + 1) % LT_SIZE;
        }
      }
      // Skip to the next token if the token type is marked as hidden.
      return hide ? this.get(asToken) :
        asToken ? token : type;
    }

    /**
     * Looks ahead a certain number of tokens and returns the token at that position.
     * @param {number} index The index of the token type to retrieve.
     *         0 for the current token, 1 for the next, -1 for the previous, etc.
     * @param {boolean} [forceCache] won't call get() so it's useful in fast tentative checks
     * @return {Object} The token
     * @throws if you lookahead past EOF, past the size of the lookahead buffer,
     *         or back past the first token in the lookahead buffer.
     */
    LT(index, forceCache) {
      if (!index) {
        return this._token;
      }
      let i = index + this._ltIndex - (index > 0);
      if (index < 0 ? i >= 0 : i < this._ltAhead) {
        return this._lt[(i + this._ltShift) % LT_SIZE];
      } else if (forceCache) {
        return false;
      }
      if (index < 0) {
        throw new Error('Too much lookbehind.');
      }
      if (index > LT_SIZE) {
        throw new Error('Too much lookahead.');
      }
      i = index;
      const oldToken = this._token;
      while (i && i--) this.get();
      const token = this._token;
      this._ltIndex -= index;
      this._token = oldToken;
      return token;
    }

    /** Returns the token type for the next token in the stream without consuming it. */
    peek() {
      return this.LT(1).type;
    }

    /** Restores the last consumed token to the token stream. */
    unget() {
      if (this._ltIndex) {
        this._ltIndex--;
        this._token = this._lt[(this._ltIndex - 1 + this._ltShift + LT_SIZE) % LT_SIZE];
      } else {
        throw new Error('Too much lookahead.');
      }
    }

    throwUnexpected(token = this._token, expected = []) {
      expected = (Array.isArray(expected) ? expected : [expected])
        .map(e => typeof e === 'string' ? e : getTokenName(e))
        .join(', ');
      const msg = expected
        ? `Expected ${expected} but found '${token.value}'.`
        : `Unexpected '${token.value}'.`;
      throw new SyntaxError(msg, token);
    }

    /**
     * @param {Boolean} [skipWS] - skip whitespace too
     * @param {Boolean} [skipUsoVar] - skip USO_VAR too
     */
    skipComment(skipWS, skipUsoVar) {
      const tt = this.LT(1, true).type;
      if (skipWS && tt === Tokens.S ||
          skipUsoVar && tt === Tokens.USO_VAR ||
          tt === Tokens.COMMENT ||
          tt == null && this._ltIndex === this._ltAhead && (
            skipWS && this._reader.readMatch(/\s+/y),
            this._reader.peekTest(/\/\*/y))) {
        while (this.match(skipUsoVar ? TT.usoS : Tokens.S)) { /*NOP*/ }
      }
    }

    /**
     * @returns {Object} token
     */
    _getToken() {
      const reader = this._reader;
      /** @namespace parserlib.Token */
      const tok = {
        __proto__: null,
        value: '',
        type: Tokens.CHAR,
        col: reader._col,
        line: reader._line,
        offset: reader._cursor,
      };
      let a = tok.value = reader.read();
      let b = reader.peek();
      if (a === '\\') {
        if (b === '\n' || b === '\f') return tok;
        a = tok.value = this.readEscape();
        b = reader.peek();
      }
      switch (a) {
        case ' ':
        case '\n':
        case '\r':
        case '\t':
        case '\f':
          tok.type = Tokens.S;
          if (/\s/.test(b)) {
            tok.value += reader.readMatch(/\s+/y) || '';
          }
          return tok;
        case '{':
          tok.type = Tokens.LBRACE;
          return tok;
        case '(':
          tok.type = Tokens.LPAREN;
          return tok;
        case '[':
          tok.type = Tokens.LBRACKET;
          return tok;
        case '/':
          if (b === '*') {
            const str = tok.value = this.readComment(a);
            tok.type = str.startsWith('/*[[') && str.endsWith(']]*/')
              ? Tokens.USO_VAR
              : Tokens.COMMENT;
          } else {
            tok.type = Tokens.SLASH;
          }
          return tok;
        case '|':
        case '~':
        case '^':
        case '$':
        case '*':
          if (b === '=') {
            a = tok.value = a + reader.read();
          } else if (a === '|' && b === '|') {
            reader.read();
            a = tok.value = '||';
          }
          tok.type = TokenTypeByText[a] || Tokens.CHAR;
          return tok;
        case '"':
        case "'":
          return this.stringToken(a, tok);
        case '#':
          if (b === '-' || b === '\\' || b === '_' || b >= '0' && b <= '9' ||
              b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '\u00A0' && b <= '\uFFFF') {
            tok.type = Tokens.HASH;
            tok.value = this.readName(a);
          }
          return tok;
        case '.':
          if (b >= '0' && b <= '9') {
            this.numberToken(a, tok);
          } else {
            tok.type = Tokens.DOT;
          }
          return tok;
        case '-':
          // could be closing HTML-style comment or CSS variable
          if (b === '-') {
            if (reader.peekTest(/-\w/yu)) {
              this.identOrFunctionToken(a, tok);
              tok.isCust = true;
            } else if (reader.readMatch('->')) {
              tok.type = Tokens.CDC;
              tok.value = '-->';
            }
          } else if (b >= '0' && b <= '9' || b === '.' && reader.peekTest(/\.\d/y)) {
            this.numberToken(a, tok);
          } else if (isIdentStart(b)) {
            this.identOrFunctionToken(a, tok);
          } else {
            tok.type = Tokens.MINUS;
          }
          return tok;
        case '+':
          if (b >= '0' && b <= '9' || b === '.' && reader.peekTest(/\.\d/y)) {
            this.numberToken(a, tok);
          } else {
            tok.type = Tokens.COMBINATOR;
          }
          return tok;
        case '!':
          return this.importantToken(a, tok);
        case '@':
          return this.atRuleToken(a, tok);
        case ':': {
          const func = /[-hniw]/i.test(b) &&
            reader.readMatch(/(?:-(?:moz|webkit)-)?(has|not|is|where|any)\(/iy);
          if (func) {
            tok.name = RegExp.$1.toLowerCase();
            tok.type = Tokens.PSEUDO_FUNC_SEL;
            tok.value += func.slice(0, -1);
          } else {
            tok.type = Tokens.COLON;
          }
          return tok;
        }
        case '<':
          if (b === '!' && reader.readMatch('!--')) {
            tok.type = Tokens.CDO;
            tok.value = '<!--';
          }
          return tok;
        // EOF
        case null:
          tok.type = Tokens.EOF;
          return tok;
        case 'U':
        case 'u':
          return b === '+'
            ? this.unicodeRangeToken(a, tok)
            : this.identOrFunctionToken(a, tok);
      }
      if (a >= '0' && a <= '9') {
        this.numberToken(a, tok);
      } else if (isIdentStart(a)) {
        this.identOrFunctionToken(a, tok);
      } else {
        tok.type = TokenTypeByText[a] || Tokens.CHAR;
      }
      return tok;
    }

    atRuleToken(first, token) {
      this._reader.mark();
      let rule = first + this.readName();
      let tt = TokenTypeByText[rule.toLowerCase()] || -1;
      // if it's not valid, use the first character only and reset the reader
      if (tt === Tokens.CHAR || tt === Tokens.UNKNOWN) {
        if (rule.length > 1) {
          tt = Tokens.UNKNOWN_SYM;
        } else {
          tt = Tokens.CHAR;
          rule = first;
          this._reader.reset();
        }
      }
      token.type = tt;
      token.value = rule;
      return token;
    }

    identOrFunctionToken(first, token) {
      const reader = this._reader;
      const name = token.value = this.readChunksWithEscape(first, rxNameCharNoEsc);
      const next = reader.readMatch(lowerCmp(name, 'progid') ? /[:(]/y : '(');
      if (next === '(') {
        const n = name.toLowerCase();
        const uri = isUriIdent(n) && this.readUriValue();
        const vp = n[0] === '-' && rxVendorPrefix.exec(n);
        token.type = uri ? Tokens.URI : Tokens.FUNCTION;
        token.name = vp ? vp[2] : n;
        if (uri) token.uri = uri;
        if (vp && vp[1]) token.prefix = vp[1];
      } else if (next === ':') {
        token.type = Tokens.IE_FUNCTION;
        token.name = (token.value = reader.readMatch(/.*?\(/).slice(0, -1))
          .toLowerCase();
        token.prefix = name + ':';
      } else {
        token.type = Tokens.IDENT;
      }
      return token;
    }

    importantToken(first, token) {
      const reader = this._reader;
      let text = first;
      reader.mark();
      for (let pass = 1; pass++ <= 2;) {
        const important = reader.readMatch(/\s*important\b/iy);
        if (important) {
          token.type = Tokens.IMPORTANT;
          token.value = text + important;
          return token;
        }
        const comment = reader.readMatch('/*');
        if (!comment) break;
        text += this.readComment(comment);
      }
      reader.reset();
      return token;
    }

    numberToken(first, token) {
      const reader = this._reader;
      const value = first + (
        this._reader.readMatch(
          first === '.' ?
            /\d+(e[+-]?\d+)?/iy :
          first >= '0' && first <= '9' ?
            /\d*\.?\d*(e[+-]?\d+)?/iy :
            /(\d*\.\d+|\d+\.?\d*)(e[+-]?\d+)?/iy
        ) || '');
      let tt, type;
      let units = reader.readMatch(rxIdentStartPct);
      if (units === '%') {
        type = 'pct';
        tt = Tokens.PERCENTAGE;
      } else if (units) {
        units = this.readName(units);
        type = UNITS[units] || UNITS[units.toLowerCase()];
        tt = type && Tokens[type.toUpperCase()] || Tokens.DIMENSION;
      } else {
        type = 'number';
        tt = Tokens.NUMBER;
      }
      token.type = tt;
      token.value = units ? value + units : value;
      token.number = parseFloat(value);
      if (units) token.units = units;
      if (type) token.unitsType = type;
      return token;
    }

    stringToken(first, token) {
      const delim = first;
      const reader = this._reader;
      let string = first || '';
      let tt = Tokens.STRING;
      let c;
      while (true) {
        c = reader.readMatch(/[^\n\r\f\\'"]+|./y);
        if (!c) break;
        string += c;
        if (c === '\\') {
          c = reader.read();
          if (!c) break; // premature EOF after backslash
          string += c;
          if (c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F' ||
              c === '\n' || c === '\r' || c === '\f') {
            // read up to six hex digits + newline
            string += reader.readMatch(/[0-9a-f]{1,6}\n?/yi);
          }
        } else if (c === delim) {
          break; // delimiter found.
        } else if ((c = reader.peek()) && (c === '\n' || c === '\r' || c === '\f')) {
          // newline without an escapement: it's an invalid string
          tt = Tokens.INVALID;
          break;
        }
      }
      token.type = c ? tt : Tokens.INVALID; // if the string wasn't closed
      token.value = string;
      return token;
    }

    unicodeRangeToken(first, token) {
      const reader = this._reader;
      reader.mark();
      token.value += reader.read(); // +
      let chunk = this.readUnicodeRangePart(true);
      if (!chunk) {
        reader.reset();
        return token;
      }
      token.value += chunk;
      // if there's a ? in the first part, there can't be a second part
      if (!token.value.includes('?') && reader.peek() === '-') {
        reader.mark();
        reader.read();
        chunk = this.readUnicodeRangePart(false);
        if (!chunk) {
          reader.reset();
        } else {
          token.value += '-' + chunk;
        }
      }
      token.type = Tokens.UNICODE_RANGE;
      return token;
    }

    readUnicodeRangePart(allowQuestionMark) {
      const reader = this._reader;
      let part = reader.readMatch(/[0-9a-f]{1,6}/iy);
      while (allowQuestionMark && part.length < 6 && reader.peek() === '?') {
        part += reader.read();
      }
      return part;
    }

    // returns null w/o resetting reader if string is invalid.
    readString(first = this._reader.read()) {
      const token = this.stringToken(first, {});
      return token.type !== Tokens.INVALID ? token.value : null;
    }

    // consumes the closing ")" on success
    readUriValue() {
      const reader = this._reader;
      reader.mark();
      let v = reader.readMatch(/\s*['"]?/y).trim();
      if (!v) v = this.readChunksWithEscape('', rxUnquotedUrlCharNoEsc);
      else if ((v = this.readString(v))) v = parseString(v);
      if (v != null && reader.readMatch(/\s*\)/y)) {
        return v;
      }
      reader.reset();
    }

    readName(first) {
      return this.readChunksWithEscape(first, rxNameCharNoEsc);
    }

    readEscape() {
      let res = this._reader.readMatch(/[0-9a-f]{1,6}\s?/iy);
      if (res) {
        res = parseInt(res, 16);
        res = String.fromCodePoint(res && res <= 0x10FFFF ? res : 0xFFFD);
      } else {
        res = this._reader.read();
      }
      return res;
    }

    /**
     * @param {?string} first
     * @param {RegExp} rx - must not match \\
     * @returns {string}
     */
    readChunksWithEscape(first, rx) {
      const reader = this._reader;
      let url = first || '';
      while (true) {
        let c = reader.readMatch(rx);
        if (c) url += c;
        if (reader.peek() === '\\' && (c = reader.peek(2)) &&
            !(c === '\n' || c === '\r' || c === '\f')) {
          reader.read();
          url += this.readEscape();
        } else {
          break;
        }
      }
      return url;
    }

    readComment(first) {
      return first +
             this._reader.readCount(2 - first.length) +
             this._reader.readMatch(/([^*]+|\*(?!\/))*(\*\/|$)/y);
    }

    /**
     * @param {boolean} [omitComments]
     * @param {string} [stopOn] - goes to the parent if used at the top nesting level of the value,
       specifying an empty string will stop after consuming the first encountered top block.
     * @returns {?string}
     */
    readDeclValue({omitComments, stopOn = ';!})'} = {}) {
      const reader = this._reader;
      const endings = [];
      const rx = stopOn.includes(';')
        ? /([^;!'"{}()[\]/\\]|\/(?!\*))+/y
        : /([^'"{}()[\]/\\]|\/(?!\*))+/y;
      let value = '';
      let end = stopOn;
      while (!reader.eof()) {
        let c = reader.readMatch(rx);
        if (c) value += c;
        reader.mark();
        c = reader.read();
        if (!endings.length && stopOn.includes(c)) {
          reader.reset();
          break;
        }
        if (c === '\\') {
          value += this.readEscape();
        } else if (c === '/') {
          value += this.readComment(c);
          if (omitComments) value.pop();
        } else if (c === '"' || c === "'") {
          value += this.readString(c);
        } else if (c === '{' || c === '(' || c === '[') {
          value += c;
          endings.push(end);
          end = c === '{' ? '}' : c === '(' ? ')' : ']';
        } else if (c === '}' || c === ')' || c === ']') {
          if (!end.includes(c)) {
            reader.reset();
            return null;
          }
          value += c;
          end = endings.pop();
          if (!end && !stopOn) {
            break;
          }
        } else {
          value += c;
        }
      }
      return value;
    }

    readUnknownSym() {
      const reader = this._reader;
      let prelude = '';
      let block;
      while (true) {
        let c = reader.peek();
        if (!c) this.throwUnexpected();
        if (c === '{') {
          block = this.readDeclValue({stopOn: ''});
          break;
        } else if (c === ';') {
          reader.read();
          break;
        } else {
          c = this.readDeclValue({omitComments: true, stopOn: ';{}'});
          if (!c) break;
          prelude += c;
        }
      }
      return {prelude: prelude.replace(/^\s+/, ''), block};
    }
  }

  //#endregion
  //#region parserCache

  /**
   * Caches the results and reuses them on subsequent parsing of the same code
   */
  const parserCache = (() => {
    const MAX_DURATION = 10 * 60e3;
    const TRIM_DELAY = 10e3;
    // all blocks since page load; key = text between block start and { inclusive
    const data = new Map();
    // nested block stack
    const stack = [];
    // performance.now() of the current parser
    let generation = null;
    // performance.now() of the first parser after reset or page load,
    // used for weighted sorting in getBlock()
    let generationBase = null;
    let parser = null;
    let stream = null;

    return {
      start(newParser) {
        parser = newParser;
        if (!parser) {
          data.clear();
          stack.length = 0;
          generationBase = performance.now();
          return;
        }
        stream = parser._tokenStream;
        generation = performance.now();
        trim();
      },
      addEvent(event) {
        if (!parser) return;
        for (let i = stack.length; --i >= 0;) {
          const {offset, endOffset, events} = stack[i];
          if (event.offset >= offset && (!endOffset || event.offset <= endOffset)) {
            events.push(event);
            return;
          }
        }
      },
      findBlock(token = getToken()) {
        if (!token) return;
        const reader = stream._reader;
        const input = reader._input;
        const start = token.offset;
        const key = input.slice(start, input.indexOf('{', start) + 1);
        let block = data.get(key);
        if (!block || !(block = getBlock(block, input, start, key))) return;
        shiftBlock(block, start, token.line, token.col);
        reader._cursor = block.endOffset;
        reader._line = block.endLine;
        reader._col = block.endCol;
        stream.resetLT();
        parser._ws();
        return true;
      },
      startBlock(start = getToken()) {
        if (!start) return;
        stack.push({
          text: '',
          events: [],
          generation: generation,
          line: start.line,
          col: start.col,
          offset: start.offset,
          endLine: undefined,
          endCol: undefined,
          endOffset: undefined,
        });
        return stack.length;
      },
      endBlock(end = getToken()) {
        if (!parser) return;
        const block = stack.pop();
        block.endLine = end.line;
        block.endCol = end.col + end.value.length;
        block.endOffset = end.offset + end.value.length;

        const input = stream._reader._input;
        const key = input.slice(block.offset, input.indexOf('{', block.offset) + 1);
        block.text = input.slice(block.offset, block.endOffset);

        let blocks = data.get(key);
        if (!blocks) data.set(key, (blocks = []));
        blocks.push(block);
      },
      cancelBlock: pos => pos === stack.length && stack.length--,
      feedback({messages}) {
        messages = new Set(messages);
        for (const blocks of data.values()) {
          for (const block of blocks) {
            if (!block.events.length) continue;
            if (block.generation !== generation) continue;
            const {
              line: L1,
              col: C1,
              endLine: L2,
              endCol: C2,
            } = block;
            let isClean = true;
            for (const msg of messages) {
              const {line, col} = msg;
              if (L1 === L2 && line === L1 && C1 <= col && col <= C2 ||
                  line === L1 && col >= C1 ||
                  line === L2 && col <= C2 ||
                  line > L1 && line < L2) {
                messages.delete(msg);
                isClean = false;
              }
            }
            if (isClean) block.events.length = 0;
          }
        }
      },
    };

    /**
     * Removes old entries from the cache.
     * 'Old' means older than MAX_DURATION or half the blocks from the previous generation(s).
     * @param {Boolean} [immediately] - set internally when debounced by TRIM_DELAY
     */
    function trim(immediately) {
      if (!immediately) {
        clearTimeout(trim.timer);
        trim.timer = setTimeout(trim, TRIM_DELAY, true);
        return;
      }
      const cutoff = performance.now() - MAX_DURATION;
      for (const [key, blocks] of data.entries()) {
        const halfLen = blocks.length >> 1;
        const newBlocks = blocks
          .sort((a, b) => a.time - b.time)
          .filter((block, i) => block.generation > cutoff ||
                                block.generation !== generation && i < halfLen);
        if (!newBlocks.length) {
          data.delete(key);
        } else if (newBlocks.length !== blocks.length) {
          data.set(key, newBlocks);
        }
      }
    }

    // gets the matching block
    function getBlock(blocks, input, start, key) {
      // extracted to prevent V8 deopt
      const keyLast = Math.max(key.length - 1);
      const check1 = input[start];
      const check2 = input[start + keyLast];
      const generationSpan = performance.now() - generationBase;
      blocks = blocks
        .filter(({text, offset, endOffset}) =>
          text[0] === check1 &&
          text[keyLast] === check2 &&
          text[text.length - 1] === input[start + text.length - 1] &&
          text.startsWith(key) &&
          text === input.substr(start, endOffset - offset))
        .sort((a, b) =>
          // newest and closest will be the first element
          (a.generation - b.generation) / generationSpan +
          (Math.abs(a.offset - start) - Math.abs(b.offset - start)) / input.length);
      // identical blocks may produce different reports in CSSLint
      // so we need to either hijack an older generation block or make a clone
      const block = blocks.find(b => b.generation !== generation);
      return block || deepCopy(blocks[0]);
    }

    // Shifts positions of the block and its events, also fires the events
    function shiftBlock(block, cursor, line, col) {
      // extracted to prevent V8 deopt
      const deltaLines = line - block.line;
      const deltaCols = block.col === 1 && col === 1 ? 0 : col - block.col;
      const deltaOffs = cursor - block.offset;
      const hasDelta = deltaLines || deltaCols || deltaOffs;
      const shifted = new Set();
      for (const e of block.events) {
        if (hasDelta) {
          applyDelta(e, shifted, block.line, deltaLines, deltaCols, deltaOffs);
        }
        parser.fire(e, false);
      }
      block.generation = generation;
      block.endCol += block.endLine === block.line ? deltaCols : 0;
      block.endLine += deltaLines;
      block.endOffset = cursor + block.text.length;
      block.line += deltaLines;
      block.col += deltaCols;
      block.offset = cursor;
    }

    // Recursively applies the delta to the event and all its nested parts
    function applyDelta(obj, seen, line, lines, cols, offs) {
      if (seen.has(obj)) return;
      seen.add(obj);
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if ((typeof item === 'object' || Array.isArray(item)) && item) {
            applyDelta(item, seen, line, lines, cols, offs);
          }
        }
        return;
      }
      // applyDelta may get surpisingly slow on complex objects so we're using an array
      // because in js an array lookup is much faster than a property lookup
      const keys = Object.keys(obj);
      if (cols !== 0) {
        if (keys.includes('col') && obj.line === line) obj.col += cols;
        if (keys.includes('endCol') && obj.endLine === line) obj.endCol += cols;
      }
      if (lines !== 0) {
        if (keys.includes('line')) obj.line += lines;
        if (keys.includes('endLine')) obj.endLine += lines;
      }
      if (offs !== 0 && keys.includes('offset')) obj.offset += offs;
      for (const k of keys) {
        if (k !== 'col' && k !== 'endCol' &&
            k !== 'line' && k !== 'endLine' &&
            k !== 'offset') {
          const v = obj[k];
          if (v && typeof v === 'object') {
            applyDelta(v, seen, line, lines, cols, offs);
          }
        }
      }
    }

    // returns next token if it's already seen or the current token
    function getToken() {
      return parser && (stream.LT(1, true) || stream._token);
    }

    function deepCopy(obj) {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(deepCopy);
      }
      const copy = {};
      for (const k in obj) {
        copy[k] = deepCopy(obj[k]);
      }
      return copy;
    }
  })();

  //#endregion
  //#region Parser

  const ParserRoute = {};

  class Parser extends EventTarget {
    /**
     * @param {Object} [options]
     * @param {boolean} [options.ieFilters] - accepts IE < 8 filters instead of throwing
     * @param {boolean} [options.skipValidation] - skip syntax validation
     * @param {boolean} [options.starHack] - allows IE6 star hack
     * @param {boolean} [options.strict] - stop on errors instead of reporting them and continuing
     * @param {boolean} [options.topDocOnly] - quickly extract all top-level @-moz-document,
       their {}-block contents is retrieved as text using _simpleBlock()
     * @param {boolean} [options.underscoreHack] - interprets leading _ as IE6-7 for known props
     */
    constructor(options) {
      super();
      this.options = options || {};
      /** @type {TokenStream} */
      this._tokenStream = null;
    }

    /**
     * @param {string|Object} event
     * @param {parserlib.Token|SyntaxUnit} [token=this._tokenStream._token] - sets the position
     */
    fire(event, token = event.offset != null ? event : this._tokenStream._token) {
      if (typeof event === 'string') {
        event = {type: event};
      }
      if (event.offset === undefined && token) {
        event.offset = token.offset;
        if (event.line === undefined) event.line = token.line;
        if (event.col === undefined) event.col = token.col;
      }
      if (token !== false) parserCache.addEvent(event);
      super.fire(event);
    }

    /**
     * @layer <layer-name>#;
     * @layer <layer-name>? { <stylesheet> };
     */
    _layer(start) {
      const stream = this._tokenStream;
      const ids = [];
      let tok, val;
      do {
        this._ws();
        if ((tok = stream.get(true)).type === Tokens.IDENT) {
          ids.push(this._layerName(tok));
          this._ws();
          tok = stream.get(true);
        }
        if ((val = tok.value) === '{') {
          if (ids[1]) this.fire({type: 'error', message: '@layer block cannot have multiple ids'}, start);
          this.fire({type: 'startlayer', id: ids[0] || null}, start);
          this._rulesetBlock(start);
          this.fire('endlayer');
          this._ws();
          return;
        }
      } while (val === ',');
      if (val !== ';') stream.mustMatch(Tokens.SEMICOLON);
      this.fire({type: 'layer', ids}, start);
      this._ws();
    }

    _layerName(start) {
      let res = '';
      const stream = this._tokenStream;
      for (let tok; (tok = start || stream.match(Tokens.IDENT));) {
        res += tok.value + (stream.match(Tokens.DOT) ? '.' : '');
        start = false;
      }
      return res;
    }

    _stylesheet() {
      const stream = this._tokenStream;
      this.fire('startstylesheet');
      this._sheetGlobals();
      const {topDocOnly} = this.options;
      const allowedActions = topDocOnly ? ParserRoute.topDoc : ParserRoute.stylesheet;
      for (let tt, token; (tt = (token = stream.get(true)).type); this._skipCruft()) {
        try {
          const action = allowedActions[tt];
          if (action) {
            action.call(this, token);
            continue;
          }
          if (topDocOnly) {
            stream.readDeclValue({stopOn: '{}'});
            if (stream._reader.peek() === '{') {
              stream.readDeclValue({stopOn: ''});
            }
            continue;
          }
          stream.unget();
          if (!this._ruleset() && stream.peek() !== Tokens.EOF) {
            stream.throwUnexpected(stream.get(true));
          }
        } catch (ex) {
          if (ex instanceof SyntaxError && !this.options.strict) {
            this.fire(Object.assign({}, ex, {type: 'error', error: ex}));
          } else {
            ex.message = ex.stack;
            ex.line = token.line;
            ex.col = token.col;
            throw ex;
          }
        }
      }
      this.fire('endstylesheet');
    }

    _sheetGlobals() {
      const stream = this._tokenStream;
      this._skipCruft();
      for (const [type, fn, max = Infinity] of [
        [Tokens.CHARSET_SYM, this._charset, 1],
        [Tokens.LAYER_SYM, this._layer],
        [Tokens.IMPORT_SYM, this._import],
        [Tokens.NAMESPACE_SYM, this._namespace],
      ]) {
        for (let i = 0; i++ < max && stream.peek() === type;) {
          fn.call(this, stream.get(true));
          this._skipCruft();
        }
      }
    }

    _charset(start) {
      const stream = this._tokenStream;
      const charset = stream.mustMatch(Tokens.STRING).value;
      stream.mustMatch(Tokens.SEMICOLON);
      this.fire({type: 'charset', charset}, start);
    }

    _import(start) {
      const stream = this._tokenStream;
      let layer;
      let tok = stream.mustMatch(TT.stringUri);
      const uri = tok.uri || parseString(tok.value);
      this._ws();
      tok = stream.get(true);
      if ((tok.name || tok.value.toLowerCase()) === 'layer') {
        layer = tok.name ? this._layerName() : '';
        if (tok.name) stream.mustMatch(Tokens.RPAREN);
        this._ws();
        tok = stream.get(true);
      }
      if (tok.name === 'supports') {
        this._ws();
        if (!this._declaration()) this._supportsCondition();
        stream.mustMatch(Tokens.RPAREN);
      } else {
        stream.unget();
      }
      const media = this._mediaQueryList();
      stream.mustMatch(Tokens.SEMICOLON);
      this.fire({type: 'import', layer, media, uri}, start);
      this._ws();
    }

    _namespace(start) {
      const stream = this._tokenStream;
      this._ws();
      const prefix = stream.match(Tokens.IDENT).value;
      if (prefix) this._ws();
      const token = stream.mustMatch(TT.stringUri);
      const uri = token.uri || parseString(token.value);
      stream.mustMatch(Tokens.SEMICOLON);
      this.fire({type: 'namespace', prefix, uri}, start);
      this._ws();
    }

    _container(start) {
      this._ws();
      const stream = this._tokenStream;
      const next = stream.get(true).value;
      let name;
      if (/^(\(|not)$/i.test(next)) {
        stream.unget();
      } else {
        name = next;
        stream.mustMatch(Tokens.S);
      }
      // TODO: write a proper condition parser
      const condition = stream.readDeclValue({omitComments: true, stopOn: ';{}'});
      stream.mustMatch(Tokens.LBRACE);
      this.fire({type: 'startcontainer', name, condition}, start);
      this._rulesetBlock(start);
      this.fire('endcontainer');
      this._ws();
    }

    _supports(start) {
      const stream = this._tokenStream;
      this._ws();
      this._supportsCondition();
      stream.mustMatch(Tokens.LBRACE);
      this.fire('startsupports', start);
      this._rulesetBlock(start);
      this.fire('endsupports');
      this._ws();
    }

    _supportsCondition() {
      const stream = this._tokenStream;
      if (stream.match(Tokens.IDENT, ['not'])) {
        stream.mustMatch(Tokens.S);
        this._supportsConditionInParens();
      } else {
        this._supportsConditionInParens();
        while (stream.match(Tokens.IDENT, ['and', 'or'])) {
          this._ws();
          this._supportsConditionInParens();
        }
      }
    }

    _supportsConditionInParens() {
      const stream = this._tokenStream;
      if (stream.match(Tokens.LPAREN)) {
        this._ws();
        const {type, value} = stream.LT(1);
        if (type === Tokens.IDENT) {
          if (/^not$/i.test(value)) {
            this._supportsCondition();
            stream.mustMatch(Tokens.RPAREN);
          } else {
            this._supportsDecl(false);
          }
        } else {
          this._supportsCondition();
          stream.mustMatch(Tokens.RPAREN);
        }
      } else if (stream.match(Tokens.FUNCTION, ['selector'])) {
        this._ws();
        const selector = this._selector();
        this.fire({type: 'supportsSelector', selector}, selector);
        stream.mustMatch(Tokens.RPAREN);
      } else {
        this._supportsDecl();
      }
      this._ws();
    }

    _supportsDecl(requireStartParen = true) {
      const stream = this._tokenStream;
      if (requireStartParen) {
        stream.mustMatch(Tokens.LPAREN);
      }
      this._ws();
      this._declaration();
      stream.mustMatch(Tokens.RPAREN);
    }

    _media(start) {
      const stream = this._tokenStream;
      this._ws();
      const mediaList = this._mediaQueryList();
      stream.mustMatch(Tokens.LBRACE);
      this.fire({
        type: 'startmedia',
        media: mediaList,
      }, start);
      this._rulesetBlock(start);
      this.fire({
        type: 'endmedia',
        media: mediaList,
      });
      this._ws();
    }

    _mediaQueryList() {
      const stream = this._tokenStream;
      const mediaList = [];
      this._ws();
      if ([Tokens.IDENT, Tokens.LPAREN].includes(stream.peek())) {
        mediaList.push(this._mediaQuery());
      }
      while (stream.match(Tokens.COMMA)) {
        this._ws();
        mediaList.push(this._mediaQuery());
      }
      return mediaList;
    }

    _mediaQuery() {
      const stream = this._tokenStream;
      const expressions = [];
      const mod = stream.match(Tokens.IDENT, ['only', 'not']);
      let type = null;
      this._ws();
      const next = stream.LT(1);
      if (next.type === Tokens.IDENT) {
        type = this._mediaFeature();
      } else if (next.value === '(') {
        expressions.push(this._mediaExpression());
      } else {
        return;
      }
      for (let c; (this._ws(), c = stream.match(Tokens.IDENT).value);) {
        if (/^and$/i.test(c) || !type && /^or$/i.test(c)) {
          this._ws();
          expressions.push(this._mediaExpression());
        } else {
          stream.throwUnexpected(undefined, ["'and'", !type && "'or'"].filter(Boolean));
        }
      }
      return new MediaQuery(mod.value, type, expressions, mod || next);
    }

    _mediaExpression() {
      const stream = this._tokenStream;
      stream.mustMatch(Tokens.LPAREN);
      const feature = this._mediaFeature(TT.mediaValue);
      for (let b, pass = 0; ++pass <= 2;) {
        this._ws();
        b = stream.get(true).value;
        if (/^[:=<>]$/.test(b)) {
          const isRange = /[<>]/.test(b);
          if (isRange) stream.match(Tokens.EQUALS);
          this._ws();
          feature.expr = this._expression();
          if (!isRange) break;
        } else {
          stream.unget();
          feature.expr = null;
          break;
        }
      }
      stream.mustMatch(Tokens.RPAREN);
      this._ws();
      return feature; // TODO: construct the value properly
    }

    _mediaFeature(type = Tokens.IDENT) {
      return PropValueUnit(this._tokenStream.mustMatch(type));
    }

    _page(start) {
      const stream = this._tokenStream;
      this._ws();
      const id = stream.match(Tokens.IDENT).value;
      if (id && /^auto$/i.test(id)) {
        stream.throwUnexpected();
      }
      const pseudo = stream.match(Tokens.COLON)
        ? stream.mustMatch(Tokens.IDENT, false).value
        : null;
      this._ws();
      this.fire({type: 'startpage', id, pseudo}, start);
      this._readDeclarations({readMargins: true, Props: '@page'});
      this.fire({type: 'endpage', id, pseudo});
    }

    _margin() {
      const margin = PropValueUnit(this._tokenStream.match(Tokens.MARGIN_SYM));
      if (!margin) return false;
      this.fire({type: 'startpagemargin', margin});
      this._readDeclarations();
      this.fire({type: 'endpagemargin', margin});
      return true;
    }

    _fontFace(start) {
      this.fire('startfontface', start);
      this._ws();
      this._readDeclarations({Props: '@font-face'});
      this.fire('endfontface');
    }

    _fontPaletteValues(start) {
      this.fire({
        type: 'startfontpalettevalues',
        id: this._tokenStream.mustMatch(Tokens.IDENT),
      }, start);
      this._readDeclarations({Props: '@font-palette-values'});
      this.fire('endfontpalettevalues');
    }

    _viewport(start) {
      // only viewport-fit is allowed but we're reusing MediaQuery syntax unit,
      // and accept anything for the sake of simplicity since the spec isn't yet final:
      // https://drafts.csswg.org/css-round-display/#extending-viewport-rule
      const descriptors = this._mediaQueryList();
      this.fire({type: 'startviewport', descriptors}, start);
      this._ws();
      this._readDeclarations();
      this.fire({type: 'endviewport', descriptors});
    }

    _document(start) {
      const stream = this._tokenStream;
      const functions = [];
      const prefix = start.value.split('-')[1] || '';
      do {
        this._ws();
        const uri = stream.match(Tokens.URI);
        const fn = uri ? new PropValueFunc(uri) : this._function() || stream.LT(1);
        functions.push(fn);
        if (uri) this._ws();
      } while (stream.match(Tokens.COMMA));
      for (const fn of functions) {
        if (!isUriIdent(fn.name) && fn.name !== 'regexp') {
          this.fire({
            type: 'error',
            message: 'Expected url( or url-prefix( or domain( or regexp(, instead saw ' +
              getTokenName(fn.tokenType) + ' ' + fn.text,
          }, fn);
        }
      }
      stream.mustMatch(Tokens.LBRACE);
      this.fire({type: 'startdocument', functions, prefix}, start);
      if (this.options.topDocOnly) {
        stream.readDeclValue({stopOn: '}'});
        stream.mustMatch(Tokens.RBRACE);
      } else {
        /* We allow @import and such inside document sections because the final generated CSS for
         * a given page may be valid e.g. if this section is the first one that matched the URL */
        this._sheetGlobals();
        this._rulesetBlock(start);
      }
      this.fire({type: 'enddocument', functions, prefix});
      this._ws();
    }

    _documentMisplaced(start) {
      this.fire({
        type: 'error',
        message: 'Nested @document produces broken code',
      }, start);
      this._document(start);
    }

    _combinator() {
      const token = this._tokenStream.match(Tokens.COMBINATOR);
      if (token) {
        this._ws();
        return new Combinator(token);
      }
    }

    _ruleset() {
      const stream = this._tokenStream;
      let braceOpened, blk;
      try {
        stream.skipComment(true, true);
        if (parserCache.findBlock()) {
          return true;
        }
        const selectors = this._selectorsGroup();
        if (!selectors) {
          return false;
        }
        blk = parserCache.startBlock(selectors[0]);
        this.fire({type: 'startrule', selectors}, selectors[0]);
        this._readDeclarations({stopAfterBrace: true});
        braceOpened = true;
        this.fire({type: 'endrule', selectors});
        parserCache.endBlock();
        this._ws();
        return true;
      } catch (ex) {
        parserCache.cancelBlock(blk);
        if (!(ex instanceof SyntaxError) || this.options.strict) throw ex;
        this.fire(Object.assign({}, ex, {type: 'error', error: ex}));
        // if there's a right brace, the rule is finished so don't do anything
        // otherwise, rethrow the error because it wasn't handled properly
        if (braceOpened && !stream.advance(Tokens.RBRACE)) throw ex;
        // If even a single selector fails to parse, the entire ruleset should be thrown away,
        // so we let the parser continue with the next one
        return true;
      }
    }

    /** @param {parserlib.Token} start */
    _rulesetBlock(start) {
      const stream = this._tokenStream;
      const map = ParserRoute[start.type];
      this._ws();
      while (true) {
        const fn = map[stream.LT(1).type];
        if (fn) fn.call(this, stream.get(true));
        else if (!this._ruleset()) break;
        stream.skipComment();
      }
      stream.mustMatch(Tokens.RBRACE);
    }

    _selectorsGroup(relative) {
      const stream = this._tokenStream;
      const selectors = [];
      let comma;
      for (let sel; (sel = this._selector(!sel && relative));) {
        selectors.push(sel);
        this._ws(null, true);
        comma = stream.match(Tokens.COMMA);
        if (!comma) break;
        this._ws(null, true);
      }
      if (comma) stream.throwUnexpected(stream.LT(1));
      return selectors.length ? selectors : null;
    }

    _selector(relative) {
      const stream = this._tokenStream;
      const sel = [];
      let nextSel = null;
      let combinator = null;
      if (!relative || stream.LT(1).type !== Tokens.COMBINATOR) {
        nextSel = this._simpleSelectorSequence();
        if (!nextSel) {
          return null;
        }
        sel.push(nextSel);
      }
      while (true) {
        combinator = this._combinator();
        if (combinator) {
          sel.push(combinator);
          nextSel = this._simpleSelectorSequence();
          if (nextSel) {
            sel.push(nextSel);
            continue;
          }
          stream.throwUnexpected(stream.LT(1));
          break;
        }
        if (!this._ws(null, true)) {
          break;
        }
        // make a fallback whitespace combinator
        const ws = new Combinator(stream._token);
        // look for an explicit combinator
        combinator = this._combinator();
        // selector is required if there's a combinator
        nextSel = this._simpleSelectorSequence();
        if (nextSel) {
          sel.push(combinator || ws);
          sel.push(nextSel);
        } else if (combinator) {
          stream.throwUnexpected(stream.LT(1));
        }
      }
      return new PropValue(sel);
    }

    _simpleSelectorSequence() {
      const stream = this._tokenStream;
      const start = stream.LT(1);
      const modifiers = [];
      const ns = this._namespacePrefix(start) || '';
      const next = ns ? stream.LT(1) : start;
      const elementName = (next.value === '*' || next.type === Tokens.IDENT)
        ? this._typeSelector(ns, stream.get())
        : '';
      let text = '';
      if (elementName) {
        text += elementName;
      } else if (ns) {
        stream.unget();
      }
      while (true) {
        const token = stream.get(true);
        const action = ParserRoute.simpleSelectorSequence[token.type];
        const component = action ? action.call(this, token) : (stream.unget(), 0);
        if (!component) break;
        modifiers.push(component);
        text += component;
      }
      return text && new SelectorPart(elementName, modifiers, text, start);
    }

    _typeSelector(ns, token) {
      const name = new SelectorSubPart(ns + token.value, 'elementName', token);
      name.col -= ns.length;
      return name;
    }

    _hash(start) {
      return new SelectorSubPart(start.value, 'id', start);
    }

    _class(start) {
      const name = this._tokenStream.mustMatch(Tokens.IDENT, false).value;
      return new SelectorSubPart('.' + name, 'class', start);
    }

    _namespacePrefix(next) {
      const stream = this._tokenStream;
      const v = (next || (next = stream.LT(1))).value;
      return v === '|' ? v :
        (v === '*' || next.type === Tokens.IDENT) && stream.LT(2).value === '|'
          ? stream.get().value + stream.get().value
          : null;
    }
    _attrib(start) {
      const stream = this._tokenStream;
      let value = start.value;
      value += this._ws();
      value += this._namespacePrefix() || '';
      value += stream.mustMatch(Tokens.IDENT, false).value;
      value += this._ws();
      if (stream.match(TT.attrMatch)) {
        value += stream._token.value;
        value += this._ws();
        value += stream.mustMatch(TT.identString).value;
        value += this._ws();
        if (stream.match(Tokens.IDENT, ['i', 's'])) {
          value += stream._token.value;
          value += this._ws();
        }
      }
      value += stream.mustMatch(Tokens.RBRACKET).value;
      return new SelectorSubPart(value, 'attribute', start);
    }

    _pseudo() {
      const stream = this._tokenStream;
      const colons = stream.match(Tokens.COLON) ? '::' : ':';
      const tok = stream.mustMatch(TT.pseudo);
      tok.col -= colons.length;
      tok.offset -= colons.length;
      return tok.name
        ? new SelectorPseudoFunc(tok, colons, this._expr(':', Tokens.RPAREN))
        : new SelectorSubPart(colons + tok.value, 'pseudo', tok);
    }

    /** :not(), :is(), :where(), :any() */
    _pseudoFuncSel(tok) {
      this._ws();
      tok = new SelectorPseudoFunc(tok, ':', this._selectorsGroup(tok.name === 'has'));
      this._tokenStream.mustMatch(Tokens.RPAREN);
      return tok;
    }

    _expression() {
      const parts = [];
      const stream = this._tokenStream;
      for (let tok; (tok = stream.get(true));) {
        if (tok.name) {
          parts.push(this._function(tok));
        } else if (tok.value === ')') {
          stream.unget();
          break;
        } else if (tok.type !== Tokens.COMMENT) {
          parts.push(tok);
          this._ws();
        }
      }
      return parts[0] ? parts : null;
    }

    _declaration(consumeSemicolon, Props) {
      const {_tokenStream: stream, options: opts} = this;
      let prop, value, hack, start, invalid;
      let tok = stream.get(true);
      if (tok.type === Tokens.STAR && opts.starHack) {
        hack = '*';
        start = tok;
        tok = stream.get(true);
      }
      if (tok.type === Tokens.IDENT) {
        value = tok.value;
        if (value[0] === '_' && opts.underscoreHack) {
          value = value.slice(1);
          hack = '_';
        }
        prop = new PropName(value, start || tok, hack);
      } else {
        stream.unget();
        return;
      }
      stream.mustMatch(Tokens.COLON);
      value = tok.isCust
        ? this._customProperty() // whitespace is a part of custom property value
        : (this._ws(), this._expr());
      // if there's no parts for the value, it's an error
      if (!value) stream.throwUnexpected(stream.LT(1));
      if (!opts.skipValidation && !tok.isCust) {
        try {
          validateProperty(prop.text, value, stream, Props);
        } catch (ex) {
          if (!(ex instanceof ValidationError)) {
            ex.message = ex.stack;
          }
          invalid = ex;
        }
      }
      this.fire({
        type: 'property',
        property: prop,
        important: Boolean(stream.match(Tokens.IMPORTANT)),
        message: invalid && invalid.message,
        invalid,
        value,
      }, prop);
      if (consumeSemicolon) while (stream.match(TT.semiS)) {/*NOP*/}
      this._ws();
      return true;
    }

    _expr(inFunction, endToken) {
      const ie = this.options.ieFilters;
      const stream = this._tokenStream;
      const values = [];
      let tok, tt, v;
      while (
        (tt = (tok = stream.get(true)).type, v = tok.value) &&
        (endToken ? tt !== endToken : v !== ';' && v !== '}' && v !== ')' && tt !== Tokens.IMPORTANT)
      ) {
        if (v === '(' || v === '[' || inFunction && v === '{') {
          tok = this._expr(inFunction, TokenTypeByText[Tokens[tt].end]);
        } else if (tt === Tokens.PSEUDO_FUNC_SEL) {
          tok = this._pseudoFuncSel(tok);
        } else if (tt === Tokens.FUNCTION) {
          tok = this._function(tok);
        } else if (ie && v === '=') {
          tok = values.pop();
          if (tok) tok.text += v + this._functionIeFilter();
        } else if (ie && tt === Tokens.IE_FUNCTION) {
          tok.expr = this._expr(true, Tokens.RPAREN);
        } else if (tt === Tokens.HASH) {
          tok = this._hexcolor(tok);
        } else if (tt === Tokens.S) {
          continue;
        } else if (tt === Tokens.COMMENT) {
          tok = 0;
        }
        if (tok) values.push(tok instanceof SyntaxUnit ? tok : PropValueUnit(tok));
        this._ws();
      }
      if (!endToken) stream.unget();
      return inFunction === ':' ? values
        : values[0] && new PropValue(values);
    }

    _customProperty() {
      const stream = this._tokenStream;
      const value = stream.readDeclValue();
      if (value) {
        const token = stream._token;
        token.value = value;
        token.type = Tokens.UNKNOWN;
        return new PropValue([PropValueUnit(token)], token);
      }
    }

    _function(tok) {
      const stream = this._tokenStream;
      if (tok || (tok = stream.match(Tokens.FUNCTION))) {
        tok.expr = this._expr(true, Tokens.RPAREN);
        this._ws();
        return new PropValueFunc(tok);
      }
    }

    _functionIeFilter() {
      const stream = this._tokenStream;
      let res = '';
      let tok, tt, v;
      do {
        this._ws();
        if (res) {
          res += stream.match(Tokens.IDENT).value || '';
          res += stream.match(Tokens.EQUALS).value || '';
        }
        tok = stream.get(true);
        if ((tt = tok.type) !== Tokens.S && (v = tok.value) !== ',') {
          if (tok.number != null || tt === Tokens.STRING) res += v;
          else if (v === ')') return (stream.unget(), res);
          else if (!v.startsWith('/*')) stream.throwUnexpected(tok, [Tokens.RPAREN]);
        }
      } while (true);
    }

    _hexcolor(token = this._tokenStream.match(Tokens.HASH)) {
      if (!token) return;
      const color = token.value;
      const len = color.length;
      if (len !== 4 && len !== 5 && len !== 7 && len !== 9 ||
          !/^#([a-f\d]{3}(?:[a-f\d](?:[a-f\d]{2}){0,2})?)$/i.test(color)) {
        throw new SyntaxError(`Expected a hex color but found '${color}'.`, token);
      }
      this._ws();
      return token;
    }

    _keyframes(start) {
      const stream = this._tokenStream;
      const prefix = start.value.match(rxVendorPrefix)[1] || '';
      const name = PropValueUnit(stream.mustMatch(TT.identString));
      stream.mustMatch(Tokens.LBRACE);
      this.fire({type: 'startkeyframes', name, prefix}, start);
      // check for key
      while (true) {
        this._ws();
        const keys = [this._key(true)];
        if (!keys[0]) break;
        while (stream.match(Tokens.COMMA)) {
          this._ws();
          keys.push(this._key());
        }
        this.fire({type: 'startkeyframerule', keys}, keys[0]);
        this._readDeclarations();
        this.fire({type: 'endkeyframerule', keys});
      }
      stream.mustMatch(Tokens.RBRACE);
      this.fire({type: 'endkeyframes', name, prefix});
      this._ws();
    }

    _key(optional) {
      const stream = this._tokenStream;
      const token = stream.match(Tokens.PERCENTAGE) || stream.match(Tokens.IDENT, ['from', 'to']);
      if (token) {
        this._ws();
        return PropValueUnit(token);
      } else if (!optional) {
        stream.throwUnexpected(stream.LT(1), ['%', "'from'", "'to'"]);
      }
    }

    _skipCruft() {
      while (this._tokenStream.match(TT.cruft)) { /*NOP*/ }
    }

    /**
     * @param {{}} [_]
     * @param {Boolean} [_.checkStart] - check for the left brace at the beginning.
     * @param {Boolean} [_.readMargins] - check for margin patterns.
     * @param {Boolean} [_.stopAfterBrace] - stop after the final } without consuming whitespace
     * @param {string} [_.Props] - definitions of valid properties
     */
    _readDeclarations({
      checkStart = true,
      readMargins = false,
      stopAfterBrace = false,
      Props,
    } = {}) {
      const stream = this._tokenStream;
      if (checkStart) stream.mustMatch(Tokens.LBRACE);
      let next, tt;
      while ((next = stream.get(true)).value !== '}' && (tt = next.type)) {
        try {
          if (tt === Tokens.SEMICOLON ||
              this._ws(next, true) ||
              readMargins && this._margin() ||
              (stream.unget(), this._declaration(true, Props))) {
            continue;
          }
          break;
        } catch (ex) {
          this._readDeclarationsRecovery(ex, arguments[0]);
        }
      }
      if (next.value !== '}') stream.mustMatch(Tokens.RBRACE);
      if (!stopAfterBrace) this._ws();
    }

    _readDeclarationsRecovery(ex) {
      if (ex) {
        if (this.options.strict || !(ex instanceof SyntaxError)) {
          throw ex; // if not a syntax error, rethrow it
        }
        this.fire(Object.assign({}, ex, {
          type: ex.type || 'error',
          recoverable: true,
          error: ex,
        }));
      }
      switch (this._tokenStream.advance([Tokens.SEMICOLON, Tokens.RBRACE])) {
        case Tokens.SEMICOLON:
          return true; // continue to the next declaration
        case Tokens.RBRACE:
          this._tokenStream.unget();
          return;
        default:
          throw ex;
      }
    }

    _ws(start, skipUsoVar) {
      const tt = start && start.type;
      if (tt && !(
        tt === Tokens.S ||
        tt === Tokens.COMMENT ||
        tt === Tokens.USO_VAR && skipUsoVar
      )) {
        return '';
      }
      const stream = this._tokenStream;
      const tokens = skipUsoVar ? TT.usoS : Tokens.S;
      let ws = start ? start.value : '';
      for (let tok; (tok = stream.LT(1, true)) && tok.type === Tokens.S;) {
        ws += stream.get(true).value;
      }
      if (stream._ltIndex === stream._ltAhead) {
        ws += stream._reader.readMatch(/\s+/y) || '';
        if (!stream._reader.peekTest(/\/\*/y)) {
          return ws;
        }
      }
      while (stream.match(tokens)) {
        ws += stream._token.value;
      }
      return ws;
    }

    _unknownSym(start) {
      if (this.options.strict) {
        throw new SyntaxError('Unknown @ rule.', start);
      }
      const {prelude, block} = this._tokenStream.readUnknownSym();
      this.fire({type: 'unknown-at-rule', name: start.value, prelude, block}, start);
      this._ws();
    }

    parse(input, {reuseCache} = {}) {
      this._tokenStream = new TokenStream(input);
      parserCache.start(reuseCache && this);
      this._stylesheet();
    }
  }

  ParserRoute[Tokens.CONTAINER_SYM] = // we don't allow @document inside @container
  ParserRoute[Tokens.DOCUMENT_SYM] =
  ParserRoute[Tokens.LAYER_SYM] =
  ParserRoute[Tokens.MEDIA_SYM] =
  ParserRoute[Tokens.SUPPORTS_SYM] = {
    [Tokens.DOCUMENT_SYM]: Parser.prototype._documentMisplaced,
    [Tokens.CONTAINER_SYM]: Parser.prototype._container,
    [Tokens.FONT_FACE_SYM]: Parser.prototype._fontFace,
    [Tokens.FONT_PALETTE_VALUES_SYM]: Parser.prototype._fontPaletteValues,
    [Tokens.KEYFRAMES_SYM]: Parser.prototype._keyframes,
    [Tokens.LAYER_SYM]: Parser.prototype._layer,
    [Tokens.MEDIA_SYM]: Parser.prototype._media,
    [Tokens.PAGE_SYM]: Parser.prototype._page,
    [Tokens.SUPPORTS_SYM]: Parser.prototype._supports,
    [Tokens.UNKNOWN_SYM]: Parser.prototype._unknownSym,
    [Tokens.VIEWPORT_SYM]: Parser.prototype._viewport,
  };
  ParserRoute.stylesheet = Object.assign({}, ParserRoute[Tokens.DOCUMENT_SYM], {
    [Tokens.DOCUMENT_SYM]: Parser.prototype._document,
    [Tokens.S]: Parser.prototype._ws,
  });
  ParserRoute.topDoc = {
    [Tokens.DOCUMENT_SYM]: Parser.prototype._document,
    [Tokens.UNKNOWN_SYM]: Parser.prototype._unknownSym,
    [Tokens.S]: Parser.prototype._ws,
  };
  ParserRoute.simpleSelectorSequence = {
    [Tokens.HASH]: Parser.prototype._hash,
    [Tokens.DOT]: Parser.prototype._class,
    [Tokens.LBRACKET]: Parser.prototype._attrib,
    [Tokens.COLON]: Parser.prototype._pseudo,
    [Tokens.PSEUDO_FUNC_SEL]: Parser.prototype._pseudoFuncSel,
  };

  //#endregion
  //#region Helper functions

  function define(obj, name, val) {
    Object.defineProperty(obj, name, {[val.call ? 'get' : 'value']: val, configurable: true});
    return val;
  }
  function customIdentChecker(ex, re, alt) {
    re = RegExp(`^(?!(default|${ex}${ex ? '|' : ''}${GlobalKeywords.join('|')})$)${re || ''}`, 'i');
    return p => p.tokenType === Tokens.IDENT && re.test(p.text) || alt && alt(p);
  }
  /**
   * vars can span any number of grammar parts so not gonna try to guess. KISS.
   * @param {PropValue} value
   */
  function hasVarParts(value) {
    return value.parts.some(p => p.isVar);
  }
  function isIdentStart(c) {
    return c >= 'a' && c <= 'z' || c === '-' || c === '\\' || c === '_' ||
      c >= 'A' && c <= 'Z' || c >= '\u00A0' && c <= '\uFFFF';
  }
  /** @param {string} str - must be lowercase */
  function isUriIdent(str) {
    return str === 'url' || str === 'url-prefix' || str === 'domain';
  }
  function lowerCmp(a, b) {
    return a.length === b.length && (a === b || a.toLowerCase() === b.toLowerCase());
  }
  /** @this {String} */
  function lowerCmpThis(a) {
    return a.length === this.length && (a === this || a.toLowerCase() === this.toLowerCase());
  }
  function parseString(str) {
    return str.slice(1, -1) // strip surrounding quotes
      .replace(/\\(\r\n|[^\r0-9a-f]|[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)/ig, unescapeChar);
  }
  function failValidation(unit, what) {
    if (!what || what === true ? (what = 'end of value') : !unit.isVar) {
      throw new ValidationError(`Expected ${what} but found '${unit.text}'.`, unit);
    }
  }
  function unescapeChar(m, c) {
    if (c === '\n' || c === '\r\n' || c === '\r' || c === '\f') {
      return '';
    }
    m = /^[0-9a-f]{1,6}/i.exec(c);
    return m ? String.fromCodePoint(parseInt(m[0], 16)) : c;
  }

  //#endregion
  //#region PUBLIC API

  /** @namespace parserlib */
  return {
    css: {
      GlobalKeywords,
      Parser,
      Properties,
      TokenStream,
    },
    util: {
      EventTarget,
      rxNamedColor,
      rxVendorPrefix,
      describeProp: vtExplode,
    },
    cache: parserCache,
  };

  //#endregion
})();
