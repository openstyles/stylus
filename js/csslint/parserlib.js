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

  const Properties = {
    'align-items': 'normal | stretch | <baseline-position> | [ <overflow-position>? <self-position> ]',
    'align-content': '<align-content>',
    'align-self': '<align-self>',
    'all': 'initial | inherit | revert | unset',
    'alignment-adjust': 'auto | baseline | before-edge | text-before-edge | middle | central | ' +
      'after-edge | text-after-edge | ideographic | alphabetic | hanging | ' +
      'mathematical | <length-pct>',
    'alignment-baseline': 'auto | baseline | use-script | before-edge | text-before-edge | ' +
      'after-edge | text-after-edge | central | middle | ideographic | alphabetic | ' +
      'hanging | mathematical',
    'animation': '[ <time> || <single-timing-function> || <time> || [ infinite | <number> ] || ' +
      '<single-animation-direction> || <single-animation-fill-mode> || ' +
      '[ running | paused ] || [ none | <ident> | <string> ] ]#',
    'animation-delay': '<time>#',
    'animation-direction': '<single-animation-direction>#',
    'animation-duration': '<time>#',
    'animation-fill-mode': '<single-animation-fill-mode>#',
    'animation-iteration-count': '[ <number> | infinite ]#',
    'animation-name': '[ none | <single-animation-name> ]#',
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
    'aspect-ratio': 'auto || [ <nonnegative-num> / <nonnegative-num> ]',
    'azimuth': '<azimuth>',

    'backdrop-filter': '<filter-function-list> | none',
    'backface-visibility': 'visible | hidden',
    'background': '[ <bg-layer> , ]* <final-bg-layer>',
    'background-attachment': '<attachment>#',
    'background-blend-mode': '<blend-mode>',
    'background-clip': '[ <box> | text ]#',
    'background-color': '<color>',
    'background-image': '<bg-image>#',
    'background-origin': '<box>#',
    'background-position': '<bg-position>#',
    'background-position-x': '[ center | [ left | right ]? <length-pct>? ]#',
    'background-position-y': '[ center | [ top | bottom ]? <length-pct>? ]#',
    'background-repeat': '<repeat-style>#',
    'background-size': '<bg-size>#',
    'baseline-shift': 'baseline | sub | super | <length-pct>',
    'behavior': 1,
    'binding': 1,
    'bleed': '<length>',
    'block-size': '<width>',
    'bookmark-label': '<content-list>',
    'bookmark-level': 'none | <integer>',
    'bookmark-state': 'open | closed',
    'bookmark-target': 'none | <uri>',
    'border-boundary': 'none | parent | display',
    'border-collapse': 'collapse | separate',
    'border-image': '[ none | <image> ] || <border-image-slice> ' +
      '[ / <border-image-width> | / <border-image-width>? / <border-image-outset> ]? || ' +
      '<border-image-repeat>',
    'border-image-outset': '<border-image-outset>',
    'border-image-repeat': '<border-image-repeat>',
    'border-image-slice': '<border-image-slice>',
    'border-image-source': '<image> | none',
    'border-image-width': '<border-image-width>',
    'border-spacing': '<length>{1,2}',

    'border-bottom-left-radius': '<length-pct>{1,2}',
    'border-bottom-right-radius': '<length-pct>{1,2}',
    'border-end-end-radius': '<length-pct>{1,2}',
    'border-end-start-radius': '<length-pct>{1,2}',
    'border-radius': '<border-radius>',
    'border-start-end-radius': '<length-pct>{1,2}',
    'border-start-start-radius': '<length-pct>{1,2}',
    'border-top-left-radius': '<length-pct>{1,2}',
    'border-top-right-radius': '<length-pct>{1,2}',

    'bottom': '<width>',
    'box-decoration-break': 'slice | clone',
    'box-shadow': '<box-shadow>',
    'box-sizing': 'content-box | border-box',
    'break-after': 'auto | always | avoid | left | right | page | column | avoid-page | avoid-column',
    'break-before': 'auto | always | avoid | left | right | page | column | avoid-page | avoid-column',
    'break-inside': 'auto | avoid | avoid-page | avoid-column',
    '-moz-box-align': 1,
    '-moz-box-decoration-break': 1,
    '-moz-box-direction': 1,
    '-moz-box-flex': 1,
    '-moz-box-flex-group': 1,
    '-moz-box-lines': 1,
    '-moz-box-ordinal-group': 1,
    '-moz-box-orient': 1,
    '-moz-box-pack': 1,
    '-o-box-decoration-break': 1,
    '-webkit-box-align': 1,
    '-webkit-box-decoration-break': 1,
    '-webkit-box-direction': 1,
    '-webkit-box-flex': 1,
    '-webkit-box-flex-group': 1,
    '-webkit-box-lines': 1,
    '-webkit-box-ordinal-group': 1,
    '-webkit-box-orient': 1,
    '-webkit-box-pack': 1,

    'caret-color': 'auto | <color>',
    'caption-side': 'top | bottom | inline-start | inline-end',
    'clear': 'none | right | left | both | inline-start | inline-end',
    'clip': 'rect( [ <length> | auto ]#{4} ) | auto',
    'clip-path': '<clip-source> | <clip-path> | none',
    'clip-rule': 'nonzero | evenodd',
    'color': '<color>',
    'color-adjust': 'economy | exact',
    'color-interpolation': 'auto | sRGB | linearRGB',
    'color-interpolation-filters': 'auto | sRGB | linearRGB',
    'color-profile': 1,
    'color-rendering': 'auto | optimizeSpeed | optimizeQuality',
    'color-scheme': 'normal | [ light | dark ]+',
    'column-count': '<integer> | auto',
    'column-fill': 'auto | balance',
    'column-gap': '<column-gap>',
    'column-rule': '<border-shorthand>',
    'column-rule-color': '<color>',
    'column-rule-style': '<border-style>',
    'column-rule-width': '<border-width>',
    'column-span': 'none | all',
    'column-width': '<length> | auto',
    'columns': 1,
    'contain': 'none | strict | content | [ size || layout || style || paint ]',
    'contain-intrinsic-size': 'none | <length>{1,2}',
    'content': 'normal | none | <content-list> [ / <string> ]?',
    'content-visibility': 'visible | auto | hidden',
    'counter-increment': '<counter>',
    'counter-reset': '<counter>',
    'counter-set': '<counter>',
    'cue': 'cue-after | cue-before',
    'cue-after': 1,
    'cue-before': 1,
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
    'drop-initial-after-adjust': 'central | middle | after-edge | text-after-edge | ideographic | ' +
      'alphabetic | mathematical | <length-pct>',
    'drop-initial-after-align': 'baseline | use-script | before-edge | text-before-edge | ' +
      'after-edge | text-after-edge | central | middle | ideographic | alphabetic | hanging | ' +
      'mathematical',
    'drop-initial-before-adjust': 'before-edge | text-before-edge | central | middle | ' +
      'hanging | mathematical | <length-pct>',
    'drop-initial-before-align': 'caps-height | baseline | use-script | before-edge | ' +
      'text-before-edge | after-edge | text-after-edge | central | middle | ideographic | ' +
      'alphabetic | hanging | mathematical',
    'drop-initial-size': 'auto | line | <length-pct>',
    'drop-initial-value': '<integer>',

    'elevation': '<angle> | below | level | above | higher | lower',
    'empty-cells': 'show | hide',
    'enable-background': 1,

    'fill': '<paint>',
    'fill-opacity': '<opacity-value>',
    'fill-rule': 'nonzero | evenodd',
    'filter': '<filter-function-list> | none',
    'fit': 'fill | hidden | meet | slice',
    'fit-position': 1,
    'flex': '<flex-shorthand>',
    'flex-basis': '<width>',
    'flex-direction': 'row | row-reverse | column | column-reverse',
    'flex-flow': '<flex-direction> || <flex-wrap>',
    'flex-grow': '<number>',
    'flex-shrink': '<number>',
    'flex-wrap': 'nowrap | wrap | wrap-reverse',
    'float': 'left | right | none | inline-start | inline-end',
    'float-offset': 1,
    'flood-color': 1,
    'flood-opacity': '<opacity-value>',
    // matching no-pct first because Matcher doesn't retry for a longer match in nested definitions
    'font': '<font-short-tweak-no-pct>? <font-short-core> | ' +
      '[ <font-short-tweak-no-pct> || <percentage> ]? <font-short-core> | ' +
      'caption | icon | menu | message-box | small-caption | status-bar',
    'font-family': '<font-family>',
    'font-feature-settings': '<feature-tag-value># | normal',
    'font-kerning': 'auto | normal | none',
    'font-language-override': 'normal | <string>',
    'font-optical-sizing': 'auto | none',
    'font-palette': 'none | normal | light | dark | <ident>',
    'font-size': '<font-size>',
    'font-size-adjust': '<number> | none',
    'font-stretch': '<font-stretch>',
    'font-style': '<font-style>',
    'font-synthesis': 'none | [ weight || style ]',
    'font-synthesis-style': 'auto | none',
    'font-synthesis-weight': 'auto | none',
    'font-synthesis-small-caps': 'auto | none',
    'font-variant': '<font-variant> | normal | none',
    'font-variant-alternates': '<font-variant-alternates> | normal',
    'font-variant-caps': '<font-variant-caps> | normal',
    'font-variant-east-asian': '<font-variant-east-asian> | normal',
    'font-variant-emoji': 'auto | text | emoji | unicode',
    'font-variant-ligatures': '<font-variant-ligatures> | normal | none',
    'font-variant-numeric': '<font-variant-numeric> | normal',
    'font-variant-position': 'normal | sub | super',
    'font-variation-settings': 'normal | [ <string> <number> ]#',
    'font-weight': '<font-weight>',
    'forced-color-adjust': 'auto | none',
    '-ms-flex-align': 1,
    '-ms-flex-order': 1,
    '-ms-flex-pack': 1,

    'gap': '<row-gap> <column-gap>?',
    'glyph-orientation-horizontal': '<glyph-angle>',
    'glyph-orientation-vertical': 'auto | <glyph-angle>',

    'grid': '<grid-template> | <grid-template-rows> / [ auto-flow && dense? ] <grid-auto-columns>? | ' +
      '[ auto-flow && dense? ] <grid-auto-rows>? / <grid-template-columns>',
    'grid-area': '<grid-line> [ / <grid-line> ]{0,3}',
    'grid-auto-columns': '<grid-auto-columns>',
    'grid-auto-flow': '[ row | column ] || dense',
    'grid-auto-rows': '<grid-auto-rows>',
    'grid-column': '<grid-line> [ / <grid-line> ]?',
    'grid-column-start': '<grid-line>',
    'grid-column-end': '<grid-line>',
    'grid-row': '<grid-line> [ / <grid-line> ]?',
    'grid-row-start': '<grid-line>',
    'grid-row-end': '<grid-line>',
    'grid-template': 'none | [ <grid-template-rows> / <grid-template-columns> ] | ' +
      '[ <line-names>? <string> <track-size>? <line-names>? ]+ [ / <explicit-track-list> ]?',
    'grid-template-areas': 'none | <string>+',
    'grid-template-columns': '<grid-template-columns>',
    'grid-template-rows': '<grid-template-rows>',
    'grid-row-gap': '<row-gap>',
    'grid-column-gap': '<column-gap>',
    'grid-gap': '<row-gap> <column-gap>?',

    'hanging-punctuation': 'none | [ first || [ force-end | allow-end ] || last ]',
    'height': 'auto | <width-height>',
    'hyphenate-after': '<integer> | auto',
    'hyphenate-before': '<integer> | auto',
    'hyphenate-character': '<string> | auto',
    'hyphenate-lines': 'no-limit | <integer>',
    'hyphenate-resource': 1,
    'hyphens': 'none | manual | auto',

    'icon': 1,
    'image-orientation': 'from-image | none | [ <angle> || flip ]',
    'image-rendering': 'auto | smooth | high-quality | crisp-edges | pixelated | ' +
      'optimizeSpeed | optimizeQuality',
    'image-resolution': 1,
    'ime-mode': 'auto | normal | active | inactive | disabled',
    'inline-box-align': 'last | <integer>',
    'inline-size': '<width>',
    'inset': '<width>{1,4}',
    'inset-block': '<width>{1,2}',
    'inset-block-end': '<width>',
    'inset-block-start': '<width>',
    'inset-inline': '<width>{1,2}',
    'inset-inline-end': '<width>',
    'inset-inline-start': '<width>',
    'isolation': 'auto | isolate',

    'justify-content': '<justify-content>',
    'justify-items': 'normal | stretch | <baseline-position> | ' +
      '[ <overflow-position>? <self-position> ] | ' +
      '[ legacy || [ left | right | center ] ]',
    'justify-self': '<justify-self>',

    'kerning': 'auto | <length>',

    'left': '<width>',
    'letter-spacing': '<length> | normal',
    'line-height': '<line-height>',
    'line-break': 'auto | loose | normal | strict | anywhere',
    'line-stacking': 1,
    'line-stacking-ruby': 'exclude-ruby | include-ruby',
    'line-stacking-shift': 'consider-shifts | disregard-shifts',
    'line-stacking-strategy': 'inline-line-height | block-line-height | max-height | grid-height',
    'list-style': 1,
    'list-style-image': '<uri> | none',
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
    'mark': 1,
    'mark-after': 1,
    'mark-before': 1,
    'marker': 1,
    'marker-end': 1,
    'marker-mid': 1,
    'marker-start': 1,
    'marks': 1,
    'marquee-direction': 1,
    'marquee-play-count': 1,
    'marquee-speed': 1,
    'marquee-style': 1,
    'mask': 1,
    'mask-image': '[ none | <image> | <uri> ]#',
    'max-height': 'none | <width-height>',
    'max-width': 'none | <width-height>',
    'min-height': 'auto | <width-height>',
    'min-width': 'auto | <width-height>',
    'max-block-size': '<length-pct> | none',
    'max-inline-size': '<length-pct> | none',
    'min-block-size': '<length-pct>',
    'min-inline-size': '<length-pct>',
    'mix-blend-mode': '<blend-mode>',
    'move-to': 1,

    'nav-down': 1,
    'nav-index': 1,
    'nav-left': 1,
    'nav-right': 1,
    'nav-up': 1,

    'object-fit': 'fill | contain | cover | none | scale-down',
    'object-position': '<position>',
    'opacity': '<opacity-value> | <percentage>',
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
    'overflow-clip-margin': '<nonnegative-len>',
    'overflow-inline': '<overflow>',
    'overflow-style': 1,
    'overflow-wrap': 'normal | break-word | anywhere',
    'overflow-x': '<overflow>',
    'overflow-y': '<overflow>',
    'overscroll-behavior': '<overscroll>{1,2}',
    'overscroll-behavior-block': '<overscroll>',
    'overscroll-behavior-inline': '<overscroll>',
    'overscroll-behavior-x': '<overscroll>',
    'overscroll-behavior-y': '<overscroll>',

    'padding': '<nonnegative-len-pct>{1,4}',
    'padding-block': '<nonnegative-len-pct>{1,2}',
    'padding-block-end': '<nonnegative-len-pct>',
    'padding-block-start': '<nonnegative-len-pct>',
    'padding-bottom': '<nonnegative-len-pct>',
    'padding-inline': '<nonnegative-len-pct>{1,2}',
    'padding-inline-end': '<nonnegative-len-pct>',
    'padding-inline-start': '<nonnegative-len-pct>',
    'padding-left': '<nonnegative-len-pct>',
    'padding-right': '<nonnegative-len-pct>',
    'padding-top': '<nonnegative-len-pct>',
    'page': 1,
    'page-break-after': 'auto | always | avoid | left | right | recto | verso',
    'page-break-before': 'auto | always | avoid | left | right | recto | verso',
    'page-break-inside': 'auto | avoid',
    'page-policy': 1,
    'pause': 1,
    'pause-after': 1,
    'pause-before': 1,
    'perspective': 'none | <length>',
    'perspective-origin': '<position>',
    'phonemes': 1,
    'pitch': 1,
    'pitch-range': 1,
    'place-content': '<align-content> <justify-content>?',
    'place-items': '[ normal | stretch | <baseline-position> | <self-position> ] ' +
      '[ normal | stretch | <baseline-position> | <self-position> ]?',
    'place-self': '<align-self> <justify-self>?',
    'play-during': 1,
    'pointer-events': 'auto | none | visiblePainted | visibleFill | visibleStroke | visible | ' +
      'painted | fill | stroke | all',
    'position': 'static | relative | absolute | fixed | sticky | -webkit-sticky',
    'presentation-level': 1,
    'punctuation-trim': 1,

    'quotes': 1,

    'rendering-intent': 1,
    'resize': 'none | both | horizontal | vertical | block | inline',
    'rest': 1,
    'rest-after': 1,
    'rest-before': 1,
    'richness': 1,
    'right': '<width>',
    'rotate': 'none | [ x | y | z | <number>{3} ]? && <angle>',
    'rotation': 1,
    'rotation-point': 1,
    'row-gap': '<row-gap>',
    'ruby-align': 1,
    'ruby-overhang': 1,
    'ruby-position': 1,
    'ruby-span': 1,

    'scale': 'none | <number>{1,3}',

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
    'scrollbar-width': 'auto | thin | none',
    'shape-inside': 'auto | outside-shape | [ <basic-shape> || shape-box ] | <image> | display',
    'shape-rendering': 'auto | optimizeSpeed | crispEdges | geometricPrecision',
    'size': 1,
    'speak': 'normal | none | spell-out',
    'speak-header': 'once | always',
    'speak-numeral': 'digits | continuous',
    'speak-punctuation': 'code | none',
    'speech-rate': 1,
    'src': 1,
    'stop-color': 1,
    'stop-opacity': '<opacity-value>',
    'stress': 1,
    'string-set': 1,
    'stroke': '<paint>',
    'stroke-dasharray': 'none | <dasharray>',
    'stroke-dashoffset': '<length-pct> | <number>',
    'stroke-linecap': 'butt | round | square',
    'stroke-linejoin': 'miter | miter-clip | round | bevel | arcs',
    'stroke-miterlimit': '<nonnegative-num>',
    'stroke-opacity': '<opacity-value>',
    'stroke-width': '<length-pct> | <number>',

    'table-layout': 'auto | fixed',
    'tab-size': '<number> | <length>',
    'target': 1,
    'target-name': 1,
    'target-new': 1,
    'target-position': 1,
    'text-align': '<text-align> | justify-all',
    'text-align-all': '<text-align>',
    'text-align-last': '<text-align> | auto',
    'text-anchor': 'start | middle | end',
    'text-decoration': '<text-decoration-line> || <text-decoration-style> || <color>',
    'text-decoration-color': '<color>',
    'text-decoration-line': '<text-decoration-line>',
    'text-decoration-skip': 'none | ' +
      '[ objects || [ spaces | [ leading-spaces || trailing-spaces ] ] || edges || box-decoration ]',
    'text-decoration-style': '<text-decoration-style>',
    'text-emphasis': '<text-emphasis-style> || <color>',
    'text-emphasis-style': '<text-emphasis-style>',
    'text-emphasis-position': '[ over | under ] && [ right | left ]?',
    'text-height': 1,
    'text-indent': '<length-pct> && hanging? && each-line?',
    'text-justify': 'auto | none | inter-word | inter-character',
    'text-outline': 1,
    'text-overflow': 'clip | ellipsis',
    'text-rendering': 'auto | optimizeSpeed | optimizeLegibility | geometricPrecision',
    'text-shadow': 'none | [ <color>? && <length>{2,3} ]#',
    'text-transform': 'none | [ capitalize | uppercase | lowercase ] || full-width || full-size-kana',
    'text-underline-position': 'auto | [ under || [ left | right ] ]',
    'text-wrap': 'normal | none | avoid',
    'top': '<width>',
    'touch-action': 'auto | none | ' +
      'pan-x | pan-y | pan-left | pan-right | pan-up | pan-down | manipulation',
    'transform': 'none | <transform-function>+',
    'transform-box': 'border-box | fill-box | view-box',
    'transform-origin': '<transform-origin>',
    'transform-style': 'auto | flat | preserve-3d',
    'transition': '<transition>#',
    'transition-delay': '<time>#',
    'transition-duration': '<time>#',
    'transition-property': 'none | [ all | <ident> ]#',
    'transition-timing-function': '<single-timing-function>#',
    'translate': 'none | <length-pct> [ <length-pct> <length>? ]?',

    'unicode-range': '<unicode-range>#',
    'unicode-bidi': 'normal | embed | isolate | bidi-override | isolate-override | plaintext',
    'user-modify': 'read-only | read-write | write-only',
    'user-select': 'auto | text | none | contain | all',

    'vertical-align': 'auto | use-script | baseline | sub | super | top | text-top | ' +
      'central | middle | bottom | text-bottom | <length-pct>',
    'visibility': 'visible | hidden | collapse',
    'voice-balance': 1,
    'voice-duration': 1,
    'voice-family': 1,
    'voice-pitch': 1,
    'voice-pitch-range': 1,
    'voice-rate': 1,
    'voice-stress': 1,
    'voice-volume': 1,
    'volume': 1,

    'white-space': 'normal | pre | nowrap | pre-wrap | break-spaces | pre-line',
    'white-space-collapse': 1,
    'widows': '<integer>',
    'width': 'auto | <width-height>',
    'will-change': '<will-change>',
    'word-break': 'normal | keep-all | break-all | break-word',
    'word-spacing': '<length> | normal',
    'word-wrap': 'normal | break-word | anywhere',
    'writing-mode': 'horizontal-tb | vertical-rl | vertical-lr | ' +
      'lr-tb | rl-tb | tb-rl | bt-rl | tb-lr | bt-lr | lr-bt | rl-bt | lr | rl | tb',

    'z-index': '<integer> | auto',
    'zoom': '<number> | <percentage> | normal',

    // nonstandard https://compat.spec.whatwg.org/
    '-webkit-box-reflect': '[ above | below | right | left ]? <length>? <image>?',
    '-webkit-text-fill-color': '<color>',
    '-webkit-text-stroke': '<border-width> || <color>',
    '-webkit-text-stroke-color': '<color>',
    '-webkit-text-stroke-width': '<border-width>',
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

  //#endregion
  //#region Types

  const TYPES = /** @namespace Parser */ {
    DEFAULT_TYPE: 0,
    COMBINATOR_TYPE: 1,
    MEDIA_FEATURE_TYPE: 2,
    MEDIA_QUERY_TYPE: 3,
    PROPERTY_NAME_TYPE: 4,
    PROPERTY_VALUE_TYPE: 5,
    PROPERTY_VALUE_PART_TYPE: 6,
    SELECTOR_TYPE: 7,
    SELECTOR_PART_TYPE: 8,
    SELECTOR_SUB_PART_TYPE: 9,
  };
  const UNITS = {
    em:   'length',
    rem:  'length',
    ex:   'length',
    px:   'length',
    cm:   'length',
    mm:   'length',
    in:   'length',
    pt:   'length',
    pc:   'length',
    ch:   'length',
    vh:   'length',
    vw:   'length',
    vmax: 'length',
    vmin: 'length',
    fr:   'length',
    q:    'length',
    deg:  'angle',
    rad:  'angle',
    grad: 'angle',
    turn: 'angle',
    ms:   'time',
    s:    'time',
    hz:   'frequency',
    khz:  'frequency',
    dpi:  'resolution',
    dpcm: 'resolution',
    dppx: 'resolution',
    x:    'resolution',
  };
  // Sticky `y` flag must be used in expressions used with peekTest and readMatch
  const rxIdentStart = /[-\\_a-zA-Z\u00A0-\uFFFF]/u;
  const rxNameChar = /[-\\_\da-zA-Z\u00A0-\uFFFF]/u;
  const rxNameCharNoEsc = /[-_\da-zA-Z\u00A0-\uFFFF]+/yu; // must not match \\
  const rxUnquotedUrlCharNoEsc = /[-!#$%&*-[\]-~\u00A0-\uFFFF]+/yu; // must not match \\
  const rxVendorPrefix = /^-(webkit|moz|ms|o)-(.+)/i;
  const rxCalc = /^(?:-(webkit|moz|ms|o)-)?(calc|min|max|clamp)\(/i;
  const lowercaseCache = new Map();

  //#endregion
  //#region ValidationTypes - definitions

  /** Allowed syntax: text, |, <syntax>, func() */
  const VTSimple = {
    '<absolute-size>': 'xx-small | x-small | small | medium | large | x-large | xx-large',
    '<animateable-feature>': 'scroll-position | contents | <animateable-feature-name>',
    '<animateable-feature-name>': p => vtIsIdent(p) &&
      !/^(unset|initial|inherit|will-change|auto|scroll-position|contents)$/i.test(p),
    '<angle>': p => p.type === 'angle' || p.isCalc,
    '<angle-or-0>': p => p.text === '0' || p.type === 'angle' || p.isCalc,
    '<attr>': vtIsAttr,
    '<attachment>': 'scroll | fixed | local',
    '<bg-image>': '<image> | none',
    '<blend-mode>': 'normal | multiply | screen | overlay | darken | lighten | color-dodge | ' +
      'color-burn | hard-light | soft-light | difference | exclusion | hue | ' +
      'saturation | color | luminosity',
    '<border-style>': 'none | ' +
      'hidden | dotted | dashed | solid | double | groove | ridge | inset | outset',
    '<border-width>': '<length> | thin | medium | thick',
    '<box>': 'padding-box | border-box | content-box',
    '<clip-source>': '<uri>',
    '<column-gap>': 'normal | <length-pct>',
    '<content-distribution>': 'space-between | space-around | space-evenly | stretch',
    '<content-position>': 'center | start | end | flex-start | flex-end',
    '<display-box>': 'contents | none',
    '<display-inside>': 'flow | flow-root | table | flex | grid | ruby',
    '<display-internal>': 'table-row-group | table-header-group | table-footer-group | ' +
      'table-row | table-cell | table-column-group | table-column | table-caption | ' +
      'ruby-base | ruby-text | ruby-base-container | ruby-text-container',
    '<display-legacy>': 'inline-block | inline-table | inline-flex | inline-grid',
    '<display-outside>': 'block | inline | run-in',
    '<feature-tag-value>': p => p.type === 'function' && /^[A-Z0-9]{4}$/i.test(p),
    '<flex>': p => p.type === 'grid' && p.value >= 0 || p.isCalc,
    '<flex-basis>': '<width>',
    '<flex-direction>': 'row | row-reverse | column | column-reverse',
    '<flex-grow>': '<number>',
    '<flex-shrink>': '<number>',
    '<flex-wrap>': 'nowrap | wrap | wrap-reverse',
    '<font-size>': '<absolute-size> | <relative-size> | <length-pct>',
    '<font-stretch>': '<font-stretch-named> | <percentage>',
    '<font-stretch-named>': 'normal | ultra-condensed | extra-condensed | condensed | ' +
      'semi-condensed | semi-expanded | expanded | extra-expanded | ultra-expanded',
    '<font-variant-caps>':
      'small-caps | all-small-caps | petite-caps | all-petite-caps | unicase | titling-caps',
    '<font-variant-css21>': 'normal | small-caps',
    '<font-weight>': 'normal | bold | bolder | lighter | <number>',
    '<generic-family>': 'serif | sans-serif | cursive | fantasy | monospace | system-ui | ' +
      'emoji | math | fangsong | ui-serif | ui-sans-serif | ui-monospace | ui-rounded',
    '<geometry-box>': '<shape-box> | fill-box | stroke-box | view-box',
    '<glyph-angle>': p => p.type === 'angle' && p.units === 'deg',
    '<gradient>': 'radial-gradient() | linear-gradient() | conic-gradient() | gradient() | ' +
      'repeating-radial-gradient() | repeating-linear-gradient() | repeating-conic-gradient() | ' +
      'repeating-gradient()',
    '<hex-color>': p => p.tokenType === Tokens.HASH, //eslint-disable-line no-use-before-define
    '<icccolor>': 'cielab() | cielch() | cielchab() | icc-color() | icc-named-color()',
    '<ident>': vtIsIdent,
    '<ident-for-grid>': p => vtIsIdent(p) &&
      !/^(span|auto|initial|inherit|unset|default)$/i.test(p.value),
    '<ident-not-generic-family>': p => vtIsIdent(p) && !VTSimple['<generic-family>'](p),
    '<ident-not-none>': p => vtIsIdent(p) && !lowerCmp(p.value, 'none'),
    '<image>': '<uri> | <gradient> | cross-fade()',
    '<inflexible-breadth>': '<length-pct> | min-content | max-content | auto',
    '<integer>': p => p.isInt || p.isCalc,
    '<length>': vtIsLength,
    '<length-pct>': p => vtIsLength(p) || vtIsPct(p),
    '<line>': p => p.isInt,
    '<line-height>': '<number> | <length-pct> | normal',
    '<line-names>': p =>
      p.tokenType === Tokens.LBRACKET && // eslint-disable-line no-use-before-define
      p.text.endsWith(']') && (
        !p.expr ||
        !p.expr.parts.length ||
        p.expr.parts.every(VTSimple['<ident-for-grid>'], VTSimple)
      ),
    '<nonnegative-len>': p =>
      p.value >= 0 && vtIsLength(p) || p.isCalc,
    '<nonnegative-len-pct>': p =>
      p.value >= 0 && (p.type === 'percentage' || vtIsLength(p)) || p.isCalc,
    '<nonnegative-num>': p =>
      p.value >= 0 && p.type === 'number' || p.isCalc,
    '<nonnegative-num-pct>': p =>
      p.value >= 0 && (p.type === 'number' || p.type === 'percentage') || p.isCalc,
    //eslint-disable-next-line no-use-before-define
    '<named-color>': p => p.text in Colors || ColorsLC.has(lower(p.text)),
    '<number>': p => p.type === 'number' || p.isCalc,
    '<number-pct>': p => p.type === 'number' || p.type === 'percentage' || p.isCalc,
    '<opacity-value>': p => p.type === 'number' && p.value >= 0 && p.value <= 1 || p.isCalc,
    '<overflow>': 'visible | hidden | clip | scroll | auto',
    '<overflow-position>': 'unsafe | safe',
    '<percentage>': vtIsPct,
    '<positive-integer>': p => p.isInt && p.value > 0 || p.isCalc,
    '<relative-size>': 'smaller | larger',
    '<row-gap>': '<column-gap>',
    '<self-position>': 'center | start | end | self-start | self-end | flex-start | flex-end',
    '<shape-box>': '<box> | margin-box',
    '<single-animation-direction>': 'normal | reverse | alternate | alternate-reverse',
    '<single-animation-fill-mode>': 'none | forwards | backwards | both',
    '<single-animation-name>': p => vtIsIdent(p) &&
      /^(?!(none|unset|initial|inherit)$)-?[a-z_][-a-z0-9_]+$/i.test(p),
    '<string>': p => p.type === 'string',
    '<text-align>': 'start | end | left | right | center | justify | match-parent',
    '<text-decoration-style>': 'solid | double | dotted | dashed | wavy',
    '<time>': p => p.type === 'time',
    '<track-breadth>': '<length-pct> | <flex> | min-content | max-content | auto',
    '<unicode-range>': p => /^U\+[0-9a-f?]{1,6}(-[0-9a-f?]{1,6})?\s*$/i.test(p),
    '<unit>': p => p.text === '%' || p in UNITS || lower(p) in UNITS,
    '<uri>': p => p.type === 'uri',
    '<width>': p => vtIsLength(p) || vtIsPct(p) || lowerCmp(p.text, 'auto'),
  };

  const VTComplex = {
    '<align-content>': 'normal | <baseline-position> | <content-distribution> | ' +
      '<overflow-position>? <content-position>',
    '<align-self>':
      'auto | normal | stretch | <baseline-position> | <overflow-position>? <self-position>',
    '<auto-repeat>':
      'repeat( [ auto-fill | auto-fit ] , [ <line-names>? <fixed-size> ]+ <line-names>? )',
    '<auto-track-list>':
      '[ <line-names>? [ <fixed-size> | <fixed-repeat> ] ]* <line-names>? <auto-repeat> ' +
      '[ <line-names>? [ <fixed-size> | <fixed-repeat> ] ]* <line-names>?',
    '<azimuth>':
      '<angle> | [ [ left-side | far-left | left | center-left | center | center-right | ' +
      'right | far-right | right-side ] || behind ] | leftwards | rightwards',
    '<baseline-position>': '[ first | last ]? baseline',
    '<basic-shape>':
      'inset( <length-pct>{1,4} [ round <border-radius> ]? ) | ' +
      'circle( [ <length-pct> | closest-side | farthest-side ]? [ at <position> ]? ) | ' +
      'ellipse( [ [ <length-pct> | closest-side | farthest-side ]{2} ]? [ at <position> ]? ) | ' +
      'path( [ [ nonzero | evenodd ] , ]? <string> ) | ' +
      'polygon( [ [ nonzero | evenodd | inherit ] , ]? [ <length-pct> <length-pct> ]# )',
    '<bg-layer>':
      '<bg-image> || <bg-position> [ / <bg-size> ]? || <repeat-style> || <attachment> || <box>{1,2}',
    '<bg-position>':
      '[ center | [ left | right ] <length-pct>? ] && [ center | [ top | bottom ] <length-pct>? ] | ' +
      '[ left | center | right | <length-pct> ] [ top | center | bottom | <length-pct> ] | ' +
      '[ left | center | right | top | bottom | <length-pct> ]',
    '<bg-size>': '[ <length-pct> | auto ]{1,2} | cover | contain',
    '<border-image-outset>': '[ <length> | <number> ]{1,4}',
    '<border-image-repeat>': '[ stretch | repeat | round | space ]{1,2}',
    '<border-image-slice>': Matcher =>
      // [<number> | <percentage>]{1,4} && fill?
      // but 'fill' can appear between any of the numbers
      Matcher.many(
        [true],
        Matcher.parse('<nonnegative-num-pct>'),
        Matcher.parse('<nonnegative-num-pct>'),
        Matcher.parse('<nonnegative-num-pct>'),
        Matcher.parse('<nonnegative-num-pct>'),
        'fill'),
    '<border-image-width>': '[ <length-pct> | <number> | auto ]{1,4}',
    '<border-radius>': '<nonnegative-len-pct>{1,4} [ / <nonnegative-len-pct>{1,4} ]?',
    '<border-shorthand>': '<border-width> || <border-style> || <color>',
    '<box-shadow>': 'none | <shadow>#',
    '<clip-path>': '<basic-shape> || <geometry-box>',
    '<color>': '<hex-color> | <named-color> | rgb( <rgb-color> ) | rgba( <rgb-color> ) | ' +
      'hsl( <hsl-color> ) | hsla( <hsl-color> )',
    '<content-list>':
      '[ <string> | <image> | <attr> | ' +
      'content( text | before | after | first-letter | marker ) | ' +
      'counter() | counters() | leader() | ' +
      '[ open-quote | close-quote | no-open-quote | no-close-quote ] | ' +
      '[ target-counter() | target-counters() | target-text() ] ]+',
    '<counter>': '[ <ident-not-none> <integer>? ]+ | none',
    '<cubic-bezier-timing-function>': 'ease | ease-in | ease-out | ease-in-out | ' +
      'cubic-bezier( <number>#{4} )',
    '<dasharray>': Matcher =>
      Matcher.parse('<nonnegative-len-pct> | <nonnegative-num>')
        .braces(1, Infinity, '#', Matcher.parse(',').braces(0, 1, '?')),
    '<display-listitem>': '<display-outside>? && [ flow | flow-root ]? && list-item',
    '<explicit-track-list>': '[ <line-names>? <track-size> ]+ <line-names>?',
    '<family-name>': '<string> | <ident-not-generic-family> <ident>*',
    // https://drafts.fxtf.org/filter-effects/#supported-filter-functions
    // Value may be omitted in which case the default is used
    '<filter-function>':
      'blur( <length>? ) | ' +
      'brightness( <number-pct>? ) | ' +
      'contrast( <number-pct>? ) | ' +
      'drop-shadow( [ <length>{2,3} && <color>? ]? ) | ' +
      'grayscale( <number-pct>? ) | ' +
      'hue-rotate( <angle-or-0>? ) | ' +
      'invert( <number-pct>? ) | ' +
      'opacity( <number-pct>? ) | ' +
      'saturate( <number-pct>? ) | ' +
      'sepia( <number-pct>? )',
    '<filter-function-list>': '[ <filter-function> | <uri> ]+',
    '<final-bg-layer>': '<color> || <bg-image> || <bg-position> [ / <bg-size> ]? || ' +
      '<repeat-style> || <attachment> || <box>{1,2}',
    '<fixed-repeat>':
      'repeat( [ <positive-integer> ] , [ <line-names>? <fixed-size> ]+ <line-names>? )',
    '<fixed-size>': '<length-pct> | ' +
      'minmax( <length-pct> , <track-breadth> ) | ' +
      'minmax( <inflexible-breadth> , <length-pct> )',
    '<flex-shorthand>': 'none | [ <flex-grow> <flex-shrink>? || <flex-basis> ]',
    '<font-family>': '[ <generic-family> | <family-name> ]#',
    '<font-style>': 'normal | italic | oblique <angle>?',
    '<font-short-core>': '<font-size> [ / <line-height> ]? <font-family>',
    '<font-short-tweak-no-pct>':
      '<font-style> || <font-variant-css21> || <font-weight> || <font-stretch-named>',
    '<font-variant-alternates>': 'stylistic() || historical-forms || styleset() || ' +
      'character-variant() || swash() || ornaments() || annotation()',
    '<font-variant-ligatures>': '[ common-ligatures | no-common-ligatures ] || ' +
      '[ discretionary-ligatures | no-discretionary-ligatures ] || ' +
      '[ historical-ligatures | no-historical-ligatures ] || ' +
      '[ contextual | no-contextual ]',
    '<font-variant-numeric>': '[ lining-nums | oldstyle-nums ] || ' +
      '[ proportional-nums | tabular-nums ] || ' +
      '[ diagonal-fractions | stacked-fractions ] || ' +
      'ordinal || slashed-zero',
    '<font-variant-east-asian>': '[ jis78 | jis83 | jis90 | jis04 | simplified | traditional ] || ' +
      '[ full-width | proportional-width ] || ruby',
    '<font-variant>': '<font-variant-ligatures> || <font-variant-alternates> || <font-variant-caps> || ' +
      '<font-variant-numeric> || <font-variant-east-asian>',
    '<grid-auto-columns>': '<track-size>+',
    '<grid-auto-rows>': '<track-size>+',
    '<grid-line>': 'auto | [ <integer> && <ident-for-grid>? ] | <ident-for-grid> | ' +
      '[ span && [ <integer> || <ident-for-grid> ] ]',
    '<grid-template>': 'none | [ <grid-template-rows> / <grid-template-columns> ] | ' +
      '[ <line-names>? <string> <track-size>? <line-names>? ]+ ' +
      '[ / <explicit-track-list> ]?',
    '<grid-template-columns>': 'none | <track-list> | <auto-track-list>',
    '<grid-template-rows>': '<grid-template-columns>',
    '<hsl-color>': '[ <number> | <angle> ] <percentage>{2} [ / <nonnegative-num-pct> ]? | ' +
      '[ <number> | <angle> ] , <percentage>#{2} [ , <nonnegative-num-pct> ]?',
    '<justify-content>': 'normal | <content-distribution> | ' +
      '<overflow-position>? [ <content-position> | left | right ]',
    '<justify-self>': 'auto | normal | stretch | <baseline-position> | <overflow-position>? ' +
      '[ <self-position> | left | right ]',
    '<overscroll>': 'contain | none | auto',
    '<paint>': 'none | <color> | <uri> [ none | <color> ]? | context-fill | context-stroke',
    // Because our `alt` combinator is ordered, we need to test these
    // in order from longest possible match to shortest.
    '<position>':
      '[ [ left | right ] <length-pct> ] && [ [ top | bottom ] <length-percentagepct ] | ' +
      '[ left | center | right | <length-pct> ] ' +
      '[ top | center | bottom | <length-pct> ]? | ' +
      '[ left | center | right ] || [ top | center | bottom ]',
    '<repeat-style>': 'repeat-x | repeat-y | [ repeat | space | round | no-repeat ]{1,2}',
    '<rgb-color>':
      '[ <number>{3} | <percentage>{3} ] [ / <nonnegative-num-pct> ]? | ' +
      '[ <number>#{3} | <percentage>#{3} ] [ , <nonnegative-num-pct> ]?',
    '<shadow>': 'inset? && [ <length>{2,4} && <color>? ]',
    '<single-timing-function>':
      'linear | <cubic-bezier-timing-function> | <step-timing-function> | frames( <integer> )',
    '<step-timing-function>': 'step-start | step-end | ' +
      'steps( <integer> [ , [ jump-start | jump-end | jump-none | jump-both | start | end ] ]? )',
    '<text-decoration-line>': 'none | [ underline || overline || line-through || blink ]',
    '<text-emphasis-style>': 'none | ' +
      '[ [ filled | open ] || [ dot | circle | double-circle | triangle | sesame ] ] | ' +
      '<string>',
    '<track-list>': '[ <line-names>? [ <track-size> | <track-repeat> ] ]+ <line-names>?',
    '<track-repeat>': 'repeat( [ <positive-integer> ] , [ <line-names>? <track-size> ]+ <line-names>? )',
    '<track-size>': '<track-breadth> | minmax( <inflexible-breadth> , <track-breadth> ) | ' +
      'fit-content( <length-pct> )',
    '<transform-function>':
      'matrix( <number>#{6} ) | ' +
      'matrix3d( <number>#{16} ) | ' +
      'rotate( <angle-or-0> ) | ' +
      'rotate3d( <number>#{3} , <angle-or-0> ) | ' +
      'scale( <number> [ , <number> ]? ) | ' +
      'scale3d( <number>#{3} ) | ' +
      'scaleX( <number> ) | ' +
      'scaleY( <number> ) | ' +
      'scaleZ( <number> ) | ' +
      'skew( <angle-or-0> [ , <angle-or-0> ]? ) | ' +
      'skewX( <angle-or-0> ) | ' +
      'skewY( <angle-or-0> ) | ' +
      'translate( <length-pct> [ , <length-pct> ]? ) | ' +
      'translate3d( <length-pct>#{2} , <length> ) | ' +
      'translateX( <length-pct> ) | ' +
      'translateY( <length-pct> ) | ' +
      'translateZ( <length> )',
    '<transform-origin>': '[ left | center | right | <length-pct> ] ' +
      '[ top | center | bottom | <length-pct> ] <length>? | ' +
      '[ left | center | right | top | bottom | <length-pct> ] | ' +
      '[ [ center | left | right ] && [ center | top | bottom ] ] <length>?',
    '<transition>': '[ none | [ all | <ident> ]# ] || <time> || <single-timing-function> || <time>',
    '<width-height>': '<length-pct> | min-content | max-content | ' +
      'fit-content | fit-content( <length-pct> ) | -moz-available | -webkit-fill-available',
    '<will-change>': 'auto | <animateable-feature>#',
  };

  //#endregion
  //#region Colors

  const Colors = Object.assign(Object.create(null), {
    // 'currentColor' color keyword
    // https://www.w3.org/TR/css3-color/#currentcolor
    currentColor:         '',
    transparent:          '#0000',

    aliceblue:            '#f0f8ff',
    antiquewhite:         '#faebd7',
    aqua:                 '#00ffff',
    aquamarine:           '#7fffd4',
    azure:                '#f0ffff',
    beige:                '#f5f5dc',
    bisque:               '#ffe4c4',
    black:                '#000000',
    blanchedalmond:       '#ffebcd',
    blue:                 '#0000ff',
    blueviolet:           '#8a2be2',
    brown:                '#a52a2a',
    burlywood:            '#deb887',
    cadetblue:            '#5f9ea0',
    chartreuse:           '#7fff00',
    chocolate:            '#d2691e',
    coral:                '#ff7f50',
    cornflowerblue:       '#6495ed',
    cornsilk:             '#fff8dc',
    crimson:              '#dc143c',
    cyan:                 '#00ffff',
    darkblue:             '#00008b',
    darkcyan:             '#008b8b',
    darkgoldenrod:        '#b8860b',
    darkgray:             '#a9a9a9',
    darkgrey:             '#a9a9a9',
    darkgreen:            '#006400',
    darkkhaki:            '#bdb76b',
    darkmagenta:          '#8b008b',
    darkolivegreen:       '#556b2f',
    darkorange:           '#ff8c00',
    darkorchid:           '#9932cc',
    darkred:              '#8b0000',
    darksalmon:           '#e9967a',
    darkseagreen:         '#8fbc8f',
    darkslateblue:        '#483d8b',
    darkslategray:        '#2f4f4f',
    darkslategrey:        '#2f4f4f',
    darkturquoise:        '#00ced1',
    darkviolet:           '#9400d3',
    deeppink:             '#ff1493',
    deepskyblue:          '#00bfff',
    dimgray:              '#696969',
    dimgrey:              '#696969',
    dodgerblue:           '#1e90ff',
    firebrick:            '#b22222',
    floralwhite:          '#fffaf0',
    forestgreen:          '#228b22',
    fuchsia:              '#ff00ff',
    gainsboro:            '#dcdcdc',
    ghostwhite:           '#f8f8ff',
    gold:                 '#ffd700',
    goldenrod:            '#daa520',
    gray:                 '#808080',
    grey:                 '#808080',
    green:                '#008000',
    greenyellow:          '#adff2f',
    honeydew:             '#f0fff0',
    hotpink:              '#ff69b4',
    indianred:            '#cd5c5c',
    indigo:               '#4b0082',
    ivory:                '#fffff0',
    khaki:                '#f0e68c',
    lavender:             '#e6e6fa',
    lavenderblush:        '#fff0f5',
    lawngreen:            '#7cfc00',
    lemonchiffon:         '#fffacd',
    lightblue:            '#add8e6',
    lightcoral:           '#f08080',
    lightcyan:            '#e0ffff',
    lightgoldenrodyellow: '#fafad2',
    lightgray:            '#d3d3d3',
    lightgrey:            '#d3d3d3',
    lightgreen:           '#90ee90',
    lightpink:            '#ffb6c1',
    lightsalmon:          '#ffa07a',
    lightseagreen:        '#20b2aa',
    lightskyblue:         '#87cefa',
    lightslategray:       '#778899',
    lightslategrey:       '#778899',
    lightsteelblue:       '#b0c4de',
    lightyellow:          '#ffffe0',
    lime:                 '#00ff00',
    limegreen:            '#32cd32',
    linen:                '#faf0e6',
    magenta:              '#ff00ff',
    maroon:               '#800000',
    mediumaquamarine:     '#66cdaa',
    mediumblue:           '#0000cd',
    mediumorchid:         '#ba55d3',
    mediumpurple:         '#9370db',
    mediumseagreen:       '#3cb371',
    mediumslateblue:      '#7b68ee',
    mediumspringgreen:    '#00fa9a',
    mediumturquoise:      '#48d1cc',
    mediumvioletred:      '#c71585',
    midnightblue:         '#191970',
    mintcream:            '#f5fffa',
    mistyrose:            '#ffe4e1',
    moccasin:             '#ffe4b5',
    navajowhite:          '#ffdead',
    navy:                 '#000080',
    oldlace:              '#fdf5e6',
    olive:                '#808000',
    olivedrab:            '#6b8e23',
    orange:               '#ffa500',
    orangered:            '#ff4500',
    orchid:               '#da70d6',
    palegoldenrod:        '#eee8aa',
    palegreen:            '#98fb98',
    paleturquoise:        '#afeeee',
    palevioletred:        '#db7093',
    papayawhip:           '#ffefd5',
    peachpuff:            '#ffdab9',
    peru:                 '#cd853f',
    pink:                 '#ffc0cb',
    plum:                 '#dda0dd',
    powderblue:           '#b0e0e6',
    purple:               '#800080',
    rebeccapurple:        '#663399',
    red:                  '#ff0000',
    rosybrown:            '#bc8f8f',
    royalblue:            '#4169e1',
    saddlebrown:          '#8b4513',
    salmon:               '#fa8072',
    sandybrown:           '#f4a460',
    seagreen:             '#2e8b57',
    seashell:             '#fff5ee',
    sienna:               '#a0522d',
    silver:               '#c0c0c0',
    skyblue:              '#87ceeb',
    slateblue:            '#6a5acd',
    slategray:            '#708090',
    slategrey:            '#708090',
    snow:                 '#fffafa',
    springgreen:          '#00ff7f',
    steelblue:            '#4682b4',
    tan:                  '#d2b48c',
    teal:                 '#008080',
    thistle:              '#d8bfd8',
    tomato:               '#ff6347',
    turquoise:            '#40e0d0',
    violet:               '#ee82ee',
    wheat:                '#f5deb3',
    white:                '#ffffff',
    whitesmoke:           '#f5f5f5',
    yellow:               '#ffff00',
    yellowgreen:          '#9acd32',

    // old = CSS2 system colors: https://www.w3.org/TR/css3-color/#css2-system
    // new = CSS4 system colors: https://drafts.csswg.org/css-color-4/#css-system-colors
    ActiveBorder: '',
    ActiveCaption: '',
    ActiveText: '', // new
    AppWorkspace: '',
    Background: '',
    ButtonBorder: '', // new
    ButtonFace: '', // old+new
    ButtonHighlight: '',
    ButtonShadow: '',
    ButtonText: '', // old+new
    Canvas: '', // new
    CanvasText: '', // new
    CaptionText: '',
    Field: '', // new
    FieldText: '', // new
    GrayText: '', // old+new
    Highlight: '', // old+new
    HighlightText: '', // old+new
    InactiveBorder: '',
    InactiveCaption: '',
    InactiveCaptionText: '',
    InfoBackground: '',
    InfoText: '',
    LinkText: '', // new
    Mark: '', // new
    MarkText: '', // new
    Menu: '',
    MenuText: '',
    Scrollbar: '',
    ThreeDDarkShadow: '',
    ThreeDFace: '',
    ThreeDHighlight: '',
    ThreeDLightShadow: '',
    ThreeDShadow: '',
    VisitedText: '', // new
    Window: '',
    WindowFrame: '',
    WindowText: '',
  });
  const ColorsLC = new Set(Object.keys(Colors).map(lower));

  //#endregion
  //#region Tokens

  /* https://www.w3.org/TR/css3-syntax/#lexical */
  /** @type {Object<string,number|Object>} */
  const Tokens = Object.assign([], {
    EOF: {}, // must be the first token
  }, {
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
    DOCUMENT_SYM: {text: ['@document', '@-moz-document']},
    FONT_FACE_SYM: {text: '@font-face'},
    IMPORT_SYM: {text: '@import'},
    KEYFRAMES_SYM: {text: ['@keyframes', '@-webkit-keyframes', '@-moz-keyframes', '@-o-keyframes']},
    MEDIA_SYM: {text: '@media'},
    NAMESPACE_SYM: {text: '@namespace'},
    PAGE_SYM: {text: '@page'},
    SUPPORTS_SYM: {text: '@supports'},
    UNKNOWN_SYM: {},
    VIEWPORT_SYM: {text: ['@viewport', '@-ms-viewport', '@-o-viewport']},
    // measurements
    ANGLE: {},
    DIMENSION: {},
    FREQ: {},
    LENGTH: {},
    NUMBER: {},
    PERCENTAGE: {},
    TIME: {},
    // functions
    FUNCTION: {},
    URI: {},
    // Unicode ranges
    UNICODE_RANGE: {},
    // invalid string
    INVALID: {},
    // combinators
    COLUMN: {text: '||'},
    COMMA: {text: ','},
    GREATER: {text: '>'},
    PLUS: {text: '+'},
    TILDE: {text: '~'},
    // modifier
    ANY: {text: ['any', '-webkit-any', '-moz-any']},
    IS: {},
    NOT: {},
    WHERE: {},
    // CSS3 Paged Media
    BOTTOMCENTER_SYM: {text: '@bottom-center'},
    BOTTOMLEFTCORNER_SYM: {text: '@bottom-left-corner'},
    BOTTOMLEFT_SYM: {text: '@bottom-left'},
    BOTTOMRIGHTCORNER_SYM: {text: '@bottom-right-corner'},
    BOTTOMRIGHT_SYM: {text: '@bottom-right'},
    LEFTBOTTOM_SYM: {text: '@left-bottom'},
    LEFTMIDDLE_SYM: {text: '@left-middle'},
    LEFTTOP_SYM: {text: '@left-top'},
    RIGHTBOTTOM_SYM: {text: '@right-bottom'},
    RIGHTMIDDLE_SYM: {text: '@right-middle'},
    RIGHTTOP_SYM: {text: '@right-top'},
    TOPCENTER_SYM: {text: '@top-center'},
    TOPLEFTCORNER_SYM: {text: '@top-left-corner'},
    TOPLEFT_SYM: {text: '@top-left'},
    TOPRIGHTCORNER_SYM: {text: '@top-right-corner'},
    TOPRIGHT_SYM: {text: '@top-right'},
    /* CSS3 Media Queries */
    RESOLUTION: {state: 'media'},
    /*
     * The following token names are not defined in any CSS specification.
     */
    CHAR: {},
    COLON: {text: ':'},
    DOT: {text: '.'},
    EQUALS: {text: '='},
    IE_FUNCTION: {},
    IMPORTANT: {},
    LBRACE: {text: '{', endChar: '}'},
    LBRACKET: {text: '[', endChar: ']'},
    LPAREN: {text: '(', endChar: ')'},
    MINUS: {text: '-'},
    PIPE: {text: '|'},
    RBRACE: {text: '}'},
    RBRACKET: {text: ']'},
    RPAREN: {text: ')'},
    SEMICOLON: {text: ';'},
    SLASH: {text: '/'},
    STAR: {text: '*'},
    USO_VAR: {},
  });
  // make Tokens an array of tokens, store the index in original prop, add 'name' to each token
  const typeMap = new Map();
  for (const [k, val] of Object.entries(Tokens)) {
    const index = Tokens[k] = Tokens.length;
    val.name = k;
    Tokens.push(val);
    const {text} = val;
    if (text) {
      for (const item of Array.isArray(text) ? text : [text]) {
        typeMap.set(item, index);
      }
    }
  }
  Tokens.UNKNOWN = -1;
  Tokens.name = index => (Tokens[index] || {}).name;
  Tokens.type = text => typeMap.get(text) || Tokens.UNKNOWN;

  const TT = {
    attrMatch: [
      Tokens.PREFIXMATCH,
      Tokens.SUFFIXMATCH,
      Tokens.SUBSTRINGMATCH,
      Tokens.EQUALS,
      Tokens.INCLUDES,
      Tokens.DASHMATCH,
    ],
    combinator: [
      Tokens.PLUS,
      Tokens.GREATER,
      Tokens.TILDE,
      Tokens.COLUMN,
    ],
    cruft: [
      Tokens.S,
      Tokens.CDO,
      Tokens.CDC,
    ],
    expression: [
      Tokens.PLUS,
      Tokens.MINUS,
      Tokens.DIMENSION,
      Tokens.NUMBER,
      Tokens.STRING,
      Tokens.IDENT,
      Tokens.LENGTH,
      Tokens.FREQ,
      Tokens.ANGLE,
      Tokens.TIME,
      Tokens.RESOLUTION,
      Tokens.SLASH,
    ],
    identString: [
      Tokens.IDENT,
      Tokens.STRING,
    ],
    LParenBracket: [
      Tokens.LPAREN,
      Tokens.LBRACKET,
    ],
    LParenBracketBrace: [
      Tokens.LPAREN,
      Tokens.LBRACKET,
      Tokens.LBRACE,
    ],
    margins: [
      Tokens.TOPLEFTCORNER_SYM,
      Tokens.TOPLEFT_SYM,
      Tokens.TOPCENTER_SYM,
      Tokens.TOPRIGHT_SYM,
      Tokens.TOPRIGHTCORNER_SYM,
      Tokens.BOTTOMLEFTCORNER_SYM,
      Tokens.BOTTOMLEFT_SYM,
      Tokens.BOTTOMCENTER_SYM,
      Tokens.BOTTOMRIGHT_SYM,
      Tokens.BOTTOMRIGHTCORNER_SYM,
      Tokens.LEFTTOP_SYM,
      Tokens.LEFTMIDDLE_SYM,
      Tokens.LEFTBOTTOM_SYM,
      Tokens.RIGHTTOP_SYM,
      Tokens.RIGHTMIDDLE_SYM,
      Tokens.RIGHTBOTTOM_SYM,
    ],
    op: [
      Tokens.SLASH,
      Tokens.COMMA,
    ],
    opInFunc: [
      Tokens.SLASH,
      Tokens.COMMA,
      Tokens.PLUS,
      Tokens.STAR,
      Tokens.MINUS,
    ],
    plusMinus: [
      Tokens.MINUS,
      Tokens.PLUS,
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
    ],
    term: [
      Tokens.NUMBER,
      Tokens.PERCENTAGE,
      Tokens.LENGTH,
      Tokens.ANGLE,
      Tokens.TIME,
      Tokens.DIMENSION,
      Tokens.FREQ,
      Tokens.STRING,
      Tokens.IDENT,
      Tokens.URI,
      Tokens.UNICODE_RANGE,
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
      return this._input[this._cursor + count - 1] || null;
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
     * Reads up to and including the given string.
     * @param {String} pattern The string to read.
     * @return {String} The string when it is found.
     * @throws Error when the string pattern is not found.
     */
    readTo(pattern) {
      const i = this._input.indexOf(pattern, this._cursor);
      if (i < 0) throw new Error(`Expected '${pattern}'.`);
      return this.readCount(i - this._cursor + pattern.length);
    }

    /**
     * Reads characters that match either text or a regular expression and returns those characters.
     * If a match is found, the row and column are adjusted.
     * @param {String|RegExp} matcher
     * @return {String} string or null if there was no match.
     */
    readMatch(matcher) {
      if (matcher.sticky) {
        matcher.lastIndex = this._cursor;
        return matcher.test(this._input) ?
          this.readCount(RegExp.lastMatch.length) :
          null;
      }
      if (typeof matcher === 'string') {
        if (this._input[this._cursor] === matcher[0] &&
            this._input.substr(this._cursor, matcher.length) === matcher) {
          return this.readCount(matcher.length);
        }
      } else if (matcher instanceof RegExp) {
        if (matcher.test(this._input.substr(this._cursor))) {
          return this.readCount(RegExp.lastMatch.length);
        }
      }
      return null;
    }

    /**
     * Reads a given number of characters. If the end of the input is reached,
     * it reads only the remaining characters and does not throw an error.
     * @param {int} count The number of characters to read.
     * @return {String} string or null if already at EOF
     */
    readCount(count) {
      const len = this._input.length;
      if (this._cursor >= len) return null;
      if (!count) return '';
      const text = this._input.substr(this._cursor, count);
      this._cursor = Math.min(this._cursor + count, len);
      let prev = -1;
      for (let i = 0; (i = text.indexOf('\n', i)) >= 0; prev = i, i++) this._line++;
      this._col = prev < 0 ? this._col + count : count - prev;
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

    constructor(matchFunc, toString, options) {
      this.matchFunc = matchFunc;
      /** @type {function(?number):string} */
      this.toString = typeof toString === 'function' ? toString : () => toString;
      /** @type {?Matcher[]} */
      this.options = options;
    }

    /**
     * @param {PropertyValueIterator} e
     * @return {?boolean}
     */
    match(e) {
      return e.popMark(this.matchFunc(e.mark()));
    }

    braces(min, max, marker, sep) {
      return new Matcher(Matcher.funcBraces, Matcher.toStringBraces, {
        min, max, marker,
        sep: sep && Matcher.seq(sep, this),
        embraced: this,
      });
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

    // Matcher for a single type.
    static fromType(type) {
      let m = matcherCache.get(type);
      if (m) return m;
      m = new Matcher(Matcher.funcFromType, type, type);
      matcherCache.set(type, m);
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
     * @param {PropertyValueIterator} expr
     */
    static funcAlt(expr) {
      return this.options.some(Matcher.invoke, expr);
    }
    /**
     * @this {Matcher}
     * @param {PropertyValueIterator} expr
     */
    static funcBraces(expr) {
      const {min, max, sep, embraced} = this.options;
      let i = 0;
      while (i < max && (i && sep || embraced).match(expr)) {
        i++;
      }
      return i >= min;
    }
    /**
     * @this {Matcher}
     * @param {PropertyValueIterator} expr
     */
    static funcFromType(expr) {
      const part = expr.peek();
      if (!part) return;
      const type = this.options;
      let result, m;
      if (part.isVar) {
        result = true;
      } else if (!type.startsWith('<')) {
        result = vtIsLiteral(type, part);
      } else if ((m = VTSimple[type])) {
        result = m.call(VTSimple, part);
      } else {
        m = VTComplex[type];
        return m instanceof Matcher ?
          m.match(expr) :
          m.call(VTComplex, expr);
      }
      if (!result && expr.tryAttr && part.isAttr) {
        result = vtIsAttr(part);
      }
      if (result) expr.next();
      return result;
    }
    /**
     * @this {Matcher}
     * @param {PropertyValueIterator} expr
     */
    static funcFunc(expr) {
      const p = expr.peek();
      if (p && p.expr && p.tokenType === Tokens.FUNCTION && lowerCmp(p.name, this.options.name)) {
        let res = hasVarParts(p.expr);
        if (!res) {
          const vi = new PropertyValueIterator(p.expr); // eslint-disable-line no-use-before-define
          res = this.options.body.match(vi) && !vi.hasNext;
        }
        return res && expr.next();
      }
    }
    /**
     * @this {PropertyValueIterator}
     * @param {Matcher} m
     */
    static invoke(m) {
      return m.match(this);
    }
    /**
     * @this {Matcher}
     * @param {PropertyValueIterator} expr
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
          if (!ms[i].matchFunc(expr)) {
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
     * @param {PropertyValueIterator} expr
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
      const {name, body} = this.options;
      return `${name}( ${body} )`;
    }
    /** @this {Matcher} */
    static toStringMany(prec) {
      const {options: ms, required} = this;
      const p = required === false ? Matcher.prec.OROR : Matcher.prec.ANDAND;
      const s = ms.map((m, i) => {
        if (required !== false && !required[i]) {
          const str = m.toString(Matcher.prec.MOD);
          return str.endsWith('?') ? str : str + '?';
        }
        return m.toString(p);
      }).join(required === false ? ' || ' : ' && ');
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
      const m = [oror()];
      while (reader.readMatch(' | ')) {
        m.push(oror());
      }
      return m.length === 1 ? m[0] : Matcher.alt(...m);
    }
    // Matcher for two or more options in any order, at least one must be present.
    function oror() {
      // oror = andand ( " || " andand)*
      const m = [andand()];
      while (reader.readMatch(' || ')) {
        m.push(andand());
      }
      return m.length === 1 ? m[0] : Matcher.many(false, ...m);
    }
    // Matcher for two or more options in any order, all mandatory.
    function andand() {
      // andand = seq ( " && " seq)*
      const m = [seq()];
      let reqPrev = !isOptional(m[0]);
      const required = [reqPrev];
      while (reader.readMatch(' && ')) {
        const item = seq();
        const req = !isOptional(item);
        // Matcher.many apparently can't handle optional items first
        if (req && !reqPrev) {
          m.unshift(item);
          required.unshift(req);
        } else {
          m.push(item);
          required.push(req);
          reqPrev = req;
        }
      }
      return m.length === 1 ? m[0] : Matcher.many(required, ...m);
    }
    function seq() {
      // seq = mod ( " " mod)*
      const ms = [mod()];
      while (reader.readMatch(/\s(?![&|)\]])/y)) {
        ms.push(mod());
      }
      return Matcher.seq(...ms);
    }
    function mod() {
      // mod = term ( "?" | "*" | "+" | "#" | "{<num>,<num>}" )?
      // term = <nt> | literal | "[ " expression " ]" | fn "( " alt " )"
      let m, fn;
      if (reader.readMatch('[ ')) {
        m = alt();
        eat(' ]');
      } else if ((fn = reader.readMatch(/[-\w]+(?=\(\s)/y))) {
        reader.readCount(2);
        m = alt();
        eat(' )');
        return Matcher.func(fn, m);
      } else {
        m = Matcher.fromType(eat(/[^\s?*+#{]+/y));
      }
      reader.mark();
      let hash;
      switch (reader.read()) {
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
        default:
          reader.reset();
      }
      return m;
    }
    function eat(pattern) {
      const s = reader.readMatch(pattern);
      if (s != null) return s;
      throw new Error('Internal grammar error. ' +
        `Expected ${pattern} at ${reader._cursor} in ${reader._input}`);
    }
    function isOptional({options}) {
      return options && options.marker === '?';
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

  /**
   * @property {boolean|number} [_isAttr]
   * @property {boolean|number} [_isCalc]
   * @property {boolean|number} [_isVar]
   */
  class SyntaxUnit {
    constructor(text, pos, type, extras) {
      this.col = pos.col;
      this.line = pos.line;
      this.offset = pos.offset;
      this.text = text;
      this.type = type;
      if (extras) Object.assign(this, extras);
    }
    valueOf() {
      return this.text;
    }
    toString() {
      return this.text;
    }
    get isAttr() {
      let res = this._isAttr;
      if (res === 0) res = this._isAttr = lowerCmp(this.name, 'attr');
      return res;
    }
    get isCalc() {
      let res = this._isCalc;
      if (res === 0) res = this._isCalc = rxCalc.test(this.text);
      return res;
    }
    get isVar() {
      let res = this._isVar;
      if (res === 0) {
        const pp = this.expr && this.expr.parts;
        res = this._isVar = pp && pp.length > 0 && (
          (pp.length === 1 || pp[1].text === ',') && (
            pp[0].type === 'custom-property' && lowerCmp(this.name, 'var') ||
            pp[0].type === 'identifier' && lowerCmp(this.name, 'env')));
      }
      return res;
    }
    static fromToken(token) {
      return token && new SyntaxUnit(token.value, token);
    }

    /**
     * @param {SyntaxUnit} unit
     * @param {SyntaxUnit|parserlib.Token} token
     * @returns {SyntaxUnit}
     */
    static addFuncInfo(unit, {expr, name} = unit) {
      const isColor = expr && expr.parts && /^(rgb|hsl)a?$/i.test(name);
      if (isColor) unit.type = 'color';
      unit._isAttr =
        unit._isCalc =
          unit._isVar = isColor ? false : 0;
      return unit;
    }
  }

  class SyntaxError extends Error {
    constructor(message, pos) {
      super();
      this.name = this.constructor.name;
      this.col = pos.col;
      this.line = pos.line;
      this.message = message;
    }
  }

  class ValidationError extends Error {
    constructor(message, pos) {
      super();
      this.col = pos.col;
      this.line = pos.line;
      this.message = message;
    }
  }

  // individual media query
  class MediaQuery extends SyntaxUnit {
    constructor(modifier, mediaType, features, pos) {
      const text = (modifier ? modifier + ' ' : '') +
                   (mediaType ? mediaType : '') +
                   (mediaType && features.length > 0 ? ' and ' : '') +
                   features.join(' and ');
      super(text, pos, TYPES.MEDIA_QUERY_TYPE);
      this.modifier = modifier;
      this.mediaType = mediaType;
      this.features = features;
    }
  }

  // e.g. max-width:500.
  class MediaFeature extends SyntaxUnit {
    constructor(name, value) {
      const text = `(${name}${value != null ? ':' + value : ''})`;
      super(text, name, TYPES.MEDIA_FEATURE_TYPE);
      this.name = name;
      this.value = value;
    }
  }

  /**
   * An entire single selector, including all parts but not
   * including multiple selectors (those separated by commas).
   */
  class Selector extends SyntaxUnit {
    constructor(parts, pos) {
      super(parts.join(' '), pos, TYPES.SELECTOR_TYPE);
      this.parts = parts;
      // eslint-disable-next-line no-use-before-define
      this.specificity = Specificity.calculate(this);
    }
  }

  /**
   * A single part of a selector string i.e. element name and modifiers.
   * Does not include combinators such as spaces, +, >, etc.
   */
  class SelectorPart extends SyntaxUnit {
    constructor(elementName, modifiers, text, pos) {
      super(text, pos, TYPES.SELECTOR_PART_TYPE);
      this.elementName = elementName;
      this.modifiers = modifiers;
    }
  }

  /**
   * Selector modifier string
   */
  class SelectorSubPart extends SyntaxUnit {
    constructor(text, type, pos) {
      super(text, pos, TYPES.SELECTOR_SUB_PART_TYPE);
      this.type = type;
      // Some subparts have arguments
      this.args = [];
    }
  }

  /**
   * A selector combinator (whitespace, +, >).
   */
  class Combinator extends SyntaxUnit {
    constructor(token) {
      const {value} = token;
      super(value, token, TYPES.COMBINATOR_TYPE);
      this.type =
        value === '>' ? 'child' :
        value === '+' ? 'adjacent-sibling' :
        value === '~' ? 'sibling' :
        value === '||' ? 'column' :
        !value.trim() ? 'descendant' :
          'unknown';
    }
  }

  /**
   * A selector specificity.
   */
  class Specificity {
    /**
     * @param {int} a Should be 1 for inline styles, zero for stylesheet styles
     * @param {int} b Number of ID selectors
     * @param {int} c Number of classes and pseudo classes
     * @param {int} d Number of element names and pseudo elements
     */
    constructor(a, b, c, d) {
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.constructor = Specificity;
    }
    /**
     * @param {Specificity} other The other specificity to compare to.
     * @return {int} -1 if the other specificity is larger, 1 if smaller, 0 if equal.
     */
    compare(other) {
      const comps = ['a', 'b', 'c', 'd'];
      for (let i = 0, len = comps.length; i < len; i++) {
        if (this[comps[i]] < other[comps[i]]) {
          return -1;
        } else if (this[comps[i]] > other[comps[i]]) {
          return 1;
        }
      }
      return 0;
    }
    valueOf() {
      return this.a * 1000 + this.b * 100 + this.c * 10 + this.d;
    }
    toString() {
      return `${this.a},${this.b},${this.c},${this.d}`;
    }
    /**
     * Calculates the specificity of the given selector.
     * @param {Selector} selector The selector to calculate specificity for.
     * @return {Specificity} The specificity of the selector.
     */
    static calculate(selector) {
      let b = 0;
      let c = 0;
      let d = 0;
      selector.parts.forEach(updateValues);
      return new Specificity(0, b, c, d);
      function updateValues(part) {
        if (!(part instanceof SelectorPart)) return;
        const elementName = part.elementName ? part.elementName.text : '';
        if (elementName && !elementName.endsWith('*')) {
          d++;
        }
        for (const modifier of part.modifiers) {
          switch (modifier.type) {
            case 'class':
            case 'attribute':
              c++;
              break;
            case 'id':
              b++;
              break;
            case 'pseudo':
              if (isPseudoElement(modifier.text)) {
                d++;
              } else {
                c++;
              }
              break;
            case 'not':
              modifier.args.forEach(updateValues);
          }
        }
      }
    }
  }

  class PropertyName extends SyntaxUnit {
    constructor(text, hack, pos) {
      super(text, pos, TYPES.PROPERTY_NAME_TYPE);
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
  class PropertyValue extends SyntaxUnit {
    constructor(parts, pos) {
      super(parts.join(' '), pos, TYPES.PROPERTY_VALUE_TYPE);
      this.parts = parts;
    }
  }

  /**
   * A single part of a value
   * e.g. '1px solid rgb(1, 2, 3)' has 3 parts
   * @property {PropertyValue} expr
   */
  class PropertyValuePart extends SyntaxUnit {
    /** @param {parserlib.Token} token */
    constructor(token) {
      const {value, type} = token;
      super(value, token, TYPES.PROPERTY_VALUE_PART_TYPE);
      this.tokenType = type;
      this.expr = token.expr || null;
      switch (type) {
        case Tokens.ANGLE:
        case Tokens.DIMENSION:
        case Tokens.FREQ:
        case Tokens.LENGTH:
        case Tokens.NUMBER:
        case Tokens.PERCENTAGE:
        case Tokens.TIME:
          this.value = token.number;
          this.units = token.units;
          this.type = token.unitsType;
          this.isInt = this.type === 'number' && !value.includes('.');
          break;
        case Tokens.HASH:
          this.type = 'color';
          this.value = value;
          break;
        case Tokens.IDENT:
          if (value.startsWith('--')) {
            this.type = 'custom-property';
            this.value = value;
          } else {
            const namedColor = Colors[value] || Colors[lower(value)];
            this.type = namedColor ? 'color' : 'identifier';
            this.value = namedColor || value;
          }
          break;
        case Tokens.FUNCTION: {
          this.name = token.name;
          SyntaxUnit.addFuncInfo(this, token);
          break;
        }
        case Tokens.STRING:
          this.type = 'string';
          this.value = parseString(value);
          break;
        case Tokens.URI:
          this.type = 'uri';
          this.name = token.name;
          this.uri = token.uri;
          break;
        case Tokens.USO_VAR:
          this._isVar = true;
          break;
        default:
          if (value === ',' || value === '/') {
            this.type = 'operator';
            this.value = value;
          } else {
            this.type = 'unknown';
          }
      }
    }
  }

  class PropertyValueIterator {
    /**
     * @param {PropertyValue} value
     */
    constructor(value) {
      this._i = 0;
      this._parts = value.parts;
      this._marks = [];
      this.value = value;
      this.hasNext = this._parts.length > 0;
    }
    /** @returns {PropertyValuePart|null} */
    peek(count) {
      return this._parts[this._i + (count || 0)] || null;
    }
    /** @returns {?PropertyValuePart} */
    next() {
      if (this.hasNext) {
        this.hasNext = this._i + 1 < this._parts.length;
        return this._parts[this._i++];
      }
    }
    /** @returns {PropertyValueIterator} */
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

  for (const obj of [VTSimple, VTComplex]) {
    const action = obj === VTSimple
      ? rule => vtIsLiteral.bind(obj, rule)
      : Matcher.parse;
    for (const [id, rule] of Object.entries(obj)) {
      if (typeof rule === 'string') {
        obj[id] = Object.defineProperty(action(rule), 'originalText', {value: rule});
      } else if (/^Matcher\s/.test(rule)) {
        obj[id] = rule(Matcher);
      }
    }
  }

  function vtDescribe(type) {
    const complex = VTComplex[type];
    const text = complex instanceof Matcher ? complex.toString(0) : type;
    return vtExplode(text);
  }

  function vtExplode(text) {
    if (!text.includes('<')) return text;
    return text.replace(/(<.*?>)([{#?]?)/g, (s, rule, mod) => {
      const ref = VTSimple[rule] || VTComplex[rule];
      if (!ref || !ref.originalText) return s;
      const full = vtExplode(ref.originalText);
      const brace = mod || full.includes(' ');
      return ((brace ? '[ ' : '') + full + (brace ? ' ]' : '')) + mod;
    });
  }

  /** @param {PropertyValuePart} p */
  function vtIsAttr(p) {
    return p.isAttr && (p = p.expr) && (p = p.parts) && p.length && vtIsIdent(p[0]);
  }

  /** @param {PropertyValuePart} p */
  function vtIsIdent(p) {
    return p.tokenType === Tokens.IDENT;
  }

  /** @param {PropertyValuePart} p */
  function vtIsLength(p) {
    return p.text === '0' || p.type === 'length' || p.isCalc;
  }

  /**
   * @param {string} literals
   * @param {PropertyValuePart} part
   * @return {?boolean}
   */
  function vtIsLiteral(literals, part) {
    let text;
    for (const arg of literals.includes(' | ') ? literals.split(' | ') : [literals]) {
      if (arg.startsWith('<')) {
        const vt = VTSimple[arg];
        if (vt && vt(part)) {
          return true;
        }
        continue;
      }
      if (arg.endsWith('()') &&
          part.tokenType === Tokens.FUNCTION &&
          part.name.length === arg.length - 2 &&
          lowerCmp(part.name, arg.slice(0, -2))) {
        return true;
      }
      if ((text || part.text) === arg ||
          (text || part.text).length >= arg.length &&
          lowerCmp(arg, text || (text = rxVendorPrefix.test(part.text) ? RegExp.$2 : part.text))) {
        return true;
      }
    }
  }

  /** @param {PropertyValuePart} p */
  function vtIsPct(p) {
    return p.text === '0' || p.type === 'percentage' || p.isCalc;
  }

  //#endregion
  //#region Validation

  const validationCache = new Map();

  function validateProperty(property, value) {
    // Global keywords that can be set for any property are conveniently listed in `all` prop:
    // https://drafts.csswg.org/css-cascade/#all-shorthand
    if (/^(inherit|initial|unset|revert)$/i.test(value.parts[0])) {
      if (value.parts.length > 1) {
        throwEndExpected(value.parts[1], true);
      }
      return;
    }
    if (hasVarParts(value)) {
      return;
    }
    const prop = lower(property);
    let known = validationCache.get(prop);
    if (known && known.has(value.text)) {
      return;
    }
    const spec = Properties[prop] || rxVendorPrefix.test(prop) && Properties[RegExp.$2];
    if (typeof spec === 'number' || !spec && prop.startsWith('-')) {
      return;
    }
    if (!spec) {
      throw new ValidationError(`Unknown property '${property}'.`, value);
    }
    // Property-specific validation.
    const expr = new PropertyValueIterator(value);
    const m = Matcher.parse(spec);
    let result = m.match(expr);
    if (/\battr\(/i.test(value.text)) {
      if (!result) {
        expr.tryAttr = true;
        expr.resetTo(0);
        result = m.match(expr);
      }
      for (let p; (p = expr.peek()) && p.isAttr && vtIsAttr(p);) {
        expr.next();
      }
    }
    if (result) {
      if (expr.hasNext) throwEndExpected(expr.next());
    } else if (expr.hasNext && expr._i) {
      throwEndExpected(expr.peek());
    } else {
      const {text} = expr.value;
      throw new ValidationError(`Expected '${vtDescribe(spec)}' but found '${text}'.`,
        expr.value);
    }
    if (!known) validationCache.set(prop, (known = new Set()));
    known.add(value.text);
    function throwEndExpected(unit, force) {
      if (force || !unit.isVar) {
        throw new ValidationError(`Expected end of value but found '${unit.text}'.`, unit);
      }
    }
  }

  //#endregion
  //#region TokenStreamBase

  /** lookup table size for TokenStreamBase */
  const LT_SIZE = 5;

  /**
   * Generic TokenStream providing base functionality.
   * @typedef TokenStream
   */
  class TokenStreamBase {

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
     * @param {int|int[]} tokenTypes
     * @param {string|string[]} [values]
     * @return {parserlib.Token|boolean} token or `false`
     */
    match(tokenTypes, values) {
      const isArray = typeof tokenTypes === 'object';
      for (let token, tt; (tt = (token = this.get(true)).type);) {
        if ((isArray ? tokenTypes.includes(tt) : tt === tokenTypes) &&
            (!values || values.some(lowerCmpThis, token.value))) {
          return token;
        }
        if (tt !== Tokens.COMMENT) {
          break;
        }
      }
      this.unget();
      return false;
    }

    /**
     * Consumes the next token if that matches the given token type(s).
     * Otherwise an error is thrown.
     * @param {int|int[]} tokenTypes
     * @throws {SyntaxError}
     */
    mustMatch(tokenTypes) {
      return this.match(tokenTypes) ||
        this.throwUnexpected(this.LT(1), tokenTypes);
    }

    /**
     * Keeps reading until one of the specified token types is found or EOF.
     * @param {int|int[]} tokenTypes
     */
    advance(tokenTypes) {
      while (this.LA(0) !== 0 && !this.match(tokenTypes)) {
        this.get();
      }
      return this.LA(0);
    }

    /**
     * Consumes the next token from the token stream.
     * @param {boolean} [asToken]
     * @return {int|parserlib.Token} The token type
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
     * Looks ahead a certain number of tokens and returns the token type at that position.
     * @param {int} index The index of the token type to retrieve.
     *         0 for the current token, 1 for the next, -1 for the previous, etc.
     * @return {int} The token type
     * @throws if you lookahead past EOF, past the size of the lookahead buffer,
     *         or back past the first token in the lookahead buffer.
     */
    LA(index) {
      return (index ? this.LT(index) : this._token).type;
    }

    /**
     * Looks ahead a certain number of tokens and returns the token at that position.
     * @param {int} index The index of the token type to retrieve.
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
        .map(e => typeof e === 'string' ? e : Tokens.name(e))
        .join(', ');
      const msg = expected
        ? `Expected ${expected} but found '${token.value}'.`
        : `Unexpected '${token.value}'.`;
      throw new SyntaxError(msg, token);
    }
  }

  //#endregion
  //#region TokenStream

  class TokenStream extends TokenStreamBase {

    /**
     * @param {Number|Number[]} tokenTypes
     * @param {Boolean} [skipCruftBefore=true] - skip comments/uso-vars/whitespace before matching
     * @returns {Object} token
     */
    mustMatch(tokenTypes, skipCruftBefore = true) {
      if (skipCruftBefore && tokenTypes !== Tokens.S) {
        this.skipComment(true);
      }
      return super.mustMatch(tokenTypes);
    }

    /**
     * @param {Boolean} [skipWS] - skip whitespace too
     */
    skipComment(skipWS) {
      const tt = this.LT(1, true).type;
      if (skipWS && tt === Tokens.S ||
          tt === Tokens.USO_VAR ||
          tt === Tokens.COMMENT ||
          tt == null && this._ltIndex === this._ltAhead && (
            skipWS && this._reader.readMatch(/\s+/y),
            this._reader.peekTest(/\/\*/y))) {
        while (this.match(TT.usoS)) { /*NOP*/ }
      }
    }

    /**
     * @returns {Object} token
     */
    _getToken() {
      const reader = this._reader;
      /** @namespace parserlib.Token */
      const tok = {
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
        a = this.readEscape();
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
          tok.endChar = '}';
          return tok;
        case '(':
          tok.type = Tokens.LPAREN;
          tok.endChar = ')';
          return tok;
        case '[':
          tok.type = Tokens.LBRACKET;
          tok.endChar = ']';
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
            tok.value = a + reader.read();
            tok.type = typeMap.get(tok.value) || Tokens.CHAR;
          } else if (a === '|' && b === '|') {
            reader.read();
            tok.value = '||';
            tok.type = Tokens.COLUMN;
          } else {
            tok.type = typeMap.get(a) || Tokens.CHAR;
          }
          return tok;
        case '"':
        case "'":
          return this.stringToken(a, tok);
        case '#':
          if (rxNameChar.test(b)) {
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
            } else if (reader.readMatch('->')) {
              tok.type = Tokens.CDC;
              tok.value = '-->';
            }
          } else if (b >= '0' && b <= '9' || b === '.' && reader.peekTest(/\.\d/y)) {
            this.numberToken(a, tok);
          } else if (rxIdentStart.test(b)) {
            this.identOrFunctionToken(a, tok);
          } else {
            tok.type = Tokens.MINUS;
          }
          return tok;
        case '+':
          if (b >= '0' && b <= '9' || b === '.' && reader.peekTest(/\.\d/y)) {
            this.numberToken(a, tok);
          } else {
            tok.type = Tokens.PLUS;
          }
          return tok;
        case '!':
          return this.importantToken(a, tok);
        case '@':
          return this.atRuleToken(a, tok);
        case ':': {
          const func = /[-niw]/i.test(b) &&
            reader.readMatch(/(not|is|where|(-(moz|webkit)-)?any)\(/iy);
          if (func) {
            const first = b.toLowerCase();
            tok.type =
              first === 'n' ? Tokens.NOT :
              first === 'i' ? Tokens.IS :
              first === 'w' ? Tokens.WHERE : Tokens.ANY;
            tok.value += func;
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
      } else if (rxIdentStart.test(a)) {
        this.identOrFunctionToken(a, tok);
      } else {
        tok.type = typeMap.get(a) || Tokens.CHAR;
      }
      return tok;
    }

    atRuleToken(first, token) {
      this._reader.mark();
      let rule = first + this.readName();
      let tt = Tokens.type(lower(rule));
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
      const name = this.readChunksWithEscape(first, rxNameCharNoEsc);
      const next = reader.peek();
      token.value = name;
      // might be a URI or function
      if (next === '(') {
        reader.read();
        if (/^(url(-prefix)?|domain)$/i.test(name)) {
          reader.mark();
          const uri = this.readURI(name + '(');
          if (uri) {
            token.type = Tokens.URI;
            token.value = uri.text;
            token.name = name;
            token.uri = uri.value;
            return token;
          }
          reader.reset();
        }
        token.type = Tokens.FUNCTION;
        token.value += '(';
      } else if (next === ':' && lowerCmp(name, 'progid')) {
        token.type = Tokens.IE_FUNCTION;
        token.value += reader.readTo('(');
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
      let tt = Tokens.NUMBER;
      let units, type;
      const c = reader.peek();
      if (rxIdentStart.test(c)) {
        units = this.readName(reader.read());
        type = UNITS[units] || UNITS[lower(units)];
        tt = type && Tokens[type.toUpperCase()] ||
             type === 'frequency' && Tokens.FREQ ||
             Tokens.DIMENSION;
      } else if (c === '%') {
        units = reader.read();
        type = 'percentage';
        tt = Tokens.PERCENTAGE;
      } else {
        type = 'number';
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
      const string = first ? [first] : [];
      const reader = this._reader;
      let tt = Tokens.STRING;
      let c;
      while (true) {
        c = reader.readMatch(/[^\n\r\f\\'"]+|./y);
        if (!c) break;
        string.push(c);
        if (c === '\\') {
          c = reader.read();
          if (c == null) {
            break; // premature EOF after backslash
          } else if (/[^\r\n\f0-9a-f]/i.test(c)) {
            // single-character escape
            string.push(c);
          } else {
            // read up to six hex digits + newline
            string.push(c, reader.readMatch(/[0-9a-f]{1,6}\n?/yi));
          }
        } else if (c === delim) {
          break; // delimiter found.
        } else if (reader.peekTest(/[\n\r\f]/y)) {
          // newline without an escapement: it's an invalid string
          tt = Tokens.INVALID;
          break;
        }
      }
      token.type = c ? tt : Tokens.INVALID; // if the string wasn't closed
      token.value = fastJoin(string);
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

    // returns null w/o resetting reader if URI is invalid.
    readURI(first) {
      const reader = this._reader;
      const uri = first;
      let value = '';
      this._reader.readMatch(/\s+/y);
      if (reader.peekTest(/['"]/y)) {
        value = this.readString();
        if (value == null) return null;
        value = parseString(value);
      } else {
        value = this.readChunksWithEscape('', rxUnquotedUrlCharNoEsc);
      }
      this._reader.readMatch(/\s+/y);
      // Ensure argument to URL is always double-quoted
      // (This simplifies later processing in PropertyValuePart.)
      return reader.peek() !== ')' ? null : {
        value,
        text: uri + serializeString(value) + reader.read(),
      };
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
      const url = first ? [first] : [];
      while (true) {
        const chunk = reader.readMatch(rx);
        if (chunk) url.push(chunk);
        if (reader.peekTest(/\\[^\r\n\f]/y)) {
          reader.read();
          url.push(this.readEscape());
        } else {
          break;
        }
      }
      return fastJoin(url);
    }

    readComment(first) {
      return first +
             this._reader.readCount(2 - first.length) +
             this._reader.readMatch(/([^*]|\*(?!\/))*(\*\/|$)/y);
    }

    /**
     * @param {boolean} [omitComments]
     * @param {string} [stopOn] - goes to the parent if used at the top nesting level of the value,
       specifying an empty string will stop after consuming the first encountered top block.
     * @returns {?string}
     */
    readDeclValue({omitComments, stopOn = ';!})'} = {}) {
      const reader = this._reader;
      const value = [];
      const endings = [];
      let end = stopOn;
      const rx = stopOn.includes(';')
        ? /([^;!'"{}()[\]/\\]|\/(?!\*))+/y
        : /([^'"{}()[\]/\\]|\/(?!\*))+/y;
      while (!reader.eof()) {
        const chunk = reader.readMatch(rx);
        if (chunk) {
          value.push(chunk);
        }
        reader.mark();
        const c = reader.read();
        if (!endings.length && stopOn.includes(c)) {
          reader.reset();
          break;
        }
        value.push(c);
        if (c === '\\') {
          value[value.length - 1] = this.readEscape();
        } else if (c === '/') {
          value[value.length - 1] = this.readComment(c);
          if (omitComments) value.pop();
        } else if (c === '"' || c === "'") {
          value[value.length - 1] = this.readString(c);
        } else if (c === '{' || c === '(' || c === '[') {
          endings.push(end);
          end = c === '{' ? '}' : c === '(' ? ')' : ']';
        } else if (c === '}' || c === ')' || c === ']') {
          if (!end.includes(c)) {
            reader.reset();
            return null;
          }
          end = endings.pop();
          if (!end && !stopOn) {
            break;
          }
        }
      }
      return fastJoin(value);
    }

    readUnknownSym() {
      const reader = this._reader;
      const prelude = [];
      let block;
      while (true) {
        if (reader.eof()) this.throwUnexpected();
        const c = reader.peek();
        if (c === '{') {
          block = this.readDeclValue({stopOn: ''});
          break;
        } else if (c === ';') {
          reader.read();
          break;
        } else {
          prelude.push(this.readDeclValue({omitComments: true, stopOn: ';{'}));
        }
      }
      return {prelude, block};
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
    // true on page load, first run is pure analysis
    let firstRun = true;
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
        if (firstRun) firstRun = false;
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
        if (!parser || firstRun || !token) return;

        const reader = stream._reader;
        const input = reader._input;
        let start = token.offset;
        const c = input[start];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r') {
          const rx = /\s*/y;
          rx.lastIndex = start;
          rx.exec(input);
          start = rx.lastIndex;
        }
        const key = input.slice(start, input.indexOf('{', start) + 1);
        const blocks = data.get(key);
        if (!blocks) return;

        const block = getBlock(blocks, input, start, key);
        if (!block) return;

        reader.readCount(start - reader._cursor);
        shiftBlock(reader, start, block);
        shiftStream(reader, block);
        parser._ws();
        return true;
      },
      startBlock(start = getToken()) {
        if (!parser) return;
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
      },
      adjustBlockStart(start = getToken()) {
        if (!parser) return;
        const block = stack[stack.length - 1];
        block.line = start.line;
        block.col = start.col;
        block.offset = start.offset;
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
      cancelBlock: () => stack.pop(),
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
    function shiftBlock(reader, start, block) {
      // extracted to prevent V8 deopt
      const deltaLines = reader._line - block.line;
      const deltaCols = block.col === 1 && reader._col === 1 ? 0 : reader._col - block.col;
      const deltaOffs = reader._cursor - block.offset;
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
      block.endOffset = reader._cursor + block.text.length;
      block.line += deltaLines;
      block.col += deltaCols;
      block.offset = reader._cursor;
    }

    function shiftStream(reader, block) {
      reader._line = block.endLine;
      reader._col = block.endCol;
      reader._cursor = block.endOffset;

      stream.resetLT();
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
      /** @type {TokenStream|TokenStreamBase} */
      this._tokenStream = null;
    }

    /**
     * @param {string|Object} event
     * @param {parserlib.Token|SyntaxUnit} [token=this._tokenStream._token] - sets the position
     */
    fire(event, token = this._tokenStream._token) {
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

    _stylesheet() {
      const stream = this._tokenStream;
      this.fire('startstylesheet');
      this._sheetGlobals();
      const {topDocOnly} = this.options;
      const allowedActions = topDocOnly ? Parser.ACTIONS.topDoc : Parser.ACTIONS.stylesheet;
      for (let tt, token; (tt = (token = stream.get(true)).type); this._skipCruft()) {
        try {
          const action = allowedActions.get(tt);
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
      const token = stream.mustMatch(TT.stringUri);
      const uri = token.uri || token.value.replace(/^["']|["']$/g, '');
      this._ws();
      const media = this._mediaQueryList();
      stream.mustMatch(Tokens.SEMICOLON);
      this.fire({type: 'import', media, uri}, start);
      this._ws();
    }

    _namespace(start) {
      const stream = this._tokenStream;
      this._ws();
      const prefix = stream.match(Tokens.IDENT).value;
      if (prefix) this._ws();
      const token = stream.mustMatch(TT.stringUri);
      const uri = token.uri || token.value.replace(/^["']|["']$/g, '');
      stream.mustMatch(Tokens.SEMICOLON);
      this.fire({type: 'namespace', prefix, uri}, start);
      this._ws();
    }

    _supports(start) {
      const stream = this._tokenStream;
      this._ws();
      this._supportsCondition();
      stream.mustMatch(Tokens.LBRACE);
      this.fire('startsupports', start);
      this._ws();
      for (;; stream.skipComment()) {
        const action = Parser.ACTIONS.supports.get(stream.peek());
        if (action) {
          action.call(this, stream.get(true));
        } else if (!this._ruleset()) {
          break;
        }
      }
      stream.mustMatch(Tokens.RBRACE);
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
      const next = stream.LT(1);
      if (next.type === Tokens.LPAREN) {
        stream.get();
        this._ws();
        const {type, value} = stream.LT(1);
        if (type === Tokens.IDENT) {
          if (lowerCmp(value, 'not')) {
            this._supportsCondition();
            stream.mustMatch(Tokens.RPAREN);
          } else {
            this._supportsDecl(false);
          }
        } else {
          this._supportsCondition();
          stream.mustMatch(Tokens.RPAREN);
        }
      } else if (stream.match(Tokens.FUNCTION, ['selector('])) {
        this._ws();
        this._selector();
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
      this._ws();
      let action;
      do action = Parser.ACTIONS.media.get(stream.peek());
      while (action ? action.call(this, stream.get(true)) || true : this._ruleset());
      stream.mustMatch(Tokens.RBRACE);
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
      let type = null;
      const token = stream.match(Tokens.IDENT, ['only', 'not']);
      const ident = token.value || null;
      this._ws();
      const next = stream.LT(1);
      switch (next.type) {
        case Tokens.IDENT:
          type = this._mediaFeature();
          break;
        case Tokens.LPAREN:
          expressions.push(this._mediaExpression());
          break;
        default:
          return;
      }
      this._ws();
      while (stream.match(Tokens.IDENT)) {
        if (lowerCmp(stream._token.value, 'and')) {
          this._ws();
          expressions.push(this._mediaExpression());
        } else {
          stream.throwUnexpected(undefined, ["'and'"]);
        }
      }
      return new MediaQuery(ident, type, expressions, token || next);
    }

    _mediaExpression() {
      const stream = this._tokenStream;
      let token;
      let expression = null;
      stream.mustMatch(Tokens.LPAREN);
      const feature = this._mediaFeature();
      this._ws();
      if (stream.match(Tokens.COLON)) {
        this._ws();
        token = stream.LT(1);
        expression = this._expression({calc: true});
      }
      stream.mustMatch(Tokens.RPAREN);
      this._ws();
      return new MediaFeature(feature, expression ? new SyntaxUnit(expression, token) : null);
    }

    _mediaFeature() {
      this._tokenStream.mustMatch(Tokens.IDENT);
      return SyntaxUnit.fromToken(this._tokenStream._token);
    }

    _page(start) {
      const stream = this._tokenStream;
      this._ws();
      const id = stream.match(Tokens.IDENT).value || null;
      if (id && lowerCmp(id, 'auto')) {
        stream.throwUnexpected();
      }
      const pseudo = stream.match(Tokens.COLON)
        ? stream.mustMatch(Tokens.IDENT, false).value
        : null;
      this._ws();
      this.fire({type: 'startpage', id, pseudo}, start);
      this._readDeclarations({readMargins: true});
      this.fire({type: 'endpage', id, pseudo});
    }

    _margin() {
      const margin = SyntaxUnit.fromToken(this._tokenStream.match(TT.margins));
      if (!margin) return false;
      this.fire({type: 'startpagemargin', margin});
      this._readDeclarations();
      this.fire({type: 'endpagemargin', margin});
      return true;
    }

    _fontFace(start) {
      this.fire('startfontface', start);
      this._ws();
      this._readDeclarations();
      this.fire('endfontface');
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
        const fn = uri ? new PropertyValuePart(uri) : this._function() || stream.LT(1);
        functions.push(fn);
        if (uri) this._ws();
      } while (stream.match(Tokens.COMMA));
      for (const fn of functions) {
        if ((fn.type !== 'function' || !/^(url(-prefix)?|domain|regexp)$/i.test(fn.name)) &&
            fn.type !== 'uri') {
          this.fire({
            type: 'error',
            message: 'Expected url( or url-prefix( or domain( or regexp(, instead saw ' +
              Tokens.name(fn.tokenType || fn.type) + ' ' + (fn.text || fn.value),
          }, fn);
        }
      }
      stream.mustMatch(Tokens.LBRACE);
      this.fire({type: 'startdocument', functions, prefix}, start);
      if (this.options.topDocOnly) {
        stream.readDeclValue({stopOn: '}'});
      } else {
        /* We allow @import and such inside document sections because the final generated CSS for
         * a given page may be valid e.g. if this section is the first one that matched the URL */
        this._sheetGlobals();
        this._ws();
        let action;
        do action = Parser.ACTIONS.document.get(stream.peek());
        while (action ? action.call(this, stream.get(true)) || true : this._ruleset());
      }
      stream.mustMatch(Tokens.RBRACE);
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
      const token = this._tokenStream.match(TT.combinator);
      if (token) {
        this._ws();
        return new Combinator(token);
      }
    }

    _property() {
      const stream = this._tokenStream;
      let token = stream.get(true);
      let value = null;
      let hack = null;
      let start;
      if (this.options.starHack && token.type === Tokens.STAR) {
        hack = '*';
        start = token;
        token = stream.get(true);
      }
      if (token.type === Tokens.IDENT) {
        let tokenValue = token.value;
        // check for underscore hack - no error if not allowed because it's valid CSS syntax
        if (this.options.underscoreHack && tokenValue.startsWith('_')) {
          hack = '_';
          tokenValue = tokenValue.slice(1);
        }
        value = new PropertyName(tokenValue, hack, start || token);
        this._ws();
      } else {
        stream.unget();
      }
      return value;
    }

    _ruleset() {
      const stream = this._tokenStream;
      let braceOpened;
      try {
        stream.skipComment();
        if (parserCache.findBlock()) {
          return true;
        }
        parserCache.startBlock();
        const selectors = this._selectorsGroup();
        if (!selectors) {
          parserCache.cancelBlock();
          return false;
        }
        parserCache.adjustBlockStart(selectors[0]);
        this.fire({type: 'startrule', selectors}, selectors[0]);
        this._readDeclarations({stopAfterBrace: true});
        braceOpened = true;
        this.fire({type: 'endrule', selectors});
        parserCache.endBlock();
        this._ws();
        return true;
      } catch (ex) {
        parserCache.cancelBlock();
        if (!(ex instanceof SyntaxError) || this.options.strict) throw ex;
        this.fire(Object.assign({}, ex, {type: 'error', error: ex}));
        // if there's a right brace, the rule is finished so don't do anything
        // otherwise, rethrow the error because it wasn't handled properly
        if (braceOpened && stream.advance(Tokens.RBRACE) !== Tokens.RBRACE) throw ex;
        // If even a single selector fails to parse, the entire ruleset should be thrown away,
        // so we let the parser continue with the next one
        return true;
      }
    }

    _selectorsGroup() {
      const stream = this._tokenStream;
      const selectors = [];
      let comma;
      for (let sel; (sel = this._selector());) {
        selectors.push(sel);
        this._ws(null, true);
        comma = stream.match(Tokens.COMMA);
        if (!comma) break;
        this._ws(null, true);
      }
      if (comma) stream.throwUnexpected(stream.LT(1));
      return selectors.length ? selectors : null;
    }

    _selector() {
      const stream = this._tokenStream;
      const sel = [];
      let nextSel = null;
      let combinator = null;
      nextSel = this._simpleSelectorSequence();
      if (!nextSel) {
        return null;
      }
      sel.push(nextSel);
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
      return new Selector(sel, sel[0]);
    }

    _simpleSelectorSequence() {
      const stream = this._tokenStream;
      const start = stream.LT(1);
      const modifiers = [];
      const seq = [];
      const ns = this._namespacePrefix(start.type);
      const elementName = this._typeSelector(ns) || this._universal(ns);
      if (elementName) {
        seq.push(elementName);
      } else if (ns) {
        stream.unget();
      }
      while (true) {
        const token = stream.get(true);
        const action = Parser.ACTIONS.simpleSelectorSequence.get(token.type);
        const component = action ? action.call(this, token) : (stream.unget(), 0);
        if (!component) break;
        modifiers.push(component);
        seq.push(component);
      }
      const text = fastJoin(seq);
      return text && new SelectorPart(elementName, modifiers, text, start);
    }

    _typeSelector(ns) {
      const stream = this._tokenStream;
      const nsSupplied = ns !== undefined;
      if (!nsSupplied) ns = this._namespacePrefix();
      const name = stream.match(Tokens.IDENT) &&
        new SelectorSubPart(stream._token.value, 'elementName', stream._token);
      if (!name) {
        if (!nsSupplied && ns && ns.length > 0) stream.unget();
        if (!nsSupplied && ns && ns.length > 1) stream.unget();
        return null;
      }
      if (ns) {
        name.text = ns + name.text;
        name.col -= ns.length;
      }
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
      if (!next) next = stream.LA(1);
      return next === Tokens.PIPE ? '|' :
        (next === Tokens.IDENT || next === Tokens.STAR) && stream.LA(2) === Tokens.PIPE
          ? stream.get().value + stream.get().value
          : null;
    }

    _universal(ns = this._namespacePrefix()) {
      return `${ns || ''}${this._tokenStream.match(Tokens.STAR).value || ''}` || null;
    }

    _attrib(start) {
      const stream = this._tokenStream;
      const value = [
        start.value,
        this._ws(),
        this._namespacePrefix() || '',
        stream.mustMatch(Tokens.IDENT, false).value,
        this._ws(),
      ];
      if (stream.match(TT.attrMatch)) {
        value.push(
          stream._token.value,
          this._ws(),
          stream.mustMatch(TT.identString).value,
          this._ws());
        if (stream.match(Tokens.IDENT, ['i', 's'])) {
          value.push(
            stream._token.value,
            this._ws());
        }
      }
      value.push(stream.mustMatch(Tokens.RBRACKET).value);
      return new SelectorSubPart(fastJoin(value), 'attribute', start);
    }

    _pseudo(start) {
      const stream = this._tokenStream;
      const colons = start.value + (stream.match(Tokens.COLON).value || '');
      const t = stream.mustMatch(TT.pseudo);
      const pseudo = t.type === Tokens.IDENT ? t.value :
        t.value +
        this._ws() +
        (this._expression({list: true}) || '') +
        stream.mustMatch(Tokens.RPAREN).value;
      return new SelectorSubPart(colons + pseudo, 'pseudo', {
        line: t.line,
        col: t.col - colons.length,
        offset: t.offset - colons.length,
      });
    }

    _expression({calc, list} = {}) {
      const chunks = [];
      const stream = this._tokenStream;
      while (stream.get()) {
        const {type, value} = stream._token;
        if (calc && type === Tokens.FUNCTION) {
          if (!rxCalc.test(value)) {
            stream.throwUnexpected();
          }
          chunks.push(value,
            this._expr('calc').text,
            stream.mustMatch(Tokens.RPAREN).value);
        } else if (TT.expression.includes(type) || list && type === Tokens.COMMA) {
          chunks.push(value, this._ws());
        } else if (type !== Tokens.COMMENT) {
          stream.unget();
          break;
        }
      }
      return fastJoin(chunks) || null;
    }

    _is(start) {
      let args;
      const value =
        start.value +
        this._ws() +
        (args = this._selectorsGroup()) +
        this._ws() +
        this._tokenStream.mustMatch(Tokens.RPAREN).value;
      const type = lower(Tokens.name(start.type));
      return Object.assign(new SelectorSubPart(value, type, start), {args});
    }

    _negation(start) {
      const stream = this._tokenStream;
      const value = [start.value, this._ws()];
      const args = this._selectorsGroup();
      if (!args) stream.throwUnexpected(stream.LT(1));
      value.push(...args, this._ws(), stream.mustMatch(Tokens.RPAREN).value);
      return Object.assign(new SelectorSubPart(fastJoin(value), 'not', start), {args});
    }

    _declaration(consumeSemicolon) {
      const stream = this._tokenStream;
      const property = this._property();
      if (!property) {
        return false;
      }
      stream.mustMatch(Tokens.COLON);
      const value = property.text.startsWith('--')
        ? this._customProperty() // whitespace is a part of custom property value
        : (this._ws(), this._expr());
      // if there's no parts for the value, it's an error
      if (!value || value.length === 0) {
        stream.throwUnexpected(stream.LT(1));
      }
      let invalid;
      if (!this.options.skipValidation) {
        try {
          /* If hacks are allowed, then only check the root property.
             Otherwise treat `_property` or `*property` as invalid */
          const name =
            this.options.starHack && property.hack === '*' ||
            this.options.underscoreHack && property.hack === '_'
              ? property.text
              : property.toString();
          validateProperty(name, value);
        } catch (ex) {
          if (!(ex instanceof ValidationError)) {
            ex.message = ex.stack;
          }
          invalid = ex;
        }
      }
      const event = {
        type: 'property',
        important: stream.match(Tokens.IMPORTANT),
        property,
        value,
      };
      this._ws();
      if (invalid) {
        event.invalid = invalid;
        event.message = invalid.message;
      }
      this.fire(event, property);
      if (consumeSemicolon) {
        while (stream.match(TT.semiS)) {/*NOP*/}
      }
      this._ws();
      return true;
    }

    _expr(inFunction, endToken = Tokens.RPAREN) {
      const stream = this._tokenStream;
      const values = [];
      while (true) {
        let value = this._term(inFunction);
        if (!value && !values.length) {
          return null;
        }
        // get everything inside the parens and let validateProperty handle that
        if (!value && inFunction && stream.peek() !== endToken) {
          stream.get();
          value = new PropertyValuePart(stream._token);
        } else if (!value) {
          break;
        }
        // TODO: remove this hack
        const last = values[values.length - 1];
        if (last && last.offset === value.offset && last.text === value.text) {
          break;
        }
        values.push(value);
        this._ws();
        const operator = this._tokenStream.match(inFunction ? TT.opInFunc : TT.op);
        if (operator) {
          this._ws();
          values.push(new PropertyValuePart(operator));
        }
      }
      return values[0] ? new PropertyValue(values, values[0]) : null;
    }

    _customProperty() {
      const value = this._tokenStream.readDeclValue();
      if (value) {
        const token = this._tokenStream._token;
        token.value = value;
        token.type = Tokens.IDENT;
        return new PropertyValue([new PropertyValuePart(token)], token);
      }
    }

    _term(inFunction) {
      const stream = this._tokenStream;
      const unary = stream.match(TT.plusMinus) && stream._token;
      const finalize = (token, value) => {
        if (!token && unary) stream.unget();
        if (!token) return null;
        if (token instanceof SyntaxUnit) return token;
        if (unary) {
          token.line = unary.line;
          token.col = unary.col;
          token.value = unary.value + (value || token.value);
        } else if (value) {
          token.value = value;
        }
        return new PropertyValuePart(token);
      };
      if (this.options.ieFilters && stream.peek() === Tokens.IE_FUNCTION) {
        return finalize(this._ieFunction());
      }
      // see if it's a simple block
      if (stream.match(inFunction ? TT.LParenBracketBrace : TT.LParenBracket)) {
        const token = stream._token;
        const endToken = Tokens.type(token.endChar);
        token.expr = this._expr(inFunction, endToken);
        stream.mustMatch(endToken);
        return finalize(token, token.value + (token.expr || '') + token.endChar);
      }
      return finalize(
        // see if there's a simple match
        stream.match(TT.term) && stream._token ||
        this._hexcolor() ||
        this._function({asText: Boolean(unary)}));
    }

    _function({asText} = {}) {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.FUNCTION)) return null;
      const start = stream._token;
      const name = start.value.slice(0, -1);
      this._ws();
      const expr = this._expr(lower(name));
      const ieFilter = this.options.ieFilters && stream.peek() === Tokens.EQUALS ?
        this._functionIeFilter() : '';
      const text = name + '(' + (expr || '') + ieFilter + ')';
      stream.mustMatch(Tokens.RPAREN);
      this._ws();
      if (asText) {
        return text;
      }
      const m = rxVendorPrefix.exec(name) || [];
      return SyntaxUnit.addFuncInfo(
        new SyntaxUnit(text, start, 'function', {
          expr,
          name: m[2] || name,
          prefix: m[1] || '',
          tokenType: Tokens.FUNCTION,
        }));
    }

    _functionIeFilter() {
      const stream = this._tokenStream;
      const text = [];
      do {
        if (this._ws()) {
          text.push(stream._token.value);
        }
        // might be second time in the loop
        if (stream.LA(0) === Tokens.COMMA) {
          text.push(stream._token.value);
        }
        stream.match(Tokens.IDENT);
        text.push(stream._token.value);
        stream.match(Tokens.EQUALS);
        text.push(stream._token.value);
        let lt = stream.peek();
        while (lt !== Tokens.COMMA &&
               lt !== Tokens.S &&
               lt !== Tokens.RPAREN &&
               lt !== Tokens.EOF) {
          stream.get();
          text.push(stream._token.value);
          lt = stream.peek();
        }
      } while (stream.match([Tokens.COMMA, Tokens.S]));
      return fastJoin(text);
    }

    _ieFunction() {
      const stream = this._tokenStream;
      let functionText = null;
      let lt;
      // IE function can begin like a regular function, too
      if (stream.match([Tokens.IE_FUNCTION, Tokens.FUNCTION])) {
        functionText = stream._token.value;
        do {
          if (this._ws()) {
            functionText += stream._token.value;
          }
          // might be second time in the loop
          if (stream.LA(0) === Tokens.COMMA) {
            functionText += stream._token.value;
          }
          stream.match(Tokens.IDENT);
          functionText += stream._token.value;
          stream.match(Tokens.EQUALS);
          functionText += stream._token.value;
          // functionText += this._term();
          lt = stream.peek();
          while (lt !== Tokens.COMMA && lt !== Tokens.S && lt !== Tokens.RPAREN) {
            stream.get();
            functionText += stream._token.value;
            lt = stream.peek();
          }
        } while (stream.match([Tokens.COMMA, Tokens.S]));
        stream.match(Tokens.RPAREN);
        functionText += ')';
        this._ws();
      }
      return functionText;
    }

    _hexcolor() {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.HASH)) return null;
      const token = stream._token;
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
      const prefix = /^@-([^-]+)-/.test(start.value) ? RegExp.$1 : '';
      this._ws();
      const name = this._keyframeName();
      stream.mustMatch(Tokens.LBRACE);
      this.fire({type: 'startkeyframes', name, prefix}, start);
      // check for key
      while (true) {
        this._ws();
        const tt = stream.peek();
        if (tt !== Tokens.IDENT && tt !== Tokens.PERCENTAGE) break;
        this._keyframeRule();
      }
      stream.mustMatch(Tokens.RBRACE);
      this.fire({type: 'endkeyframes', name, prefix});
      this._ws();
    }

    _keyframeName() {
      const stream = this._tokenStream;
      stream.mustMatch(TT.identString);
      return SyntaxUnit.fromToken(stream._token);
    }

    _keyframeRule() {
      const keys = this._keyList();
      this.fire({type: 'startkeyframerule', keys}, keys[0]);
      this._readDeclarations();
      this.fire({type: 'endkeyframerule', keys});
    }

    _keyList() {
      const stream = this._tokenStream;
      const keyList = [];
      // must be least one key
      keyList.push(this._key());
      this._ws();
      while (stream.match(Tokens.COMMA)) {
        this._ws();
        keyList.push(this._key());
        this._ws();
      }
      return keyList;
    }

    _key() {
      const stream = this._tokenStream;
      if (stream.match(Tokens.PERCENTAGE)) {
        return SyntaxUnit.fromToken(stream._token);
      }
      if (stream.match(Tokens.IDENT)) {
        if (/^(from|to)$/i.test(stream._token.value)) {
          return SyntaxUnit.fromToken(stream._token);
        }
        stream.unget();
      }
      // if it gets here, there wasn't a valid token, so time to explode
      stream.throwUnexpected(stream.LT(1), ['%', "'from'", "'to'"]);
    }

    _skipCruft() {
      while (this._tokenStream.match(TT.cruft)) { /*NOP*/ }
    }

    /**
     * @param {Object} [params]
     * @param {Boolean} [params.checkStart=true] - check for the left brace at the beginning.
     * @param {Boolean} [params.readMargins=false] - check for margin patterns.
     * @param {Boolean} [params.stopAfterBrace=false] - stop after the final } without consuming whitespace
     */
    _readDeclarations({
      checkStart = true,
      readMargins = false,
      stopAfterBrace = false,
    } = {}) {
      const stream = this._tokenStream;
      if (checkStart) stream.mustMatch(Tokens.LBRACE);
      for (let next, tt; (tt = (next = stream.get(true)).type) !== Tokens.RBRACE;) {
        try {
          // Pre-check to avoid calling _ws too much as it's wasteful
          if (tt === Tokens.S ||
              tt === Tokens.COMMENT ||
              tt === Tokens.USO_VAR) {
            this._ws(next, true);
            tt = 0;
          }
          if (tt === Tokens.SEMICOLON ||
              readMargins && this._margin() ||
              (tt && stream.unget(), this._declaration(true)) ||
              (next = stream.LT(1)).type === Tokens.SEMICOLON) {
            continue;
          }
          stream.mustMatch(Tokens.RBRACE);
          if (!stopAfterBrace) this._ws();
          break;
        } catch (ex) {
          this._readDeclarationsRecovery(ex, arguments[0]);
        }
      }
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
      const stream = this._tokenStream;
      const tokens = skipUsoVar ? TT.usoS : Tokens.S;
      let ws = start ? start.value : '';
      for (let t; (t = stream.LT(1, true)) && t.type === Tokens.S;) {
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

    _verifyEnd() {
      const stream = this._tokenStream;
      if (stream.peek() !== Tokens.EOF) {
        stream.throwUnexpected(stream.LT(1));
      }
    }

    parse(input, {reuseCache} = {}) {
      this._tokenStream = new TokenStream(input);
      parserCache.start(reuseCache && this);
      this._stylesheet();
    }

    parseStyleSheet(input) {
      return this.parse(input);
    }

    parseMediaQuery(input, {reuseCache} = {}) {
      this._tokenStream = new TokenStream(input);
      parserCache.start(reuseCache && this);
      const result = this._mediaQuery();
      this._verifyEnd();
      return result;
    }

    /**
     * Parses a property value (everything after the semicolon).
     * @return {PropertyValue} The property value.
     * @throws parserlib.util.SyntaxError If an unexpected token is found.
     */
    parsePropertyValue(input) {
      this._tokenStream = new TokenStream(input);
      this._ws();
      const result = this._expr();
      this._ws();
      this._verifyEnd();
      return result;
    }

    /**
     * Parses a complete CSS rule, including selectors and
     * properties.
     * @param {String} input The text to parser.
     * @return {Boolean} True if the parse completed successfully, false if not.
     */
    parseRule(input, {reuseCache} = {}) {
      this._tokenStream = new TokenStream(input);
      parserCache.start(reuseCache && this);
      this._ws();
      const result = this._ruleset();
      this._ws();
      this._verifyEnd();
      return result;
    }

    /**
     * Parses a single CSS selector (no comma)
     * @param {String} input The text to parse as a CSS selector.
     * @return {Selector} An object representing the selector.
     * @throws parserlib.util.SyntaxError If an unexpected token is found.
     */
    parseSelector(input) {
      this._tokenStream = new TokenStream(input);
      this._ws();
      const result = this._selector();
      this._ws();
      this._verifyEnd();
      return result;
    }

    /**
     * Parses an HTML style attribute: a set of CSS declarations
     * separated by semicolons.
     * @param {String} input The text to parse as a style attribute
     * @return {void}
     */
    parseStyleAttribute(input) {
      // help error recovery in _readDeclarations()
      this._tokenStream = new TokenStream(input + '}');
      this._readDeclarations({checkStart: false});
    }
  }

  Object.assign(Parser, TYPES);
  Object.assign(Parser.prototype, TYPES);
  Parser.prototype._readWhitespace = Parser.prototype._ws;

  const symDocument = [Tokens.DOCUMENT_SYM, Parser.prototype._document];
  const symDocMisplaced = [Tokens.DOCUMENT_SYM, Parser.prototype._documentMisplaced];
  const symFontFace = [Tokens.FONT_FACE_SYM, Parser.prototype._fontFace];
  const symKeyframes = [Tokens.KEYFRAMES_SYM, Parser.prototype._keyframes];
  const symMedia = [Tokens.MEDIA_SYM, Parser.prototype._media];
  const symPage = [Tokens.PAGE_SYM, Parser.prototype._page];
  const symSupports = [Tokens.SUPPORTS_SYM, Parser.prototype._supports];
  const symUnknown = [Tokens.UNKNOWN_SYM, Parser.prototype._unknownSym];
  const symViewport = [Tokens.VIEWPORT_SYM, Parser.prototype._viewport];

  Parser.ACTIONS = {

    stylesheet: new Map([
      symMedia,
      symDocument,
      symSupports,
      symPage,
      symFontFace,
      symKeyframes,
      symViewport,
      symUnknown,
      [Tokens.S, Parser.prototype._ws],
    ]),

    topDoc: new Map([
      symDocument,
      symUnknown,
      [Tokens.S, Parser.prototype._ws],
    ]),

    document: new Map([
      symMedia,
      symDocMisplaced,
      symSupports,
      symPage,
      symFontFace,
      symViewport,
      symKeyframes,
      symUnknown,
    ]),

    supports: new Map([
      symKeyframes,
      symMedia,
      symSupports,
      symDocMisplaced,
      symViewport,
      symUnknown,
    ]),

    media: new Map([
      symKeyframes,
      symMedia,
      symDocMisplaced,
      symSupports,
      symPage,
      symFontFace,
      symViewport,
      symUnknown,
    ]),

    simpleSelectorSequence: new Map([
      [Tokens.HASH, Parser.prototype._hash],
      [Tokens.DOT, Parser.prototype._class],
      [Tokens.LBRACKET, Parser.prototype._attrib],
      [Tokens.COLON, Parser.prototype._pseudo],
      [Tokens.IS, Parser.prototype._is],
      [Tokens.ANY, Parser.prototype._is],
      [Tokens.WHERE, Parser.prototype._is],
      [Tokens.NOT, Parser.prototype._negation],
    ]),
  };

  //#endregion
  //#region Helper functions

  function escapeChar(c) {
    return c === '"' ? '\\' + c : `\\${c.codePointAt(0).toString(16)} `;
  }

  function fastJoin(arr) {
    return !arr.length ? '' :
      arr.length === 1 ? `${arr[0]}` :
        arr.length === 2 ? `${arr[0]}${arr[1]}` :
          arr.join('');
  }

  /**
   * vars can span any number of grammar parts so not gonna try to guess. KISS.
   * @param {PropertyValue} value
   */
  function hasVarParts(value) {
    return value.parts.some(p => p.isVar);
  }

  function isPseudoElement(pseudo) {
    return pseudo.startsWith('::') ||
           /^:(first-(letter|line)|before|after)$/i.test(pseudo);
  }

  function lower(text) {
    if (typeof text !== 'string') text = `${text}`;
    let result = lowercaseCache.get(text);
    if (result) return result;
    result = text.toLowerCase();
    lowercaseCache.set(text, result);
    return result;
  }

  function lowerCmp(a, b) {
    return a.length === b.length && (a === b || lower(a) === lower(b));
  }

  /** @this {String} */
  function lowerCmpThis(a) {
    return a.length === this.length && (a === this || lower(a) === lower(this));
  }

  function parseString(str) {
    return str.slice(1, -1) // strip surrounding quotes
      .replace(/\\(\r\n|[^\r0-9a-f]|[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)/ig, unescapeChar);
  }

  function serializeString(value) {
    return `"${value.replace(/["\r\n\f]/g, escapeChar)}"`;
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

  return {
    css: {
      Colors,
      Combinator,
      Parser,
      Properties,
      PropertyName,
      PropertyValue,
      PropertyValuePart,
      Matcher,
      MediaFeature,
      MediaQuery,
      Selector,
      SelectorPart,
      SelectorSubPart,
      Specificity,
      TokenStream,
      Tokens,
      ValidationError,
    },
    util: {
      EventTarget,
      StringReader,
      SyntaxError,
      SyntaxUnit,
      TokenStreamBase,
      rxVendorPrefix,
      describeProp: vtExplode,
    },
    cache: parserCache,
  };

  //#endregion
})();
