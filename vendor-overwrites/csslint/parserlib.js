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

  //region Types

  const TYPES = {
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

    ar:   'dimension',
  };

  //endregion
  //region Properties

  const Properties = {
    // A
    'align-items':               'normal | stretch | <baseline-position> | [ <overflow-position>? <self-position> ]',
    'align-content':             '<align-content>',
    'align-self':                '<align-self>',
    'all':                       'initial | inherit | unset',
    'alignment-adjust':          'auto | baseline | before-edge | text-before-edge | middle | central | ' +
                                 'after-edge | text-after-edge | ideographic | alphabetic | hanging | ' +
                                 'mathematical | <percentage> | <length>',
    'alignment-baseline':        'auto | baseline | use-script | before-edge | text-before-edge | ' +
                                 'after-edge | text-after-edge | central | middle | ideographic | alphabetic | ' +
                                 'hanging | mathematical',
    'animation':                 '[ <time> || <single-timing-function> || <time> || [ infinite | <number> ] || ' +
                                 '<single-animation-direction> || <single-animation-fill-mode> || ' +
                                 '[ running | paused ] || [ none | <ident> | <string> ] ]#',
    'animation-delay':           '<time>#',
    'animation-direction':       '<single-animation-direction>#',
    'animation-duration':        '<time>#',
    'animation-fill-mode':       '<single-animation-fill-mode>#',
    'animation-iteration-count': '[ <number> | infinite ]#',
    'animation-name':            '[ none | <single-animation-name> ]#',
    'animation-play-state':      '[ running | paused ]#',
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

    'azimuth': '<azimuth>',

    // B
    'backdrop-filter':         '<filter-function-list> | none',
    'backface-visibility':     'visible | hidden',
    'background':              '[ <bg-layer> , ]* <final-bg-layer>',
    'background-attachment':   '<attachment>#',
    'background-blend-mode':   '<blend-mode>',
    'background-clip':         '[ <box> | text ]#',
    'background-color':        '<color>',
    'background-image':        '<bg-image>#',
    'background-origin':       '<box>#',
    'background-position':     '<bg-position>#',
    'background-position-x':   '[ center | [ left | right ]? <length-percentage>? ]#',
    'background-position-y':   '[ center | [ top | bottom ]? <length-percentage>? ]#',
    'background-repeat':       '<repeat-style>#',
    'background-size':         '<bg-size>#',
    'baseline-shift':          'baseline | sub | super | <percentage> | <length>',
    'behavior':                1,
    'binding':                 1,
    'bleed':                   '<length>',
    'block-size':              '<width>',
    'bookmark-label':          '<content-list>',
    'bookmark-level':          'none | <integer>',
    'bookmark-state':          'open | closed',
    'bookmark-target':         'none | <uri>',

    'border-bottom-left-radius':  '<x-one-radius>',
    'border-bottom-right-radius': '<x-one-radius>',
    'border-top-left-radius':     '<x-one-radius>',
    'border-top-right-radius':    '<x-one-radius>',

    'border-boundary':         'none | parent | display',
    'border-collapse':         'collapse | separate',
    'border-image':            '[ none | <image> ] || <border-image-slice> ' +
                               '[ / <border-image-width> | / <border-image-width>? / <border-image-outset> ]? || ' +
                               '<border-image-repeat>',
    'border-image-outset':     '<border-image-outset>',
    'border-image-repeat':     '<border-image-repeat>',
    'border-image-slice':      '<border-image-slice>',
    'border-image-source':     '<image> | none',
    'border-image-width':      '<border-image-width>',
    'border-radius':           '<border-radius>',
    'border-spacing':          '<length>{1,2}',
    'bottom':                  '<width>',
    'box-decoration-break':    'slice | clone',
    'box-shadow':              '<box-shadow>',
    'box-sizing':              'content-box | border-box',
    'break-after':             'auto | always | avoid | left | right | page | column | avoid-page | avoid-column',
    'break-before':            'auto | always | avoid | left | right | page | column | avoid-page | avoid-column',
    'break-inside':            'auto | avoid | avoid-page | avoid-column',

    '-moz-box-align':               'start | end | center | baseline | stretch',
    '-moz-box-decoration-break':    'slice | clone',
    '-moz-box-direction':           'normal | reverse',
    '-moz-box-flex':                '<number>',
    '-moz-box-flex-group':          '<integer>',
    '-moz-box-lines':               'single | multiple',
    '-moz-box-ordinal-group':       '<integer>',
    '-moz-box-orient':              'horizontal | vertical | inline-axis | block-axis',
    '-moz-box-pack':                'start | end | center | justify',
    '-o-box-decoration-break':      'slice | clone',
    '-webkit-box-align':            'start | end | center | baseline | stretch',
    '-webkit-box-decoration-break': 'slice | clone',
    '-webkit-box-direction':        'normal | reverse',
    '-webkit-box-flex':             '<number>',
    '-webkit-box-flex-group':       '<integer>',
    '-webkit-box-lines':            'single | multiple',
    '-webkit-box-ordinal-group':    '<integer>',
    '-webkit-box-orient':           'horizontal | vertical | inline-axis | block-axis',
    '-webkit-box-pack':             'start | end | center | justify',

    // C
    'caret-color':       'auto | <color>',
    'caption-side':      'top | bottom | inline-start | inline-end',
    'clear':             'none | right | left | both | inline-start | inline-end',
    'clip':              'rect() | inset-rect() | auto',
    'clip-path':         '<clip-source> | <clip-path> | none',
    'clip-rule':         'nonzero | evenodd',
    'color':             '<color>',
    'color-interpolation':         'auto | sRGB | linearRGB',
    'color-interpolation-filters': 'auto | sRGB | linearRGB',
    'color-profile':     1,
    'color-rendering':   'auto | optimizeSpeed | optimizeQuality',
    'column-count':      '<integer> | auto',
    'column-fill':       'auto | balance',
    'column-gap':        '<column-gap>',
    'column-rule':       '<border-shorthand>',
    'column-rule-color': '<color>',
    'column-rule-style': '<border-style>',
    'column-rule-width': '<border-width>',
    'column-span':       'none | all',
    'column-width':      '<length> | auto',
    'columns':           1,
    'contain':           'none | strict | content | [ size || layout || style || paint ]',
    'contain-intrinsic-size': 'none | <length>{1,2}',
    'content':           'normal | none | <content-list> [ / <string> ]?',
    'content-visibility': 'visible | auto | hidden',
    'counter-increment': '<counter>',
    'counter-reset':     '<counter>',
    'counter-set':       '<counter>',
    'crop':              'rect() | inset-rect() | auto',
    'cue':               'cue-after | cue-before',
    'cue-after':         1,
    'cue-before':        1,
    'cursor':            '[ <uri> [ <number> <number> ]? , ]* ' +
                         '[ auto | default | none | context-menu | help | pointer | progress | wait | ' +
                         'cell | crosshair | text | vertical-text | alias | copy | move | no-drop | ' +
                         'not-allowed | grab | grabbing | e-resize | n-resize | ne-resize | nw-resize | ' +
                         's-resize | se-resize | sw-resize | w-resize | ew-resize | ns-resize | ' +
                         'nesw-resize | nwse-resize | col-resize | row-resize | all-scroll | ' +
                         'zoom-in | zoom-out ]',

    // D
    'direction': 'ltr | rtl',
    'display': '[ <display-outside> || <display-inside> ] | ' +
               '<display-listitem> | <display-internal> | <display-box> | <display-legacy> | ' +
               // deprecated and nonstandard
               '-webkit-box | -webkit-inline-box | -ms-flexbox',

    'dominant-baseline':          'auto | use-script | no-change | reset-size | ideographic | alphabetic | ' +
                                  'hanging | mathematical | central | middle | text-after-edge | text-before-edge',
    'drop-initial-after-adjust':  'central | middle | after-edge | text-after-edge | ideographic | alphabetic | ' +
                                  'mathematical | <percentage> | <length>',
    'drop-initial-after-align':   'baseline | use-script | before-edge | text-before-edge | after-edge | ' +
                                  'text-after-edge | central | middle | ideographic | alphabetic | hanging | ' +
                                  'mathematical',
    'drop-initial-before-adjust': 'before-edge | text-before-edge | central | middle | hanging | mathematical | ' +
                                  '<percentage> | <length>',
    'drop-initial-before-align':  'caps-height | baseline | use-script | before-edge | text-before-edge | ' +
                                  'after-edge | text-after-edge | central | middle | ideographic | alphabetic | ' +
                                  'hanging | mathematical',
    'drop-initial-size':          'auto | line | <length-percentage>',
    'drop-initial-value':         '<integer>',

    // E
    'elevation':         '<angle> | below | level | above | higher | lower',
    'empty-cells':       'show | hide',
    'enable-background': 1,

    // F
    'fill':           '<paint>',
    'fill-opacity':   '<opacity-value>',
    'fill-rule':      'nonzero | evenodd',
    'filter':         '<filter-function-list> | none',
    'fit':            'fill | hidden | meet | slice',
    'fit-position':   1,
    'flex':           '<flex-shorthand>',
    'flex-basis':     '<width>',
    'flex-direction': 'row | row-reverse | column | column-reverse',
    'flex-flow':      '<flex-direction> || <flex-wrap>',
    'flex-grow':      '<number>',
    'flex-shrink':    '<number>',
    'flex-wrap':      'nowrap | wrap | wrap-reverse',
    'float':          'left | right | none | inline-start | inline-end',
    'float-offset':   1,
    'flood-color':    1,
    'flood-opacity':  '<opacity-value>',
    'font':           '<font-shorthand> | caption | icon | menu | message-box | small-caption | status-bar',
    'font-family':    '<font-family>',
    'font-feature-settings':   '<feature-tag-value># | normal',
    'font-kerning':            'auto | normal | none',
    'font-language-override':  'normal | <string>',
    'font-optical-sizing':     'auto | none',
    'font-palette':            'none | normal | light | dark | <ident>',
    'font-size':               '<font-size>',
    'font-size-adjust':        '<number> | none',
    'font-stretch':            '<font-stretch>',
    'font-style':              '<font-style>',
    'font-synthesis':          'none | [ weight || style ]',
    'font-synthesis-style':    'auto | none',
    'font-synthesis-weight':   'auto | none',
    'font-synthesis-small-caps': 'auto | none',
    'font-variant':            '<font-variant> | normal | none',
    'font-variant-alternates': '<font-variant-alternates> | normal',
    'font-variant-caps':       '<font-variant-caps> | normal',
    'font-variant-east-asian': '<font-variant-east-asian> | normal',
    'font-variant-emoji':      'auto | text | emoji | unicode',
    'font-variant-ligatures':  '<font-variant-ligatures> | normal | none',
    'font-variant-numeric':    '<font-variant-numeric> | normal',
    'font-variant-position':   'normal | sub | super',
    'font-variation-settings': 'normal | [ <string> <number> ]#',
    'font-weight':             '<font-weight>',
    '-ms-flex-align': 'start | end | center | stretch | baseline',
    '-ms-flex-order': '<number>',
    '-ms-flex-pack':  'start | end | center | justify',

    // G
    'gap':                          '<row-gap> <column-gap>?',
    'glyph-orientation-horizontal': '<glyph-angle>',
    'glyph-orientation-vertical':   'auto | <glyph-angle>',

    'grid': '<grid-template> | <grid-template-rows> / [ auto-flow && dense? ] <grid-auto-columns>? | ' +
            '[ auto-flow && dense? ] <grid-auto-rows>? / <grid-template-columns>',
    'grid-area':         '<grid-line> [ / <grid-line> ]{0,3}',
    'grid-auto-columns': '<grid-auto-columns>',
    'grid-auto-flow':    '[ row | column ] || dense',
    'grid-auto-rows':    '<grid-auto-rows>',
    'grid-column':       '<grid-line> [ / <grid-line> ]?',
    'grid-column-start': '<grid-line>',
    'grid-column-end':   '<grid-line>',
    'grid-row':          '<grid-line> [ / <grid-line> ]?',
    'grid-row-start':    '<grid-line>',
    'grid-row-end':      '<grid-line>',
    'grid-template':     'none | [ <grid-template-rows> / <grid-template-columns> ] | ' +
                         '[ <line-names>? <string> <track-size>? <line-names>? ]+ [ / <explicit-track-list> ]?',
    'grid-template-areas':   'none | <string>+',
    'grid-template-columns': '<grid-template-columns>',
    'grid-template-rows':    '<grid-template-rows>',
    'grid-row-gap':          '<row-gap>',
    'grid-column-gap':       '<column-gap>',
    'grid-gap':              '<row-gap> <column-gap>?',

    // H
    'hanging-punctuation': 'none | [ first || [ force-end | allow-end ] || last ]',
    'height':              'auto | <width-height>',
    'hyphenate-after':     '<integer> | auto',
    'hyphenate-before':    '<integer> | auto',
    'hyphenate-character': '<string> | auto',
    'hyphenate-lines':     'no-limit | <integer>',
    'hyphenate-resource':  1,
    'hyphens':             'none | manual | auto',

    // I
    'icon':              1,
    'image-orientation': 'from-image | none | [ <angle> || flip ]',
    'image-rendering':   'auto | smooth | high-quality | crisp-edges | pixelated | optimizeSpeed | optimizeQuality',
    'image-resolution':  1,
    'ime-mode':          'auto | normal | active | inactive | disabled',
    'inline-box-align':  'last | <integer>',
    'inline-size':       '<width>',
    'inset':             '<width>{1,4}',
    'inset-block':       '<width>{1,2}',
    'inset-block-end':   '<width>',
    'inset-block-start': '<width>',
    'inset-inline':       '<width>{1,2}',
    'inset-inline-end':   '<width>',
    'inset-inline-start': '<width>',
    'isolation':         'auto | isolate',

    // J
    'justify-content': '<justify-content>',
    'justify-items':   'normal | stretch | <baseline-position> | [ <overflow-position>? <self-position> ] | ' +
                       '[ legacy || [ left | right | center ] ]',
    'justify-self':    '<justify-self>',

    // K
    'kerning': 'auto | <length>',

    // L
    'left':                   '<width>',
    'letter-spacing':         '<length> | normal',
    'line-height':            '<line-height>',
    'line-break':             'auto | loose | normal | strict | anywhere',
    'line-stacking':          1,
    'line-stacking-ruby':     'exclude-ruby | include-ruby',
    'line-stacking-shift':    'consider-shifts | disregard-shifts',
    'line-stacking-strategy': 'inline-line-height | block-line-height | max-height | grid-height',
    'list-style':             1,
    'list-style-image':       '<uri> | none',
    'list-style-position':    'inside | outside',
    'list-style-type':
      '<string> | disc | circle | square | decimal | decimal-leading-zero | lower-roman | ' +
      'upper-roman | lower-greek | lower-latin | upper-latin | armenian | ' +
      'georgian | lower-alpha | upper-alpha | none',

    // M
    'margin':             '<width>{1,4}',
    'margin-bottom':      '<width>',
    'margin-left':        '<width>',
    'margin-right':       '<width>',
    'margin-top':         '<width>',
    'margin-block':       '<width>{1,2}',
    'margin-block-end':   '<width>',
    'margin-block-start': '<width>',
    'margin-inline':       '<width>{1,2}',
    'margin-inline-end':   '<width>',
    'margin-inline-start': '<width>',
    'mark':               1,
    'mark-after':         1,
    'mark-before':        1,
    'marker':             1,
    'marker-end':         1,
    'marker-mid':         1,
    'marker-start':       1,
    'marks':              1,
    'marquee-direction':  1,
    'marquee-play-count': 1,
    'marquee-speed':      1,
    'marquee-style':      1,
    'mask':               1,
    'mask-image':         '[ none | <image> | <uri> ]#',
    'max-height':         'none | <width-height>',
    'max-width':          'none | <width-height>',
    'min-height':         'auto | <width-height>',
    'min-width':          'auto | <width-height>',
    'max-block-size':     '<length-percentage> | none',
    'max-inline-size':    '<length-percentage> | none',
    'min-block-size':     '<length-percentage>',
    'min-inline-size':    '<length-percentage>',
    'mix-blend-mode':     '<blend-mode>',
    'move-to':            1,

    // N
    'nav-down':  1,
    'nav-index': 1,
    'nav-left':  1,
    'nav-right': 1,
    'nav-up':    1,

    // O
    'object-fit':      'fill | contain | cover | none | scale-down',
    'object-position': '<position>',
    'opacity':         '<opacity-value> | <percentage>',
    'order':           '<integer>',
    'orphans':         '<integer>',
    'outline':         '[ <color> | invert ] || [ auto | <border-style> ] || <border-width>',
    'outline-color':   '<color> | invert',
    'outline-offset':  '<length>',
    'outline-style':   '<border-style> | auto',
    'outline-width':   '<border-width>',
    'overflow':        '<overflow>{1,2}',
    'overflow-anchor': 'auto | none',
    'overflow-block':  '<overflow>',
    'overflow-inline': '<overflow>',
    'overflow-style':  1,
    'overflow-wrap':   'normal | break-word | anywhere',
    'overflow-x':      '<overflow>',
    'overflow-y':      '<overflow>',
    'overscroll-behavior': '<overscroll>{1,2}',
    'overscroll-behavior-block': '<overscroll>',
    'overscroll-behavior-inline': '<overscroll>',
    'overscroll-behavior-x': '<overscroll>',
    'overscroll-behavior-y': '<overscroll>',

    // P
    'padding':            '<padding-width>{1,4}',
    'padding-block':       '<padding-width>{1,2}',
    'padding-block-end':   '<padding-width>',
    'padding-block-start': '<padding-width>',
    'padding-bottom':     '<padding-width>',
    'padding-inline':       '<padding-width>{1,2}',
    'padding-inline-end':   '<padding-width>',
    'padding-inline-start': '<padding-width>',
    'padding-left':       '<padding-width>',
    'padding-right':      '<padding-width>',
    'padding-top':        '<padding-width>',
    'page':               1,
    'page-break-after':   'auto | always | avoid | left | right | recto | verso',
    'page-break-before':  'auto | always | avoid | left | right | recto | verso',
    'page-break-inside':  'auto | avoid',
    'page-policy':        1,
    'pause':              1,
    'pause-after':        1,
    'pause-before':       1,
    'perspective':        'none | <length>',
    'perspective-origin': '<position>',
    'phonemes':           1,
    'pitch':              1,
    'pitch-range':        1,
    'place-content':      '<align-content> <justify-content>?',
    'place-items':        '[ normal | stretch | <baseline-position> | <self-position> ] [ normal | stretch | ' +
                          '<baseline-position> | <self-position> ]?',
    'place-self':         '<align-self> <justify-self>?',
    'play-during':        1,
    'pointer-events':     'auto | none | visiblePainted | visibleFill | visibleStroke | visible | ' +
                          'painted | fill | stroke | all',
    'position':           'static | relative | absolute | fixed | sticky | -webkit-sticky',
    'presentation-level': 1,
    'punctuation-trim':   1,

    // Q
    'quotes': 1,

    // R
    'rendering-intent': 1,
    'resize':           'none | both | horizontal | vertical | block | inline',
    'rest':             1,
    'rest-after':       1,
    'rest-before':      1,
    'richness':         1,
    'right':            '<width>',
    'rotate':           'none | [ x | y | z | <number>{3} ]? && <angle>',
    'rotation':         1,
    'rotation-point':   1,
    'row-gap':          '<row-gap>',
    'ruby-align':       1,
    'ruby-overhang':    1,
    'ruby-position':    1,
    'ruby-span':        1,

    // S
    'scale':             'none | <number>{1,3}',

    'scroll-behavior':             'auto | smooth',
    'scroll-margin':               '<length>{1,4}',
    'scroll-margin-bottom':        '<length>',
    'scroll-margin-left':          '<length>',
    'scroll-margin-right':         '<length>',
    'scroll-margin-top':           '<length>',
    'scroll-margin-block':         '<length>{1,2}',
    'scroll-margin-block-end':     '<length>',
    'scroll-margin-block-start':   '<length>',
    'scroll-margin-inline':        '<length>{1,2}',
    'scroll-margin-inline-end':    '<length>',
    'scroll-margin-inline-start':  '<length>',
    'scroll-padding':              '<auto-length-pct>{1,4}',
    'scroll-padding-left':         '<auto-length-pct>',
    'scroll-padding-right':        '<auto-length-pct>',
    'scroll-padding-top':          '<auto-length-pct>',
    'scroll-padding-bottom':       '<auto-length-pct>',
    'scroll-padding-block':        '<auto-length-pct>{1,2}',
    'scroll-padding-block-end':    '<auto-length-pct>',
    'scroll-padding-block-start':  '<auto-length-pct>',
    'scroll-padding-inline':       '<auto-length-pct>{1,2}',
    'scroll-padding-inline-end':   '<auto-length-pct>',
    'scroll-padding-inline-start': '<auto-length-pct>',
    'scroll-snap-align':           '[ none | start | end | center ]{1,2}',
    'scroll-snap-stop':            'normal | always',
    'scroll-snap-type':            'none | [ x | y | block | inline | both ] [ mandatory | proximity ]?',

    'scrollbar-color':   'auto | dark | light | <color>{2}',
    'scrollbar-width':   'auto | thin | none',
    'shape-inside':      'auto | outside-shape | [ <basic-shape> || shape-box ] | <image> | display',
    'shape-rendering':   'auto | optimizeSpeed | crispEdges | geometricPrecision',
    'size':              1,
    'speak':             'normal | none | spell-out',
    'speak-header':      'once | always',
    'speak-numeral':     'digits | continuous',
    'speak-punctuation': 'code | none',
    'speech-rate':       1,
    'src':               1,
    'stop-color':        1,
    'stop-opacity':      '<opacity-value>',
    'stress':            1,
    'string-set':        1,
    'stroke':            '<paint>',
    'stroke-dasharray':  'none | <dasharray>',
    'stroke-dashoffset': '<percentage> | <length>',
    'stroke-linecap':    'butt | round | square',
    'stroke-linejoin':   'miter | round | bevel',
    'stroke-miterlimit': '<miterlimit>',
    'stroke-opacity':    '<opacity-value>',
    'stroke-width':      '<percentage> | <length>',

    // T
    'table-layout':    'auto | fixed',
    'tab-size':        '<number> | <length>',
    'target':          1,
    'target-name':     1,
    'target-new':      1,
    'target-position': 1,
    'text-align':      '<text-align> | justify-all',
    'text-align-all':  '<text-align>',
    'text-align-last': '<text-align> | auto',
    'text-anchor':     'start | middle | end',
    'text-decoration':       '<text-decoration-line> || <text-decoration-style> || <color>',
    'text-decoration-color': '<color>',
    'text-decoration-line':  '<text-decoration-line>',
    'text-decoration-skip':  'none | [ objects || [ spaces | [ leading-spaces || trailing-spaces ] ] || ' +
                             'edges || box-decoration ]',
    'text-decoration-style': '<text-decoration-style>',
    'text-emphasis':         '<text-emphasis-style> || <color>',
    'text-emphasis-style':   '<text-emphasis-style>',
    'text-emphasis-position': '[ over | under ] && [ right | left ]?',
    'text-height':      1,
    'text-indent':      '<length-percentage> && hanging? && each-line?',
    'text-justify':     'auto | none | inter-word | inter-character',
    'text-outline':     1,
    'text-overflow':    'clip | ellipsis',
    'text-rendering':   'auto | optimizeSpeed | optimizeLegibility | geometricPrecision',
    'text-shadow':      'none | [ <color>? && <length>{2,3} ]#',
    'text-transform':   'none | [ capitalize | uppercase | lowercase ] || full-width || full-size-kana',
    'text-underline-position': 'auto | [ under || [ left | right ] ]',
    'text-wrap':        'normal | none | avoid',
    'top':              '<width>',
    'touch-action':     'auto | none | pan-x | pan-y | pan-left | pan-right | pan-up | pan-down | manipulation',
    'transform':        'none | <transform-function>+',
    'transform-box':    'border-box | fill-box | view-box',
    'transform-origin': '<transform-origin>',
    'transform-style':  'auto | flat | preserve-3d',
    'transition':       '<transition>#',
    'transition-delay': '<time>#',
    'transition-duration': '<time>#',
    'transition-property': 'none | [ all | <ident> ]#',
    'transition-timing-function': '<single-timing-function>#',
    'translate':        'none | <length-percentage> [ <length-percentage> <length>? ]?',

    // U
    'unicode-range': '<unicode-range>#',
    'unicode-bidi':  'normal | embed | isolate | bidi-override | isolate-override | plaintext',
    'user-modify':   'read-only | read-write | write-only',
    'user-select':   'auto | text | none | contain | all',

    // V
    'vertical-align':    'auto | use-script | baseline | sub | super | top | text-top | central | middle | ' +
                         'bottom | text-bottom | <percentage> | <length>',
    'visibility':        'visible | hidden | collapse',
    'voice-balance':     1,
    'voice-duration':    1,
    'voice-family':      1,
    'voice-pitch':       1,
    'voice-pitch-range': 1,
    'voice-rate':        1,
    'voice-stress':      1,
    'voice-volume':      1,
    'volume':            1,

    // W
    'white-space':          'normal | pre | nowrap | pre-wrap | break-spaces | pre-line',
    'white-space-collapse': 1,
    'widows':               '<integer>',
    'width':                'auto | <width-height>',
    'will-change':          '<will-change>',
    'word-break':           'normal | keep-all | break-all | break-word',
    'word-spacing':         '<length> | normal',
    'word-wrap':            'normal | break-word | anywhere',
    'writing-mode':         'horizontal-tb | vertical-rl | vertical-lr | lr-tb | rl-tb | tb-rl | ' +
                            'bt-rl | tb-lr | bt-lr | lr-bt | rl-bt | lr | rl | tb',

    // Z
    'z-index': '<integer> | auto',
    'zoom':    '<number> | <percentage> | normal',

    // nonstandard https://compat.spec.whatwg.org/
    '-webkit-box-reflect':       '[ above | below | right | left ]? <length>? <image>?',
    '-webkit-text-fill-color':   '<color>',
    '-webkit-text-stroke':       '<border-width> || <color>',
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

  //endregion
  //region ValidationTypes - definitions

  const RX_VENDOR_PREFIX = /^-(webkit|moz|ms|o)-(.+)/i;
  const RX_CALC = /^(-(ms|moz|o|webkit)-)?(calc|min|max|clamp)\(/i;

  const ValidationTypes = {
    simple: {
      '<absolute-size>': 'xx-small | x-small | small | medium | large | x-large | xx-large',

      '<animateable-feature>': 'scroll-position | contents | <animateable-feature-name>',
      '<animateable-feature-name>'(part) {
        return this['<ident>'](part) &&
               !/^(unset|initial|inherit|will-change|auto|scroll-position|contents)$/i.test(part);
      },

      '<angle>': part => part.type === 'angle',
      '<angle-or-0>': p => p.type === 'angle' || p.text === '0',

      '<aspect-ratio>': part => part.units && lowerCmp(part.units, 'ar'),

      '<attr>': p => p.type === 'function' && lowerCmp(p.name, 'attr'),
      '<attr-fallback>': part => !/\battr\(/i.test(part.text),

      '<attachment>': 'scroll | fixed | local',

      '<auto-length-pct>': 'auto | <length> | <percentage>',

      '<basic-shape>': 'inset() | circle() | ellipse() | polygon()',

      '<bg-image>': '<image> | none',

      '<blend-mode>': 'normal | multiply | screen | overlay | darken | lighten | color-dodge | ' +
                      'color-burn | hard-light | soft-light | difference | exclusion | hue | ' +
                      'saturation | color | luminosity',

      '<border-style>': 'none | hidden | dotted | dashed | solid | double | groove | ridge | inset | outset',

      '<border-width>': '<length> | thin | medium | thick',

      '<box>': 'padding-box | border-box | content-box',

      '<clip-source>': '<uri>',

      '<column-gap>': 'normal | <length-percentage>',

      '<content-distribution>': 'space-between | space-around | space-evenly | stretch',
      '<content-position>': 'center | start | end | flex-start | flex-end',

      '<width-height>': '<length-percentage> | min-content | max-content | fit-content() | ' +
                        '-moz-available | -webkit-fill-available',

      '<cubic-bezier-timing-function>': 'ease | ease-in | ease-out | ease-in-out | cubic-bezier()',

      '<display-box>':      'contents | none',
      '<display-inside>':   'flow | flow-root | table | flex | grid | ruby',
      '<display-internal>': 'table-row-group | table-header-group | table-footer-group | table-row | ' +
                            'table-cell | table-column-group | table-column | table-caption | ' +
                            'ruby-base | ruby-text | ruby-base-container | ruby-text-container',
      '<display-legacy>':   'inline-block | inline-table | inline-flex | inline-grid',
      '<display-outside>':  'block | inline | run-in',

      '<feature-tag-value>': part => part.type === 'function' && /^[A-Z0-9]{4}$/i.test(part),

      // custom() isn't actually in the spec
      '<filter-function>': 'blur() | brightness() | contrast() | custom() | drop-shadow() | grayscale() | ' +
                           'hue-rotate() | invert() | opacity() | saturate() | sepia()',

      '<fixed-breadth>': '<length-percentage>',

      '<flex>': part =>
        part.type === 'function' ||
        part.type === 'grid' && part.value >= 0,

      '<flex-basis>': '<width>',
      '<flex-direction>': 'row | row-reverse | column | column-reverse',
      '<flex-grow>': '<number>',
      '<flex-shrink>': '<number>',
      '<flex-wrap>': 'nowrap | wrap | wrap-reverse',

      '<font-size>': '<absolute-size> | <relative-size> | <length-percentage>',
      '<font-stretch>': 'normal | <percentage> | ultra-condensed | extra-condensed | condensed | semi-condensed | ' +
                        'semi-expanded | expanded | extra-expanded | ultra-expanded',
      '<font-style>': 'normal | italic | oblique <angle>?',
      '<font-variant-caps>': 'small-caps | all-small-caps | petite-caps | all-petite-caps | ' +
                             'unicase | titling-caps',
      '<font-variant-css21>': 'normal | small-caps',
      '<font-weight>': 'normal | bold | bolder | lighter | <number>',

      '<generic-family>': 'serif | sans-serif | cursive | fantasy | monospace | system-ui | emoji | ' +
                          'math | fangsong | ui-serif | ui-sans-serif | ui-monospace | ui-rounded',

      '<geometry-box>': '<shape-box> | fill-box | stroke-box | view-box',

      '<glyph-angle>': part => part.type === 'angle' && part.units === 'deg',

      '<gradient>': part =>
        part.type === 'function' &&
        /^(?:-(?:ms|moz|o|webkit)-)?(?:repeating-)?(?:radial-|linear-|conic-)?gradient/i.test(part),

      //eslint-disable-next-line no-use-before-define
      '<hex-color>': part => part.tokenType === Tokens.HASH,

      '<icccolor>': 'cielab() | cielch() | cielchab() | icc-color() | icc-named-color()',

      // any identifier
      '<ident>': part => part.type === 'identifier' || part.wasIdent,
      '<ident-for-grid>': part =>
        (part.type === 'identifier' || part.wasIdent) &&
        !/^(span|auto|initial|inherit|unset|default)$/i.test(part.value),
      '<ident-not-generic-family>'(part) {
        return this['<ident>'](part) && !this['<generic-family>'](part);
      },
      '<ident-not-none>'(part) {
        return this['<ident>'](part) && !lowerCmp(part.value, 'none');
      },

      '<image>': '<uri> | <gradient> | cross-fade()',

      '<inflexible-breadth>': '<length-percentage> | min-content | max-content | auto',

      '<integer>': part => part.type === 'integer',

      '<length>': ({text, type}) =>
        type === 'function' && RX_CALC.test(text) ||
        type === 'length' ||
        type === 'number' ||
        type === 'integer' ||
        text === '0',

      '<length-percentage>': '<length> | <percentage>',

      '<line>': part => part.type === 'integer',

      '<line-height>': '<number> | <length-percentage> | normal',

      '<line-names>'(part) {
        // eslint-disable-next-line no-use-before-define
        return part.tokenType === Tokens.LBRACKET &&
          part.text.endsWith(']') && (
            !part.expr ||
            !part.expr.parts.length ||
            part.expr.parts.every(this['<ident-for-grid>'], this)
          );
      },

      '<miterlimit>'(part) {
        return this['<number>'](part) && part.value >= 1;
      },

      '<nonnegative-length-or-percentage>'(part) {
        return `${part}` === '0' ||
               (part.type === 'function' || part.value >= 0) &&
               (this['<length>'](part) || this['<percentage>'](part));
      },
      '<nonnegative-number-or-percentage>'(part) {
        return `${part}` === '0' ||
               (part.type === 'function' || part.value >= 0) &&
               (this['<number>'](part) || this['<percentage>'](part));
      },

      '<number-percentage>': '<number> | <percentage>',

      '<positive-integer>'(part) {
        return this['<number>'](part) && (part.type === 'function' || part.value > 0);
      },

      //eslint-disable-next-line no-use-before-define
      '<named-color>': part => part.text in Colors || lower(part.text) in Colors,

      '<number>'(part) {
        return part.type === 'number' || this['<integer>'](part);
      },

      '<opacity-value>'(part) {
        return this['<number>'](part) && part.value >= 0 && part.value <= 1;
      },

      '<overflow>': 'visible | hidden | clip | scroll | auto',

      '<overflow-position>': 'unsafe | safe',

      '<padding-width>': '<nonnegative-length-or-percentage>',

      '<percentage>': part => part.type === 'percentage' || `${part}` === '0',

      '<relative-size>': 'smaller | larger',

      '<row-gap>': '<column-gap>',

      '<self-position>': 'center | start | end | self-start | self-end | flex-start | flex-end',

      '<shape-box>': '<box> | margin-box',

      '<single-animation-direction>': 'normal | reverse | alternate | alternate-reverse',
      '<single-animation-fill-mode>': 'none | forwards | backwards | both',
      '<single-animation-name>'(part) {
        return this['<ident>'](part) &&
               /^-?[a-z_][-a-z0-9_]+$/i.test(part) &&
               !/^(none|unset|initial|inherit)$/i.test(part);
      },

      '<step-timing-function>': 'step-start | step-end | steps()',

      '<string>': part => part.type === 'string',

      '<text-align>': 'start | end | left | right | center | justify | match-parent',

      '<text-decoration-style>': 'solid | double | dotted | dashed | wavy',

      '<time>': part => part.type === 'time',

      '<track-breadth>': '<length-percentage> | <flex> | min-content | max-content | auto',

      '<transform-function>': 'matrix() | translate() | translateX() | translateY() | ' +
                              'scale() | scaleX() | scaleY() | ' +
                              'rotate() | skew() | skewX() | skewY() | ' +
                              'matrix3d() | translate3d() | translateZ() | scale3d() | scaleZ() | rotate3d()',

      '<unicode-range>': part => /^U\+[0-9a-f?]{1,6}(-[0-9a-f?]{1,6})?\s*$/i.test(part),

      '<unit>': part => part.text === '%' || part in UNITS || lower(part) in UNITS,

      '<uri>': part => part.type === 'uri',

      '<var>': part => {
        //eslint-disable-next-line no-use-before-define
        if (part.tokenType === Tokens.USO_VAR) return true;
        if (part.type !== 'function' || !part.expr) return false;
        const sp = part.expr.parts;
        return sp.length && (
          (sp.length === 1 || sp[1].text === ',') &&
          (sp[0].type === 'custom-property' && /^var$/i.test(part.name) ||
           sp[0].type === 'identifier' && /^env$/i.test(part.name))
        );
      },

      '<width>': '<length-percentage> | auto',
    },

    complex: {
      '<align-content>': 'normal | <baseline-position> | <content-distribution> | ' +
                         '<aspect-ratio> <content-distribution>? | ' +
                         '<overflow-position>? <content-position>',

      '<align-self>': 'auto | normal | stretch | <baseline-position> | <overflow-position>? <self-position>',

      '<auto-repeat>': 'repeat( [ auto-fill | auto-fit ] , [ <line-names>? <fixed-size> ]+ <line-names>? )',

      '<auto-track-list>': '[ <line-names>? [ <fixed-size> | <fixed-repeat> ] ]* <line-names>? <auto-repeat> ' +
                           '[ <line-names>? [ <fixed-size> | <fixed-repeat> ] ]* <line-names>?',

      '<azimuth>': '<angle> | [ [ left-side | far-left | left | center-left | center | center-right | ' +
                   'right | far-right | right-side ] || behind ] | leftwards | rightwards',

      '<baseline-position>': '[ first | last ]? baseline',

      '<bg-layer>':
        '<bg-image> || <bg-position> [ / <bg-size> ]? || <repeat-style> || <attachment> || <box>{1,2}',

      '<bg-position>':
        '[ center | [ left | right ] <length-percentage>? ] && [ center | [ top | bottom ] <length-percentage>? ] | ' +
        '[ left | center | right | <length-percentage> ] [ top | center | bottom | <length-percentage> ] | ' +
        '[ left | center | right | top | bottom | <length-percentage> ]',

      '<bg-size>': '[ <length-percentage> | auto ]{1,2} | cover | contain',

      '<border-image-outset>': '[ <length> | <number> ]{1,4}',
      '<border-image-repeat>': '[ stretch | repeat | round | space ]{1,2}',
      '<border-image-slice>': Matcher =>
        // [<number> | <percentage>]{1,4} && fill?
        // but 'fill' can appear between any of the numbers
        Matcher.many(
          [true],
          Matcher.cast('<nonnegative-number-or-percentage>'),
          Matcher.cast('<nonnegative-number-or-percentage>'),
          Matcher.cast('<nonnegative-number-or-percentage>'),
          Matcher.cast('<nonnegative-number-or-percentage>'),
          'fill'),
      '<border-image-width>': '[ <length-percentage> | <number> | auto ]{1,4}',
      '<border-radius>': '<nonnegative-length-or-percentage>{1,4} [ / <nonnegative-length-or-percentage>{1,4} ]?',
      '<border-shorthand>': '<border-width> || <border-style> || <color>',

      '<box-shadow>': 'none | <shadow>#',

      '<clip-path>': '<basic-shape> || <geometry-box>',

      '<color>': 'rgb() | rgba() | hsl() | hsla() | hwb() | gray() | device-cmyk() | color() | ' +
                 '<hex-color> | <named-color>',

      '<color-adjuster>': 'red() | green() | blue() | alpha() | a() | rgb() | hue() | ' +
                          'saturation() | lightness() | whiteness() | blackness() | ' +
                          'tint() | shade() | blend() | blenda() | contrast()',

      '<content-list>': '[ <string> | <image> | attr() | content() | counter() | counters() | leader() | ' +
                        '[ open-quote | close-quote | no-open-quote | no-close-quote ] | ' +
                        '[ target-counter() | target-counters() | target-text() ] ]+',

      '<counter>': '[ <ident-not-none> <integer>? ]+ | none',

      // "list of comma and/or white space separated <length>s and
      // <percentage>s".  There is a non-negative constraint.
      '<dasharray>': Matcher =>
         Matcher.cast('<nonnegative-length-or-percentage>')
           .braces(1, Infinity, '#', Matcher.cast(',').question()),

      '<display-listitem>': '<display-outside>? && [ flow | flow-root ]? && list-item',

      '<explicit-track-list>'  : '[ <line-names>? <track-size> ]+ <line-names>?',

      '<family-name>': '<string> | <ident-not-generic-family> <ident>*',

      '<filter-function-list>': '[ <filter-function> | <uri> ]+',

      '<final-bg-layer>':
        '<color> || <bg-image> || <bg-position> [ / <bg-size> ]? || <repeat-style> || <attachment> || <box>{1,2}',

      '<fixed-repeat>': 'repeat( [ <positive-integer> ] , [ <line-names>? <fixed-size> ]+ <line-names>? )',

      '<fixed-size>': '<fixed-breadth> | ' +
                      'minmax( <fixed-breadth> , <track-breadth> ) | ' +
                      'minmax( <inflexible-breadth> , <fixed-breadth> )',

      '<flex-shorthand>': 'none | [ <flex-grow> <flex-shrink>? || <flex-basis> ]',

      '<font-family>': '[ <generic-family> | <family-name> ]#',

      '<font-shorthand>': '[ <font-style> || <font-variant-css21> || <font-weight> || <font-stretch> ]? ' +
                          '<font-size> [ / <line-height> ]? <font-family>',

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

      '<justify-content>': 'normal | <content-distribution> | <aspect-ratio> <content-distribution>? | ' +
                           '<overflow-position>? [ <content-position> | left | right ]',

      '<justify-self>': 'auto | normal | stretch | <baseline-position> | <overflow-position>? ' +
                        '[ <self-position> | left | right ]',

      '<paint>': 'none | child | child() | <color> | ' +
                 '<uri> [ none | currentColor | <color> ]? | ' +
                 'context-fill | context-stroke',

      // Because our `alt` combinator is ordered, we need to test these
      // in order from longest possible match to shortest.
      '<position>': '[ [ left | right ] <length-percentage> ] && [ [ top | bottom ] <length-percentage> ] | ' +
                    '[ left | center | right | <length-percentage> ] ' +
                    '[ top | center | bottom | <length-percentage> ]? | ' +
                    '[ left | center | right ] || [ top | center | bottom ]',

      '<repeat-style>': 'repeat-x | repeat-y | [ repeat | space | round | no-repeat ]{1,2}',

      '<rgb-color>': '<number>{3} [ / <nonnegative-number-or-percentage> ]? | ' +
                     '<percentage>{3} [ / <nonnegative-number-or-percentage> ]? | ' +
                     '<number>#{3} [ , <nonnegative-number-or-percentage> ]? | ' +
                     '<percentage>#{3} [ , <nonnegative-number-or-percentage> ]?',

      '<hsl-color>': '[ <number> | <angle> ] <percentage>{2} [ / <nonnegative-number-or-percentage> ]? | ' +
                     '[ <number> | <angle> ] , <percentage>#{2} [ , <nonnegative-number-or-percentage> ]?',

      '<overscroll>': 'contain | none | auto',

      '<shadow>': 'inset? && [ <length>{2,4} && <color>? ]',

      '<single-timing-function>': 'linear | <cubic-bezier-timing-function> | <step-timing-function> | frames()',

      '<text-decoration-line>': 'none | [ underline || overline || line-through || blink ]',

      '<text-emphasis-style>': 'none | ' +
                               '[ [ filled | open ] || [ dot | circle | double-circle | triangle | sesame ] ] | ' +
                               '<string>',

      '<track-list>': '[ <line-names>? [ <track-size> | <track-repeat> ] ]+ <line-names>?',

      '<track-repeat>': 'repeat( [ <positive-integer> ] , [ <line-names>? <track-size> ]+ <line-names>? )',

      '<track-size>': '<track-breadth> | minmax( <inflexible-breadth> , <track-breadth> ) | ' +
                      'fit-content( <length-percentage> )',

      '<transform-origin>': '[ left | center | right | <length-percentage> ] ' +
                            '[ top | center | bottom | <length-percentage> ] <length>? | ' +
                            '[ left | center | right | top | bottom | <length-percentage> ] | ' +
                            '[ [ center | left | right ] && [ center | top | bottom ] ] <length>?',

      '<transition>': '[ none | [ all | <ident> ]# ] || <time> || <single-timing-function> || <time>',

      '<will-change>': 'auto | <animateable-feature>#',

      '<x-one-radius>': '<length-percentage>{1,2}',
    },

    functions: {
      'attr': '<ident> [ string | color | url | integer | number | length | angle | time | frequency | <unit> ]? ' +
              '[ , <attr-fallback> ]?',

      'fit-content': '<length-percentage>',

      'rgb':  '<rgb-color>',
      'rgba': '<rgb-color>',
      'hsl':  '<hsl-color>',
      'hsla': '<hsl-color>',
      'hwb':  '<hsl-color>',
      'gray': '<number> [ / <nonnegative-number-or-percentage> ]?',
      'device-cmyk': '<number-percentage>{4} [ / <nonnegative-number-or-percentage> ]? , <color>?',

      'color':        '[ <color> | [ <number> | <angle> ] ] <color-adjuster>*',
      'content':      'text | before | after | first-letter | marker',
      'cubic-bezier': '<number>#{4}',
      'frames':       '<integer>',
      'steps':        '<integer> [ , [ start | end ] ]?',

      // used in SVG2 <paint>
      'child': '<integer>',

      'blur':        '<length>',
      'brightness':  '<number-percentage>',
      'contrast':    '<number-percentage>',
      'drop-shadow': '<length>{2,3} && <color>?',
      'grayscale':   '<number-percentage>',
      'hue-rotate':  '<angle-or-0>',
      'invert':      '<number-percentage>',
      'opacity':     '<number-percentage>',
      'saturate':    '<number-percentage>',
      'sepia':       '<number-percentage>',

      'inset':   '<length-percentage>{1,4} [ round <border-radius> ]?',
      'circle':  '[ <length-percentage> | closest-side | farthest-side ]? [ at <position> ]?',
      'ellipse': '[ [ <length-percentage> | closest-side | farthest-side ]{2} ]? [ at <position> ]?',
      'polygon': '[ [ nonzero | evenodd | inherit ] , ]? [ <length-percentage> <length-percentage> ]#',
      'rect':    '[ <length> | auto ]#{4}',

      'matrix':     '<number>#{6}',
      'translate':  '<length-percentage> [ , <length-percentage> ]?',
      'translateX': '<length-percentage>',
      'translateY': '<length-percentage>',
      'scale':      '<number> [ , <number> ]?',
      'scaleX':     '<number>',
      'scaleY':     '<number>',
      'rotate':     '<angle-or-0>',
      'skew':       '<angle-or-0> [ , <angle-or-0> ]?',
      'skewX':      '<angle-or-0>',
      'skewY':      '<angle-or-0>',

      'matrix3d':    '<number>#{16}',
      'translate3d': '<length-percentage>#{2} , <length>',
      'translateZ':  '<length>',
      'scale3d':     '<number>#{3}',
      'scaleZ':      '<number>',
      'rotate3d':    '<number>#{3} , <angle-or-0>',
    },

    functionsMayBeEmpty: new Set([
      // https://drafts.fxtf.org/filter-effects/#supported-filter-functions
      // omitted values default to the initial value for interpolation
      'blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale',
      'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia',
      'content',
    ]),
  };

  //endregion
  //region Colors

  const Colors = {
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
    // 'currentColor' color keyword
    // https://www.w3.org/TR/css3-color/#currentcolor
    currentcolor:         '',
    transparent:          '#0000',

    // CSS2 system colors
    // https://www.w3.org/TR/css3-color/#css2-system
    activeborder: '',
    activecaption: '',
    appworkspace: '',
    background: '',
    buttonface: '',
    buttonhighlight: '',
    buttonshadow: '',
    buttontext: '',
    captiontext: '',
    graytext: '',
    greytext: '',
    highlight: '',
    highlighttext: '',
    inactiveborder: '',
    inactivecaption: '',
    inactivecaptiontext: '',
    infobackground: '',
    infotext: '',
    menu: '',
    menutext: '',
    scrollbar: '',
    threeddarkshadow: '',
    threedface: '',
    threedhighlight: '',
    threedlightshadow: '',
    threedshadow: '',
    window: '',
    windowframe: '',
    windowtext: '',

    // CSS4 system colors, only additions to the above
    // https://drafts.csswg.org/css-color-4/#css-system-colors
    activetext: '',
    buttonborder: '',
    canvas: '',
    canvastext: '',
    field: '',
    fieldtext: '',
    linktext: '',
    mark: '',
    marktext: '',
    visitedtext: '',
  };

  //endregion
  //region Tokens

  /*
   * The following token names are defined in CSS3 Grammar:
   * https://www.w3.org/TR/css3-syntax/#lexical
   */
  const Tokens = Object.assign([], {
    EOF: {}, // must be the first token
  }, {
    // HTML-style comments
    CDO: {},
    CDC: {},

    // ignorables
    S: {whitespace: true},
    COMMENT: {whitespace: true, comment: true, hide: true},

    // attribute equality
    INCLUDES: {text: '~='},
    DASHMATCH: {text: '|='},
    PREFIXMATCH: {text: '^='},
    SUFFIXMATCH: {text: '$='},
    SUBSTRINGMATCH: {text: '*='},

    // identifier types
    STRING: {},
    IDENT: {},
    HASH: {},

    // at-keywords
    IMPORT_SYM: {text: '@import'},
    PAGE_SYM: {text: '@page'},
    MEDIA_SYM: {text: '@media'},
    FONT_FACE_SYM: {text: '@font-face'},
    CHARSET_SYM: {text: '@charset'},
    NAMESPACE_SYM: {text: '@namespace'},
    SUPPORTS_SYM: {text: '@supports'},
    VIEWPORT_SYM: {text: ['@viewport', '@-ms-viewport', '@-o-viewport']},
    DOCUMENT_SYM: {text: ['@document', '@-moz-document']},
    UNKNOWN_SYM: {}, //{ name: "ATKEYWORD"},

    // CSS3 animations
    KEYFRAMES_SYM: {text: ['@keyframes', '@-webkit-keyframes', '@-moz-keyframes', '@-o-keyframes']},

    // important symbol
    IMPORTANT_SYM: {},

    // measurements
    LENGTH: {},
    ANGLE: {},
    TIME: {},
    FREQ: {},
    DIMENSION: {},
    PERCENTAGE: {},
    NUMBER: {},

    // functions
    URI: {},
    FUNCTION: {},

    // Unicode ranges
    UNICODE_RANGE: {},

    /*
     * The following token names are defined in CSS3 Selectors: https://www.w3.org/TR/css3-selectors/#selector-syntax
     */

    // invalid string
    INVALID: {},

    // combinators
    PLUS: {text: '+'},
    GREATER: {text: '>'},
    COMMA: {text: ','},
    TILDE: {text: '~'},
    COLUMN: {text: '||'},

    // modifier
    NOT: {},
    ANY: {text: ['any', '-webkit-any', '-moz-any']},
    IS: {},
    WHERE: {},

    /*
     * Defined in CSS3 Paged Media
     */
    TOPLEFTCORNER_SYM: {text: '@top-left-corner'},
    TOPLEFT_SYM: {text: '@top-left'},
    TOPCENTER_SYM: {text: '@top-center'},
    TOPRIGHT_SYM: {text: '@top-right'},
    TOPRIGHTCORNER_SYM: {text: '@top-right-corner'},
    BOTTOMLEFTCORNER_SYM: {text: '@bottom-left-corner'},
    BOTTOMLEFT_SYM: {text: '@bottom-left'},
    BOTTOMCENTER_SYM: {text: '@bottom-center'},
    BOTTOMRIGHT_SYM: {text: '@bottom-right'},
    BOTTOMRIGHTCORNER_SYM: {text: '@bottom-right-corner'},
    LEFTTOP_SYM: {text: '@left-top'},
    LEFTMIDDLE_SYM: {text: '@left-middle'},
    LEFTBOTTOM_SYM: {text: '@left-bottom'},
    RIGHTTOP_SYM: {text: '@right-top'},
    RIGHTMIDDLE_SYM: {text: '@right-middle'},
    RIGHTBOTTOM_SYM: {text: '@right-bottom'},

    /*
     * The following token names are defined in CSS3 Media Queries: https://www.w3.org/TR/css3-mediaqueries/#syntax
     */
    RESOLUTION: {state: 'media'},

    /*
     * The following token names are not defined in any CSS specification but are used by the lexer.
     */

    // not a real token, but useful for stupid IE filters
    IE_FUNCTION: {},

    // part of CSS3 grammar but not the Flex code
    CHAR: {},

    // Not defined as tokens, but might as well be
    PIPE: {text: '|'},
    SLASH: {text: '/'},
    MINUS: {text: '-'},
    STAR: {text: '*'},

    LBRACE: {text: '{', endChar: '}'},
    RBRACE: {text: '}'},
    LBRACKET: {text: '[', endChar: ']'},
    RBRACKET: {text: ']'},
    EQUALS: {text: '='},
    COLON: {text: ':'},
    SEMICOLON: {text: ';'},
    LPAREN: {text: '(', endChar: ')'},
    RPAREN: {text: ')'},
    DOT: {text: '.'},

    USO_VAR: {comment: true},
    CUSTOM_PROP: {},
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
  Tokens.type = text => typeMap.get(text) || -1;

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
    identCustom: [
      Tokens.IDENT,
      Tokens.CUSTOM_PROP,
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
    ns: [
      Tokens.IDENT,
      Tokens.STAR,
    ],
    plusMinus: [
      Tokens.MINUS,
      Tokens.PLUS,
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
  TT.termVar = [
    ...TT.term,
    Tokens.CUSTOM_PROP,
  ];

  //endregion
  //region lowerCase helper

  const lowercaseCache = new Map();

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

  //endregion
  //region StringReader

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
      if (i < 0) throw new Error(`Expected ${pattern}' at line ${this._line}, col ${this._col}.`);
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

  //endregion
  //region Matcher

  /**
   * Reuses a Matcher for a ValidationTypes definition string instead of reparsing it.
   * @type {Map<string, Matcher>}
   */
  const cachedMatcher = new Map();

  /**
   * This class implements a combinator library for matcher functions.
   * https://developer.mozilla.org/docs/Web/CSS/Value_definition_syntax#Component_value_combinators
   */
  class Matcher {

    constructor(matchFunc, toString, options) {
      this.matchFunc = matchFunc;
      this.toString = typeof toString === 'function' ? toString : () => toString;
      if (options) this.options = options;
    }

    static parse(str) {
      let m = cachedMatcher.get(str);
      if (m) return m;
      m = Matcher.doParse(str);
      cachedMatcher.set(str, m);
      return m;
    }

    /** Simple recursive-descent grammar to build matchers from strings. */
    static doParse(str) {
      const reader = new StringReader(str);
      const result = Matcher.parseGrammar(reader);
      if (!reader.eof()) {
        throw new Error(`Internal error. Expected end of string ${reader._line}:${reader._col}.`);
      }
      return result;
    }

    static cast(m) {
      return m instanceof Matcher ? m : Matcher.parse(m);
    }

    // Matcher for a single type.
    static fromType(type) {
      let m = cachedMatcher.get(type);
      if (m) return m;
      m = new Matcher(Matcher.matchFunc.fromType, type, type);
      cachedMatcher.set(type, m);
      return m;
    }

    // Matcher for one or more juxtaposed words, which all must occur, in the given order.
    static seq(...args) {
      const ms = args.map(Matcher.cast);
      if (ms.length === 1) return ms[0];
      return new Matcher(Matcher.matchFunc.seq, Matcher.toStringFunc.seq, ms);
    }

    // Matcher for one or more alternatives, where exactly one must occur.
    static alt(...args) {
      const ms = args.map(Matcher.cast);
      if (ms.length === 1) return ms[0];
      return new Matcher(Matcher.matchFunc.alt, Matcher.toStringFunc.alt, ms);
    }

    /**
     * Matcher for two or more options: double bar (||) and double ampersand (&&) operators,
     * as well as variants of && where some of the alternatives are optional.
     * This will backtrack through even successful matches to try to
     * maximize the number of items matched.
     */
    static many(required, ...args) {
      const ms = [];
      for (const arg of args) {
        if (arg.expand) {
          ms.push(...ValidationTypes.complex[arg.expand].options);
        } else {
          ms.push(Matcher.cast(arg));
        }
      }
      const m = new Matcher(Matcher.matchFunc.many, Matcher.toStringFunc.many, ms);
      m.required = required === true ? new Array(ms.length).fill(true) : required;
      return m;
    }

    // Matcher for two or more options in any order, all mandatory.
    static andand(...args) {
      return Matcher.many(true, ...args);
    }

    // Matcher for two or more options in any order, at least one must be present.
    static oror(...args) {
      return Matcher.many(false, ...args);
    }
    /**
     * @param {PropertyValueIterator} e
     * @return {?boolean}
     */
    match(e) {
      return e.popMark(this.matchFunc(e.mark()));
    }

    // Basic combinators

    then(m) {
      return Matcher.seq(this, m);
    }

    or(m) {
      return Matcher.alt(this, m);
    }

    andand(m) {
      return Matcher.many(true, this, m);
    }

    oror(m) {
      return Matcher.many(false, this, m);
    }

    // Component value multipliers
    star() {
      return this.braces(0, Infinity, '*');
    }

    plus() {
      return this.braces(1, Infinity, '+');
    }

    question() {
      return this.braces(0, 1, '?');
    }

    hash() {
      return this.braces(1, Infinity, '#', Matcher.cast(','));
    }

    braces(min, max, marker, optSep) {
      if (optSep) {
        optSep = optSep.then(this);
      }
      if (!marker || marker === '#') {
        marker = `${marker || ''}{${min}${min === max ? '' : ',' + max}}`;
      }
      const bracesMatch = expression => {
        let i = 0;
        while (i < max && (i && optSep || this).match(expression)) {
          i++;
        }
        return i >= min;
      };
      const bracesToString = () =>
        this.toString(Matcher.prec.MOD) + marker;
      return new Matcher(bracesMatch, bracesToString);
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

  Matcher.matchFunc = {

    alt(expression) {
      return this.options.some(m => m.match(expression));
    },

    fromType(expr) {
      return expr.hasNext() && ValidationTypes.isType(expr, this.options);
    },

    seq(expression) {
      return this.options.every(m => m.match(expression));
    },

    many(expression) {
      const seen = [];
      const {options: ms, required} = this;
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
          expression.mark();
          if (!ms[i].match(expression)) {
            expression.popMark(true);
            continue;
          }
          seen[i] = true;
          // Increase matchCount if this was a required element
          // (or if all the elements are optional)
          if (tryMatch(matchCount + (required === false || required[i] ? 1 : 0))) {
            expression.popMark(true);
            return true;
          }
          // Backtrack: try *not* matching using this rule, and
          // let's see if it leads to a better overall match.
          expression.popMark();
          seen[i] = false;
        }
        if (pass === 0) {
          max = Math.max(matchCount, max);
          return matchCount === ms.length;
        } else {
          return matchCount === max;
        }
      }
    },
  };

  Matcher.toStringFunc = {

    alt(prec) {
      const p = Matcher.prec.ALT;
      const s = this.options.map(m => m.toString(p)).join(' | ');
      return prec > p ? `[ ${s} ]` : s;
    },

    seq(prec) {
      const p = Matcher.prec.SEQ;
      const s = this.options.map(m => m.toString(p)).join(' ');
      return prec > p ? `[ ${s} ]` : s;
    },

    many(prec) {
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
  };

  Matcher.parseGrammar = (() => {
    let reader;
    return newReader => {
      reader = newReader;
      return expr();
    };
    function expr() {
      // expr = oror (" | " oror)*
      const m = [oror()];
      while (reader.readMatch(' | ')) {
        m.push(oror());
      }
      return m.length === 1 ? m[0] : Matcher.alt(...m);
    }
    function oror() {
      // oror = andand ( " || " andand)*
      const m = [andand()];
      while (reader.readMatch(' || ')) {
        m.push(andand());
      }
      return m.length === 1 ? m[0] : Matcher.oror(...m);
    }
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
      const m = [mod()];
      while (reader.readMatch(/\s(?![&|\]])/y)) {
        m.push(mod());
      }
      return m.length === 1 ? m[0] : Matcher.seq(...m);
    }
    function mod() {
      // mod = term ( "?" | "*" | "+" | "#" | "{<num>,<num>}" )?
      const m = term();
      reader.mark();
      let hash;
      switch (reader.read()) {
        case '?': return m.question();
        case '*': return m.star();
        case '+': return m.plus();
        case '#':
          if (reader.peek() !== '{') return m.hash();
          reader.read();
          hash = '#';
          // fallthrough
        case '{': {
          const min = eat(/\s*\d+\s*/y).trim();
          const c = eat(/[,}]/y);
          const max = c === ',' ? eat(/\s*\d+\s*}/y).slice(0, -1).trim() : min;
          return m.braces(Number(min), Number(max), hash, hash && Matcher.cast(','));
        }
        default:
          reader.reset();
      }
      return m;
    }
    function term() {
      // term = <nt> | literal | "[ " expression " ]"
      if (reader.readMatch('[ ')) {
        const m = expr();
        eat(' ]');
        return m;
      }
      return Matcher.fromType(eat(/[^\s?*+#{]+/y));
    }
    function eat(matcher) {
      const result = reader.readMatch(matcher);
      if (result == null) {
        throw new Error(`Internal error. Expected ${matcher} at ${reader._line}:${reader._col}.`);
      }
      return result;
    }
    function isOptional(item) {
      return !Array.isArray(item.options) && item.toString().endsWith('?');
    }
  })();

  //endregion
  //region EventTarget

  class EventTarget {

    constructor() {
      this._listeners = new Map();
    }

    addListener(type, fn) {
      let listeners = this._listeners.get(type);
      if (!listeners) this._listeners.set(type, (listeners = new Set()));
      listeners.add(fn);
    }

    fire(event) {
      if (typeof event === 'string') {
        event = {type: event};
      }
      if (typeof event.target !== 'undefined') {
        event.target = this;
      }

      if (typeof event.type === 'undefined') {
        throw new Error("Event object missing 'type' property.");
      }

      const listeners = this._listeners.get(event.type);
      if (!listeners) return;
      for (const fn of listeners.values()) {
        fn.call(this, event);
      }
    }

    removeListener(type, fn) {
      const listeners = this._listeners.get(type);
      if (listeners) listeners.delete(fn);
    }
  }

  //endregion
  //region SyntaxUnit

  class SyntaxUnit {

    constructor(text, pos, type) {
      this.col = pos.col || pos.startCol;
      this.line = pos.line || pos.startLine;
      this.offset = pos.offset;
      this.text = text;
      this.type = type;
    }

    valueOf() {
      return this.text;
    }

    toString() {
      return this.text;
    }

    static fromToken(token) {
      return new SyntaxUnit(token.value, token);
    }
  }

  //endregion
  //region SyntaxError

  class SyntaxError extends Error {
    constructor(message, pos) {
      super();
      this.name = this.constructor.name;
      this.col = pos.col || pos.startCol;
      this.line = pos.line || pos.startLine;
      this.message = message;
    }
  }

  //endregion
  //region ValidationError

  class ValidationError extends Error {
    constructor(message, pos) {
      super();
      this.col = pos.col || pos.startCol;
      this.line = pos.line || pos.startLine;
      this.message = message;
    }
  }

  //endregion
  //region MediaQuery

  // individual media query
  class MediaQuery extends SyntaxUnit {
    /**
     * @param {String} modifier The modifier "not" or "only" (or null).
     * @param {String} mediaType The type of media (i.e., "print").
     * @param {Array} features Array of selectors parts making up this selector.
     */
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

  //endregion
  //region MediaFeature

  // e.g. max-width:500.
  class MediaFeature extends SyntaxUnit {
    constructor(name, value) {
      const text = `(${name}${value != null ? ':' + value : ''})`;
      super(text, name, TYPES.MEDIA_FEATURE_TYPE);

      this.name = name;
      this.value = value;
    }
  }

  //endregion
  //region Selector

  /**
   * An entire single selector, including all parts but not
   * including multiple selectors (those separated by commas).
   */
  class Selector extends SyntaxUnit {
    /**
     * @param {SelectorPart[]} parts
     */
    constructor(parts, pos) {
      super(parts.join(' '), pos, TYPES.SELECTOR_TYPE);
      this.parts = parts;
      // eslint-disable-next-line no-use-before-define
      this.specificity = Specificity.calculate(this);
    }
  }

  //endregion
  //region SelectorPart

  /**
   * A single part of a selector string i.e. element name and modifiers.
   * Does not include combinators such as spaces, +, >, etc.
   */
  class SelectorPart extends SyntaxUnit {
    /**
     * @param {String} elementName or null if there's none
     * @param {SelectorSubPart[]} modifiers - may be empty
     */
    constructor(elementName, modifiers, text, pos) {
      super(text, pos, TYPES.SELECTOR_PART_TYPE);
      this.elementName = elementName;
      this.modifiers = modifiers;
    }
  }

  //endregion
  //region SelectorSubPart

  /**
   * Selector modifier string
   */
  class SelectorSubPart extends SyntaxUnit {
    /**
     * @param {string} type - elementName id class attribute pseudo any not
     */
    constructor(text, type, pos) {
      super(text, pos, TYPES.SELECTOR_SUB_PART_TYPE);
      this.type = type;
      // Some subparts have arguments
      this.args = [];
    }
  }

  //endregion
  //region Combinator

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

  //endregion
  //region Specificity

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

    /**
     * @return {int} The numeric value for the specificity.
     */
    valueOf() {
      return (this.a * 1000) + (this.b * 100) + (this.c * 10) + this.d;
    }

    /**
     * @return {String} The string representation of specificity.
     */
    toString() {
      return this.a + ',' + this.b + ',' + this.c + ',' + this.d;
    }

    /**
     * Calculates the specificity of the given selector.
     * @param {Selector} The selector to calculate specificity for.
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

  //endregion
  //region PropertyName

  class PropertyName extends SyntaxUnit {

    constructor(text, hack, pos) {
      super(text, pos, TYPES.PROPERTY_NAME_TYPE);
      // type of IE hack applied ("*", "_", or null).
      this.hack = hack;
    }

    toString() {
      return (this.hack || '') + this.text;
    }
  }

  //endregion
  //region PropertyValue

  /**
   * A single value between ":" and ";", that is if there are multiple values
   * separated by commas, this type represents just one of the values.
   */
  class PropertyValue extends SyntaxUnit {
    /**
     * @param {PropertyValuePart[]} parts An array of value parts making up this value.
     */
    constructor(parts, pos) {
      super(parts.join(' '), pos, TYPES.PROPERTY_VALUE_TYPE);
      this.parts = parts;
    }
  }

  //endregion
  //region PropertyValuePart

  const tokenConverter = new Map([
    ...(fn => [
      Tokens.LENGTH,
      Tokens.ANGLE,
      Tokens.TIME,
      Tokens.FREQ,
      Tokens.DIMENSION,
      Tokens.PERCENTAGE,
      Tokens.NUMBER,
    ].map(tt => [tt, fn]))((self, {number, units, unitsType}) => {
      self.value = number;
      self.units = units;
      self.type = unitsType === 'number' && !self.text.includes('.') ? 'integer' : unitsType;
    }),

    [Tokens.HASH, (self, {value}) => {

      self.type = 'color';
      if (value.length <= 5) {
        let n = parseInt(value.slice(1), 16);
        if (value.length === 5) {
          self.alpha = (n & 15) << 4 + (n & 15);
          n >>= 4;
        }
        self.red = (n >> 8 & 15) << 4 + (n >> 8 & 15);
        self.green = (n >> 4 & 15) << 4 + (n >> 4 & 15);
        self.blue = (n & 15) << 4 + (n & 15);
      } else {
        const n = parseInt(value.substr(1, 6), 16);
        self.red = n >> 16;
        self.green = (n >> 8) & 255;
        self.blue = n & 255;
        if (value.length === 9) {
          self.alpha = parseInt(value.substr(7, 2), 16);
        }
      }

    }],
    [Tokens.FUNCTION, (self, {name, expr}) => {

      self.name = name;
      self.expr = expr;
      const parts = expr && expr.parts;
      switch (parts && lower(name)) {
        case 'rgb':
        case 'rgba': {
          const [r, g, b, a] = parts.map(p => !/[,/]/.test(p)).map(parseFloat);
          const pct = parts[0].tokenType === Tokens.PERCENTAGE ? 2.55 : 1;
          self.type = 'color';
          self.red = r * pct;
          self.green = g * pct;
          self.blue = b * pct;
          if (!isNaN(a)) self.alpha = a * (/%/.test(parts[parts.length - 1]) ? 2.55 / 100 : 1);
          return;
        }
        case 'hsl':
        case 'hsla': {
          const [h, s, l, a] = parts.map(p => !/[,/]/.test(p)).map(parseFloat);
          self.type = 'color';
          self.hue = h;
          self.hueUnit = parts[0].units;
          self.saturation = s;
          self.lightness = l;
          if (!isNaN(a)) self.alpha = a * (/%/.test(parts[parts.length - 1]) ? 2.55 / 100 : 1);
          return;
        }
        default:
          self.type = 'function';
      }

    }],
    [Tokens.URI, (self, {name, uri}) => {

      self.type = 'uri';
      self.name = name;
      self.uri = uri;

    }],
    [Tokens.STRING, self => {

      self.type = 'string';
      self.value = parseString(self.text);

    }],
    [Tokens.IDENT, self => {

      const text = self.text;
      let namedColor;
      if (!text.includes('-') && (namedColor = Colors[text] || Colors[lower(text)])) {
        tokenConverter.get(Tokens.HASH)(self, {value: namedColor});
      } else {
        self.type = 'identifier';
        self.value = text;
      }

    }],
    [Tokens.CUSTOM_PROP, self => {

      self.type = 'custom-property';
      self.value = self.text;

    }],
  ]);

  /**
   * A single part of a value
   * e.g. '1px solid rgb(1, 2, 3)' has 3 parts
   */
  class PropertyValuePart extends SyntaxUnit {

    constructor(token) {
      const {value, type} = token;
      super(value, token, TYPES.PROPERTY_VALUE_PART_TYPE);

      this.type = 'unknown';
      this.tokenType = type;
      if (token.expr) this.expr = token.expr;
      // There can be ambiguity with escape sequences in identifiers, as
      // well as with "color" parts which are also "identifiers", so record
      // an explicit hint when the token generating this PropertyValuePart
      // was an identifier.
      this.wasIdent = type === Tokens.IDENT;

      const cvt = tokenConverter.get(type);
      if (cvt && cvt(this, token) !== false) return;

      if (value === ',' || value === '/') {
        this.type = 'operator';
        this.value = value;
        return;
      }
    }
  }

  //endregion
  //region PropertyValueIterator

  // A utility class that allows for easy iteration over the various parts of a property value.
  class PropertyValueIterator {
    /**
     * @param {PropertyValue} value
     */
    constructor(value) {
      this._i = 0;
      this._parts = value.parts;
      this._marks = [];
      this.value = value;
    }

    hasNext() {
      return this._i < this._parts.length;
    }

    peek(count) {
      return this._parts[this._i + (count || 0)] || null;
    }

    next() {
      return this._i < this._parts.length ? this._parts[this._i++] : null;
    }
    mark() {
      this._marks.push(this._i);
      return this;
    }

    popMark(success) {
      const i = this._marks.pop();
      if (!success && i != null) {
        this._i = i;
      }
      return success;
    }
  }

  //endregion
  //region ValidationTypes - methods

  Object.assign(ValidationTypes, {

    /**
     * @param {string} name
     * @param {PropertyValuePart} part
     * @returns {boolean}
     * @throws {ValidationError}
     */
    isFunction(name, {expr}) {
      // no parameter means the initial value is used so it's a valid function call
      if (!expr) {
        return this.functionsMayBeEmpty.has(name);
      }
      // USO vars can span any number of grammar parts so not gonna try to guess. KISS.
      if (expr.parts.some(p => p.tokenType === Tokens.USO_VAR)) {
        return true;
      }
      const fn = this.functions[name];
      if (!fn) {
        return true;
      }
      const vi = new PropertyValueIterator(expr);
      if (fn.match(vi) && !vi.hasNext()) {
        return true;
      }
      throw new ValidationError(
        `Expected '${this.explode(`${fn}`)}' but found '${vi.value.text}'.`, vi.value);
    },

    /**
     * @param {string} literals
     * @param {PropertyValuePart} part
     * @return {?boolean}
     */
    isLiteral(literals, part) {
      let text;
      for (const arg of literals.includes(' | ') ? literals.split(' | ') : [literals]) {
        if (arg.startsWith('<')) {
          if (arg in this.simple && this.simple[arg](part)) {
            return true;
          }
        } else if (
          arg.endsWith('()') &&
          part.type === 'function' &&
          part.name && part.name.length === arg.length - 2
        ) {
          const name = arg.slice(0, -2);
          const isFn = lowerCmp(name, part.name) ? this.isFunction(name, part) : null;
          if (isFn != null) {
            return isFn;
          }
        } else if (part.text.length >= arg.length) {
          if (!text) text = RX_VENDOR_PREFIX.test(text) ? RegExp.$2 : part.text;
          if (lowerCmp(text, arg)) {
            return true;
          }
        }
      }
    },

    /**
     * @param {PropertyValueIterator} expr
     * @param {string} type
     * @return {?boolean}
     */
    isType(expr, type) {
      const part = expr.peek();
      let result, m;

      if (this.simple['<var>'](part)) {
        if (expr._i < expr._parts.length - 1) {
          expr.mark().next();
          expr.popMark(ValidationTypes.isType(expr, type));
        }
        result = true;

      } else if (!type.startsWith('<')) {
        result = this.isLiteral(type, part);

      } else if ((m = this.simple[type])) {
        result = m.call(this.simple, part);

      } else {
        m = this.complex[type];
        return m instanceof Matcher ?
          m.match(expr) :
          m.call(this.complex, expr);
      }

      if (!result && expr.tryAttr && part.type === 'function' && lowerCmp(part.name, 'attr')) {
        result = ValidationTypes.isFunction('attr', part);
      }
      if (result) expr.next();
      return result;
    },

    describe(type) {
      const complex = this.complex[type];
      const text = complex instanceof Matcher ? complex.toString(0) : type;
      return this.explode(text);
    },

    explode(text) {
      if (!text.includes('<')) return text;
      return text
        .replace(' | <var>', '')
        .replace(/(<.*?>)([{#?]?)/g,
          (_, rule, mod) => {
            const ref = this.simple[rule] || this.complex[rule];
            if (!ref || !ref.originalText) return rule + mod;
            return ((mod ? '[' : '') + this.explode(ref.originalText) + (mod ? ']' : '')) + mod;
          });
    },
  });

  for (const name of ['simple', 'complex', 'functions']) {
    const action = name === 'simple'
      ? rule => ValidationTypes.isLiteral.bind(ValidationTypes, rule)
      : Matcher.parse;
    const set = ValidationTypes[name];
    for (const id in set) {
      const rule = set[id];
      if (typeof rule === 'string') {
        set[id] = Object.defineProperty(action(rule), 'originalText', {value: rule});
      } else if (/^Matcher\s/.test(rule)) {
        set[id] = rule(Matcher);
      }
    }
  }

  //endregion
  //region Validation

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

    const prop = lower(property);
    let known = validationCache.get(prop);
    if (known && known.has(value.text)) return;

    const spec = Properties[prop] || RX_VENDOR_PREFIX.test(prop) && Properties[RegExp.$2];

    if (typeof spec === 'number') return;
    if (!spec && prop.startsWith('-')) return;
    if (!spec) throw new ValidationError(`Unknown property '${property}'.`, property);

    // Property-specific validation.
    const expr = new PropertyValueIterator(value);
    const tryAttr = /\battr\(/i.test(value.text);
    const m = Matcher.parse(spec);
    let result = m.match(expr);
    if (tryAttr) {
      if (!result) {
        expr.tryAttr = true;
        expr._i = 0;
        result = m.match(expr);
      }
      while (expr.hasNext() &&
          ValidationTypes.simple['<attr>'](expr.peek()) &&
          ValidationTypes.isFunction('attr', expr.peek())) {
        expr.next();
      }
    }
    if (result) {
      if (expr.hasNext()) throwEndExpected(expr.next());
    } else if (expr.hasNext() && expr._i) {
      throwEndExpected(expr.peek());
    } else {
      const {text} = expr.value;
      throw new ValidationError(`Expected '${ValidationTypes.describe(spec)}' but found '${text}'.`,
        expr.value);
    }

    if (!known) validationCache.set(prop, (known = new Set()));
    known.add(value.text);

    function throwEndExpected(token, force) {
      if (force || (token.name !== 'var' && token.name !== 'env') || token.type !== 'function') {
        throw new ValidationError(`Expected end of value but found '${token.text}'.`, token);
      }
    }
  }

  //endregion
  //region TokenStreamBase

  /**
   * lookup table size for TokenStreamBase
   */
  const LT_SIZE = 5;

  /**
   * Generic TokenStream providing base functionality.
   */
  class TokenStreamBase {

    constructor(input) {
      this._reader = new StringReader(input ? input.toString() : '');
      this.resetLT();
    }

    resetLT() {
      // Token object for the last consumed token.
      this._token = null;
      // Lookahead token buffer.
      this._lt = [];
      this._ltIndex = 0;
      this._ltIndexCache = [];
    }

    /**
     * Consumes the next token if that matches any of the given token type(s).
     * @param {int|int[]} tokenTypes
     * @return {Object|false}
     */
    match(tokenTypes) {
      const isArray = typeof tokenTypes === 'object';
      for (let tt; (tt = this.get());) {
        if (isArray ? tokenTypes.includes(tt) : tt === tokenTypes) {
          return this._token;
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
      if (!this.match(tokenTypes)) {
        const {startLine: line, startCol: col, offset} = this.LT(1);
        const info = Tokens[Array.isArray(tokenTypes) ? tokenTypes[0] : tokenTypes];
        throw new SyntaxError(`Expected ${info.text || info.name} at line ${line}, col ${col}.`, {line, col, offset});
      }
      return this._token;
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
     * @return {int} The token type
     */
    get() {
      const cache = this._ltIndexCache;
      const lt = this._lt;
      let i = 0;

      // check the lookahead buffer first
      let len = lt.length;
      let ltIndex = this._ltIndex;
      if (len && ltIndex >= 0 && ltIndex < len) {
        i++;
        this._token = lt[ltIndex];
        this._ltIndex = ++ltIndex;
        if (ltIndex <= len) {
          cache.push(i);
          return this._token.type;
        }
      }

      const token = this._getToken();
      const type = token.type;
      const isHidden = Tokens[type].hide;

      if (type > -1 && !isHidden) {
        // save for later
        this._token = token;
        lt.push(token);

        // save space that will be moved (must be done before array is truncated)
        cache.push(++len - ltIndex + i);

        if (len > LT_SIZE) lt.shift();
        if (cache.length > LT_SIZE) cache.shift();

        // update lookahead index
        this._ltIndex = lt.length;
      }

      // Skip to the next token if the token type is marked as hidden.
      return isHidden ? this.get() : type;
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
      if (!index) return this._token.type;

      if (index > 0) {
        if (index > LT_SIZE) throw new Error('Too much lookahead.');
        let total = index;
        let tt;
        while (total && total--) tt = this.get();
        while (total++ < index) this.unget();
        return tt;
      }

      if (index < 0) {
        const token = this._lt[this._ltIndex + index];
        if (!token) throw new Error('Too much lookbehind.');
        return token.type;
      }
    }

    /**
     * Looks ahead a certain number of tokens and returns the token at that position.
     * @param {int} index The index of the token type to retrieve.
     *         0 for the current token, 1 for the next, -1 for the previous, etc.
     * @return {Object} The token
     * @throws if you lookahead past EOF, past the size of the lookahead buffer,
     *         or back past the first token in the lookahead buffer.
     */
    LT(index) {
      // lookahead first to prime the token buffer
      this.LA(index);
      // now find the token, subtract one because _ltIndex is already at the next index
      return this._lt[this._ltIndex + index - 1];
    }

    // Returns the token type for the next token in the stream without consuming it.
    peek() {
      return this.LA(1);
    }

    // Restores the last consumed token to the token stream.
    unget() {
      const cache = this._ltIndexCache;
      if (cache.length) {
        this._ltIndex -= cache.pop();
        this._token = this._lt[this._ltIndex - 1];
      } else {
        throw new Error('Too much lookahead.');
      }
    }
  }

  //endregion
  //region TokenStream

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
      const tt = (this._lt[this._ltIndex] || this.LT(1)).type;
      if (tt === Tokens.USO_VAR ||
          tt === Tokens.COMMENT ||
          skipWS && tt === Tokens.S) {
        while (this.match(TT.usoS)) { /*NOP*/ }
      }
    }

    /**
     * @returns {Object} token
     */
    _getToken() {
      const reader = this._reader;
      const pos = {
        line: reader._line,
        col: reader._col,
        offset: reader._cursor,
      };
      const c = reader.read();
      switch (c) {

        /*
         * Potential tokens:
         * - S
         */
        case ' ':
        case '\n':
        case '\r':
        case '\t':
        case '\f':
          return this.whitespaceToken(c, pos);

        /*
         * Potential tokens:
         * - COMMENT
         * - SLASH
         * - CHAR
         */
        case '/':
          return reader.peek() === '*' ?
            this.commentToken(c, pos) :
            this.charToken(c, pos);

        /*
         * Potential tokens:
         * - DASHMATCH
         * - INCLUDES
         * - PREFIXMATCH
         * - SUFFIXMATCH
         * - SUBSTRINGMATCH
         * - COLUMN
         * - CHAR
         */
        case '|':
        case '~':
        case '^':
        case '$':
        case '*':
          return (
            reader.peek() === '=' ?
              this.comparisonToken(c, pos) :
            c === '|' && reader.readMatch('|') ?
              this.createToken(Tokens.COLUMN, '||', pos) :
              this.charToken(c, pos)
          );
        /*
         * Potential tokens:
         * - STRING
         * - INVALID
         */
        case '"':
        case "'":
          return this.stringToken(c, pos);

        /*
         * Potential tokens:
         * - HASH
         * - CHAR
         */
        case '#':
          return isNameChar(reader.peek()) ?
            this.hashToken(c, pos) :
            this.charToken(c, pos);

        /*
         * Potential tokens:
         * - DOT
         * - NUMBER
         * - DIMENSION
         * - PERCENTAGE
         */
        case '.':
          return isDigit(reader.peek()) ?
            this.numberToken(c, pos) :
            this.charToken(c, pos);

        /*
         * Potential tokens:
         * - CDC
         * - MINUS
         * - NUMBER
         * - DIMENSION
         * - PERCENTAGE
         */
        case '-': {
          const next = reader.peek();
          // could be closing HTML-style comment or CSS variable
          return (
            next === '-' ?
              /\w/.test(reader.peek(2)) ?
                this.identOrFunctionToken(c, pos) :
                this.htmlCommentEndToken(c, pos) :
            next === '.' && isDigit(reader.peek(2)) ||
            isDigit(next) ?
              this.numberToken(c, pos) :
            isNameStart(next) ?
              this.identOrFunctionToken(c, pos) :
              this.charToken(c, pos)
          );
        }
        /*
         * Potential tokens:
         * - PLUS
         * - NUMBER
         * - DIMENSION
         * - PERCENTAGE
         */
        case '+': {
          const next = reader.peek();
          return (
            next === '.' && isDigit(reader.peek(2)) ||
            isDigit(next) ?
              this.numberToken(c, pos) :
              this.charToken(c, pos)
          );
        }
        /*
         * Potential tokens:
         * - IMPORTANT_SYM
         * - CHAR
         */
        case '!':
          return this.importantToken(c, pos);

        /*
         * Any at-keyword or CHAR
         */
        case '@':
          return this.atRuleToken(c, pos);

        /*
         * Potential tokens:
         * - ANY
         * - IS
         * - NOT
         * - WHERE
         * - CHAR
         */
        case ':':
          return this.notOrIsToken(c, pos);

        /*
         * Potential tokens:
         * - CDO
         * - CHAR
         */
        case '<':
          return this.htmlCommentStartToken(c, pos);

        /*
         * Potential tokens:
         * - IDENT
         * - CHAR
         */
        case '\\':
          return /[^\r\n\f]/.test(reader.peek()) ?
            this.identOrFunctionToken(this.readEscape(c), pos) :
            this.charToken(c, pos);

        // EOF
        case null:
          return this.createToken(Tokens.EOF, null, pos);

        /*
         * Potential tokens:
         * - UNICODE_RANGE
         * - URL
         * - CHAR
         */
        case 'U':
        case 'u':
          if (reader.peek() === '+') {
            return this.unicodeRangeToken(c, pos);
          }
          // fallthrough
      }

      /*
       * Potential tokens:
       * - NUMBER
       * - DIMENSION
       * - LENGTH
       * - FREQ
       * - TIME
       * - EMS
       * - EXS
       * - ANGLE
       */
      if (isDigit(c)) {
        return this.numberToken(c, pos);
      }

      /*
       * Potential tokens:
       * - IDENT
       * - CHAR
       * - PLUS
       */
      return isIdentStart(c) ?
        this.identOrFunctionToken(c, pos) :
        this.charToken(c, pos);
    }

    /**
     * Produces a token based on available data and the current
     * reader position information. This method is called by other
     * private methods to create tokens and is never called directly.
     */
    createToken(type, value, pos, opts) {
      const token = {
        value,
        type,
        startLine: pos.line,
        startCol: pos.col,
        offset: pos.offset,
      };
      if (opts && opts.endChar) token.endChar = opts.endChar;
      return token;
    }

    /**
     * Produces a token for any at-rule. If the at-rule is unknown, then
     * the token is for a single "@" character.
     * @param {String} first The first character for the token.
     */
    atRuleToken(first, pos) {
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
      return this.createToken(tt, rule, pos);
    }

    // DOT, PIPE, PLUS, etc. (name for this character in 'Tokens')
    // CHAR
    charToken(c, pos) {
      const tt = Tokens.type(c);
      if (tt === -1) {
        return this.createToken(Tokens.CHAR, c, pos, {});
      } else {
        return this.createToken(tt, c, pos, {endChar: Tokens[tt].endChar});
      }
    }

    // COMMENT
    // USO_VAR
    commentToken(first, pos) {
      const comment = this.readComment(first);
      const isUsoVar = comment.startsWith('/*[[') && comment.endsWith(']]*/');
      return this.createToken(isUsoVar ? Tokens.USO_VAR : Tokens.COMMENT, comment, pos);
    }

    // DASHMATCH
    // INCLUDES
    // PREFIXMATCH
    // SUFFIXMATCH
    // SUBSTRINGMATCH
    // CHAR
    comparisonToken(c, pos) {
      const comparison = c + this._reader.read();
      const tt = Tokens.type(comparison) || Tokens.CHAR;
      return this.createToken(tt, comparison, pos);
    }

    // HASH
    hashToken(first, pos) {
      return this.createToken(Tokens.HASH, this.readName(first), pos);
    }

    // CDO
    // CHAR
    htmlCommentStartToken(first, pos) {
      return this._reader.readMatch('!--') ?
        this.createToken(Tokens.CDO, '<!--', pos) :
        this.charToken(first, pos);
    }

    // CDC
    // CHAR
    htmlCommentEndToken(first, pos) {
      return this._reader.readMatch('->') ?
        this.createToken(Tokens.CDC, '-->', pos) :
        this.charToken(first, pos);
    }

    // IDENT
    // URI
    // FUNCTION
    // CUSTOM_PROP
    identOrFunctionToken(first, pos) {
      const reader = this._reader;
      const name = this.readName(first);
      const next = reader.peek();
      // might be a URI or function
      if (next === '(') {
        reader.read();
        if (/^(url(-prefix)?|domain)$/i.test(name)) {
          reader.mark();
          const uri = this.readURI(name + '(');
          if (uri) {
            const token = this.createToken(Tokens.URI, uri.text, pos);
            token.name = name;
            token.uri = uri.value;
            return token;
          }
          reader.reset();
        }
        return this.createToken(Tokens.FUNCTION, name + '(', pos);
      }
      // might be an IE-specific function with progid:
      if (next === ':' && lowerCmp(name, 'progid')) {
        return this.createToken(Tokens.IE_FUNCTION, name + reader.readTo('('), pos);
      }
      const type = name.startsWith('--') ? Tokens.CUSTOM_PROP : Tokens.IDENT;
      return this.createToken(type, name, pos);
    }

    // IMPORTANT_SYM
    // CHAR
    importantToken(first, pos) {
      const reader = this._reader;
      let text = first;
      reader.mark();
      for (let pass = 1; pass++ <= 2;) {
        const important = reader.readMatch(/\s*important\b/iy);
        if (important) {
          return this.createToken(Tokens.IMPORTANT_SYM, text + important, pos);
        }
        const comment = reader.readMatch('/*');
        if (!comment) break;
        text += comment + this.readComment(comment);
      }
      reader.reset();
      return this.charToken(first, pos);
    }

    // NOT
    // IS
    // ANY
    // CHAR
    notOrIsToken(first, pos) {
      // first is always ':'
      const reader = this._reader;
      const func = reader.readMatch(/(not|is|where|(-(moz|webkit)-)?any)\(/iy);
      if (func) {
        const lcase = func[0].toLowerCase();
        const type =
          lcase === 'n' ? Tokens.NOT :
          lcase === 'i' ? Tokens.IS :
          lcase === 'w' ? Tokens.WHERE :
            Tokens.ANY;
        return this.createToken(type, first + func, pos);
      }
      return this.charToken(first, pos);
    }

    // NUMBER
    // EMS
    // EXS
    // LENGTH
    // ANGLE
    // TIME
    // FREQ
    // DIMENSION
    // PERCENTAGE
    numberToken(first, pos) {
      const reader = this._reader;
      const value = this.readNumber(first);
      let tt = Tokens.NUMBER;
      let units, type;

      const c = reader.peek();
      if (isIdentStart(c)) {
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

      const token = this.createToken(tt, units ? value + units : value, pos);
      token.number = parseFloat(value);
      if (units) token.units = units;
      if (type) token.unitsType = type;
      return token;
    }

    // STRING
    // INVALID - in case the string isn't closed
    stringToken(first, pos) {
      const delim = first;
      const string = first ? [first] : [];
      const reader = this._reader;
      let tt = Tokens.STRING;
      let c = reader.read();
      let i;

      while (c) {
        string.push(c);

        if (c === '\\') {
          c = reader.read();
          if (c == null) {
            break; // premature EOF after backslash
          } else if (/[^\r\n\f0-9a-f]/i.test(c)) {
            // single-character escape
            string.push(c);
          } else {
            // read up to six hex digits
            for (i = 0; isHexDigit(c) && i < 6; i++) {
              string.push(c);
              c = reader.read();
            }
            // swallow trailing newline or space
            if (c === '\r' && reader.peek() === '\n') {
              string.push(c);
              c = reader.read();
            }
            if (isWhitespace(c)) {
              string.push(c);
            } else {
              // This character is null or not part of the escape;
              // jump back to the top to process it.
              continue;
            }
          }
        } else if (c === delim) {
          break; // delimiter found.
        } else if (isNewLine(reader.peek())) {
          // newline without an escapement: it's an invalid string
          tt = Tokens.INVALID;
          break;
        }
        c = reader.read();
      }

      // the string was never closed
      if (!c) tt = Tokens.INVALID;

      return this.createToken(tt, string.join(''), pos);
    }

    // UNICODE_RANGE
    // CHAR
    unicodeRangeToken(first, pos) {
      const reader = this._reader;
      if (reader.peek() !== '+') {
        return this.createToken(Tokens.CHAR, first, pos);
      }
      reader.mark();
      reader.read();
      let value = first + '+';
      let chunk = this.readUnicodeRangePart(true);
      if (!chunk) {
        reader.reset();
        return this.createToken(Tokens.CHAR, value, pos);
      }
      value += chunk;
      // if there's a ? in the first part, there can't be a second part
      if (!value.includes('?') && reader.peek() === '-') {
        reader.mark();
        reader.read();
        chunk = this.readUnicodeRangePart(false);
        if (!chunk) {
          reader.reset();
        } else {
          value += '-' + chunk;
        }
      }
      return this.createToken(Tokens.UNICODE_RANGE, value, pos);
    }

    // S
    whitespaceToken(first, pos) {
      return this.createToken(Tokens.S, first + this.readWhitespace(), pos);
    }

    //-------------------------------------------------------------------------
    // Methods to read values from the string stream
    //-------------------------------------------------------------------------

    readUnicodeRangePart(allowQuestionMark) {
      const reader = this._reader;
      let part = reader.readMatch(/[0-9a-f]{1,6}/iy);
      if (allowQuestionMark &&
          part.length < 6 &&
          reader.peek() === '?') {
        part += reader.readMatch(new RegExp(`\\?{1,${6 - part.length}}`, 'y'));
      }
      return part;
    }

    readWhitespace() {
      return this._reader.readMatch(/\s+/y) || '';
    }

    readNumber(first) {
      const tail = this._reader.readMatch(
        first === '.' ?
          /\d+(e[+-]?\d+)?/iy :
        isDigit(first) ?
          /\d*\.?\d*(e[+-]?\d+)?/iy :
          /(\d*\.\d+|\d+\.?\d*)(e[+-]?\d+)?/iy);
      return first + (tail || '');
    }

    // returns null w/o resetting reader if string is invalid.
    readString() {
      const token = this.stringToken(this._reader.read(), 0, 0);
      return token.type !== Tokens.INVALID ? token.value : null;
    }

    // returns null w/o resetting reader if URI is invalid.
    readURI(first) {
      const reader = this._reader;
      const uri = first;
      let value = '';

      this.readWhitespace();

      if (/['"]/.test(reader.peek())) {
        value = this.readString();
        if (value == null) return null;
        value = parseString(value);
      } else {
        value = this.readUnquotedURL();
      }

      this.readWhitespace();
      if (reader.peek() !== ')') return null;

      // Ensure argument to URL is always double-quoted
      // (This simplifies later processing in PropertyValuePart.)
      return {value, text: uri + serializeString(value) + reader.read()};
    }

    readUnquotedURL(first) {
      return this.readChunksWithEscape(first, /[-!#$%&*-[\]-~\u00A0-\uFFFF]+/y);
    }

    readName(first) {
      return this.readChunksWithEscape(first, /[-_\da-zA-Z\u00A0-\uFFFF]+/y);
    }

    readEscape() {
      const cp = this._reader.readMatch(/[0-9a-f]{1,6}\b\s*/iy);
      return cp ? String.fromCodePoint(parseInt(cp, 16)) : this._reader.read();
    }

    readChunksWithEscape(first, rx) {
      const reader = this._reader;
      const url = first ? [first] : [];
      while (true) {
        const chunk = reader.readMatch(rx);
        if (chunk) url.push(chunk);
        if (reader.peek() === '\\' && /^[^\r\n\f]$/.test(reader.peek(2))) {
          url.push(this.readEscape(reader.read()));
        } else {
          break;
        }
      }
      return (
        url.length > 2 ? url.join('') :
        url.length > 1 ? url[0] + url[1] :
        url[0] || ''
      );
    }

    readComment(first) {
      return first +
             this._reader.readCount(2 - first.length) +
             this._reader.readMatch(/([^*]|\*(?!\/))*(\*\/|$)/y);
    }
  }

  //endregion
  //region parserCache

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
      start,
      addEvent,
      findBlock,
      startBlock,
      adjustBlockStart,
      endBlock,
      cancelBlock: () => stack.pop(),
      feedback,
    };

    /**
     * Enables caching on the provided parser
     * @param {Parser} newParser - use a falsy value to disable
     */
    function start(newParser) {
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
    }

    /**
     * Adds the event into a matching nested open block which is currently being processed by the parser.
     * @param {{offset, ...}} event - the event's `offset` property is used to determine the matching block
     */
    function addEvent(event) {
      if (!parser) return;
      for (let i = stack.length; --i >= 0;) {
        const {offset, endOffset, events} = stack[i];
        if (event.offset >= offset && (!endOffset || event.offset <= endOffset)) {
          events.push(event);
          return;
        }
      }
    }

    /**
     * Starts a nested block so it can accumulate subsequent events
     * @param {(Token|SyntaxUnit)} [start = TokenStream::LT(1)]
     */
    function startBlock(start = getToken()) {
      if (!parser) return;
      stack.push({
        text: '',
        events: [],
        generation: generation,
        startLine: start.startLine || start.line,
        startCol: start.startCol || start.col,
        offset: start.offset,
        endLine: undefined,
        endCol: undefined,
        endOffset: undefined,
      });
    }

    /**
     * Adjusts the start position of an already started block
     * @param {(Token|SyntaxUnit)} [start = TokenStream::LT(1)]
     */
    function adjustBlockStart(start = getToken()) {
      if (!parser) return;
      const block = stack[stack.length - 1];
      block.startLine = start.startLine || start.line;
      block.startCol = start.startCol || start.col;
      block.offset = start.offset;
    }

    /**
     * Closes the last opened block at the specified position and stores it in the cache
     * @param {(Token|SyntaxUnit)} [token = TokenStream::LT(1)]
     */
    function endBlock(end = getToken()) {
      if (!parser) return;
      const block = stack.pop();
      block.endLine = end.startLine || end.line;
      block.endCol = (end.startCol || end.col) + end.value.length;
      block.endOffset = end.offset + end.value.length;

      const input = stream._reader._input;
      const key = input.slice(block.offset, input.indexOf('{', block.offset) + 1);
      block.text = input.slice(block.offset, block.endOffset);

      let blocks = data.get(key);
      if (!blocks) data.set(key, (blocks = []));
      blocks.push(block);
    }

    /**
     * Tries to find a cached block that matches the input text at specified token's position.
     * The nearest matching block is used to advance the parser's stream and reader.
     * @param {(Token|SyntaxUnit)} [token = TokenStream::LT(1)]
     */
    function findBlock(token = getToken()) {
      if (!parser || firstRun || !token) return;

      const reader = stream._reader;
      const input = reader._input;
      let start = token.offset;
      if (isWhitespace(input[start])) {
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
    }

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

    /**
     * Uses the provided CSSLint report to decide which blocks should keep their events.
     * Blocks that didn't cause any messages in CSSLint's rules report are stripped of their events.
     * @param {{line, col, ...}[]} messages
     * @todo retain stats and rollups in the report
     */
    function feedback({messages}) {
      messages = new Set(messages);
      for (const blocks of data.values()) {
        for (const block of blocks) {
          if (!block.events.length) continue;
          if (block.generation !== generation) continue;
          const {
            startLine: L1,
            startCol: C1,
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
      const deltaLines = reader._line - block.startLine;
      const deltaCols = block.startCol === 1 && reader._col === 1 ? 0 : reader._col - block.startCol;
      const deltaOffs = reader._cursor - block.offset;
      const hasDelta = deltaLines || deltaCols || deltaOffs;
      const shifted = new Set();
      for (const e of block.events) {
        if (hasDelta) {
          applyDelta(e, shifted, block.startLine, deltaLines, deltaCols, deltaOffs);
        }
        parser.fire(e, false);
      }
      block.generation = generation;
      block.endCol += block.endLine === block.startLine ? deltaCols : 0;
      block.endLine += deltaLines;
      block.endOffset = reader._cursor + block.text.length;
      block.startLine += deltaLines;
      block.startCol += deltaCols;
      block.offset = reader._cursor;
    }

    function shiftStream(reader, block) {
      reader._line = block.endLine;
      reader._col = block.endCol;
      reader._cursor = block.endOffset;

      stream._lt.length = 0;
      stream._ltIndexCache.length = 0;
      stream._ltIndex = 0;
      stream._token = undefined;
    }

    // Recursively applies the delta to the event and all its nested parts
    function applyDelta(obj, seen, startLine, lines, cols, offs) {
      if (seen.has(obj)) return;
      seen.add(obj);
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if ((typeof item === 'object' || Array.isArray(item)) && item) {
            applyDelta(item, seen, startLine, lines, cols, offs);
          }
        }
        return;
      }
      // applyDelta may get surpisingly slow on complex objects so we're using an array
      // because in js an array lookup is much faster than a property lookup
      const keys = Object.keys(obj);
      if (cols !== 0) {
        if (keys.includes('startCol') && obj.startLine === startLine) obj.col += cols;
        if (keys.includes('endCol') && obj.endLine === startLine) obj.endCol += cols;
        if (keys.includes('col') && obj.line === startLine) obj.col += cols;
      }
      if (lines !== 0) {
        if (keys.includes('line')) obj.line += lines;
        if (keys.includes('endLine')) obj.endLine += lines;
        if (keys.includes('startLine')) obj.startLine += lines;
      }
      if (offs !== 0 && keys.includes('offset')) obj.offset += offs;
      for (const k of keys) {
        if (k !== 'col' && k !== 'startCol' && k !== 'endCol' &&
            k !== 'line' && k !== 'startLine' && k !== 'endLine' &&
            k !== 'offset') {
          const v = obj[k];
          if (v && typeof v === 'object') {
            applyDelta(v, seen, startLine, lines, cols, offs);
          }
        }
      }
    }

    // returns TokenStream::LT(1) or null
    function getToken() {
      return parser ?
        stream._lt[stream._ltIndex] || stream._token :
        null;
    }

    function deepCopy(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) {
        return obj.map(v => !v || typeof v !== 'object' ? v : deepCopy(v));
      }
      const copy = {};
      const hasOwnProperty = Object.prototype.hasOwnProperty;
      for (const k in obj) {
        if (!hasOwnProperty.call(obj, k)) continue;
        const v = obj[k];
        copy[k] = !v || typeof v !== 'object' ? v : deepCopy(v);
      }
      return copy;
    }
  })();

  //endregion
  //region Parser

  class Parser extends EventTarget {
    /**
     * @param {Object} [options]
     * @param {Boolean} [options.starHack] - allows IE6 star hack
     * @param {Boolean} [options.underscoreHack] - interprets leading underscores as IE6-7 for known properties
     * @param {Boolean} [options.ieFilters] - accepts IE < 8 filters instead of throwing syntax errors
     * @param {Boolean} [options.emptyDocument] - accepts @document without {} block produced by stylus-lang
     */
    constructor(options) {
      super();
      this.options = options || {};
      this._tokenStream = null;
    }

    /**
     * @param {String|{type: string, ...}} event
     * @param {Token|SyntaxUnit} [token=this._tokenStream._token] - sets the position
     */
    fire(event, token = this._tokenStream._token) {
      if (typeof event === 'string') {
        event = {type: event};
      } else if (event.message && event.message.includes('/*[[')) {
        return;
      }
      if (event.offset === undefined && token) {
        event.offset = token.offset;
        if (event.line === undefined) event.line = token.startLine || token.line;
        if (event.col === undefined) event.col = token.startCol || token.col;
      }
      if (token !== false) parserCache.addEvent(event);
      super.fire(event);
    }

    _stylesheet() {
      const stream = this._tokenStream;

      this.fire('startstylesheet');

      this._charset();
      this._skipCruft();

      while (stream.peek() === Tokens.IMPORT_SYM) {
        this._import();
        this._skipCruft();
      }

      while (stream.peek() === Tokens.NAMESPACE_SYM) {
        this._namespace();
        this._skipCruft();
      }

      for (let tt; (tt = stream.peek()) > Tokens.EOF; this._skipCruft()) {
        try {
          let action = Parser.ACTIONS.stylesheet.get(tt);
          if (action) {
            action.call(this);
            continue;
          }
          action = Parser.ACTIONS.stylesheetMisplaced.get(tt);
          if (action) {
            const token = stream.LT(1);
            action.call(this, false);
            throw new SyntaxError(Tokens[tt].text + ' not allowed here.', token);
          }
          if (this._ruleset()) continue;
          if (stream.peek() !== Tokens.EOF) {
            stream.get();
            this._unexpectedToken(stream._token);
          }
        } catch (ex) {
          if (ex instanceof SyntaxError && !this.options.strict) {
            this.fire(Object.assign({}, ex, {type: 'error', error: ex}));
          } else {
            throw ex;
          }
        }
      }

      this.fire('endstylesheet');
    }

    _charset(emit = true) {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.CHARSET_SYM)) return;
      const start = stream._token;
      const charset = stream.mustMatch(Tokens.STRING).value;
      stream.mustMatch(Tokens.SEMICOLON);
      if (emit) {
        this.fire({
          type: 'charset',
          charset,
        }, start);
      }
    }

    _import(emit = true) {
      const stream = this._tokenStream;
      const start = stream.mustMatch(Tokens.IMPORT_SYM);
      stream.mustMatch(TT.stringUri);
      const uri = stream._token.value.replace(/^(?:url\()?["']?([^"']+?)["']?\)?$/, '$1');
      this._ws();
      const mediaList = this._mediaQueryList();
      stream.mustMatch(Tokens.SEMICOLON);
      if (emit) {
        this.fire({
          type: 'import',
          media: mediaList,
          uri,
        }, start);
      }
      this._ws();
    }

    _namespace(emit = true) {
      const stream = this._tokenStream;
      const start = stream.mustMatch(Tokens.NAMESPACE_SYM);
      let prefix = null;
      this._ws();
      if (stream.match(Tokens.IDENT)) {
        prefix = stream._token.value;
        this._ws();
      }
      stream.mustMatch(TT.stringUri);
      const uri = stream._token.value.replace(/(?:url\()?["']([^"']+)["']\)?/, '$1');
      stream.mustMatch(Tokens.SEMICOLON);
      if (emit) {
        this.fire({
          type: 'namespace',
          prefix,
          uri,
        }, start);
      }
      this._ws();
    }

    _supports(emit = true) {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.SUPPORTS_SYM)) return;

      const start = stream._token;
      this._ws();
      this._supportsCondition();
      stream.mustMatch(Tokens.LBRACE);
      if (emit) this.fire('startsupports', start);
      this._ws();

      for (;; stream.skipComment()) {
        const action = Parser.ACTIONS.supports.get(stream.peek());
        if (action) {
          action.call(this);
        } else if (!this._ruleset()) {
          break;
        }
      }

      stream.mustMatch(Tokens.RBRACE);
      if (emit) this.fire('endsupports');
      this._ws();
    }

    _supportsCondition() {
      const stream = this._tokenStream;
      const next = stream.LT(1);
      if (next.type === Tokens.IDENT && lowerCmp(next.value, 'not')) {
        stream.get();
        stream.mustMatch(Tokens.S);
        this._supportsConditionInParens();
      } else {
        this._supportsConditionInParens();
        while (stream.peek() === Tokens.IDENT) {
          if (/^(and|or)$/i.test(stream.LT(1).value)) {
            stream.get();
            this._ws();
            this._supportsConditionInParens();
          }
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
        if (type === Tokens.IDENT || type === Tokens.CUSTOM_PROP) {
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
      } else if (next.type === Tokens.FUNCTION && lowerCmp(next.value, 'selector(')) {
        stream.get();
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

    _media() {
      const stream = this._tokenStream;
      const start = stream.mustMatch(Tokens.MEDIA_SYM);
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
      while (action ? action.call(this) || true : this._ruleset());

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
      let token = stream.LT(1);
      let ident = token.value;
      if (token.type === Tokens.IDENT && /^(only|not)$/i.test(ident)) {
        stream.get();
      } else {
        token = ident = null;
      }
      this._ws();
      const next = stream.LT(1);
      if (next.type === Tokens.IDENT) {
        token = token || next;
        type = this._mediaFeature();
      } else if (next.type === Tokens.LPAREN) {
        token = token || next;
        expressions.push(this._mediaExpression());
      } else {
        return;
      }
      this._ws();
      while (stream.match(Tokens.IDENT)) {
        if (lowerCmp(stream._token.value, 'and')) {
          this._ws();
          expressions.push(this._mediaExpression());
        } else {
          this._unexpectedToken(stream._token);
        }
      }
      return new MediaQuery(ident, type, expressions, token);
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

    _page() {
      const stream = this._tokenStream;
      let identifier = null;
      let pseudoPage = null;

      // look for @page
      stream.mustMatch(Tokens.PAGE_SYM);
      const start = stream._token;

      this._ws();

      if (stream.match(Tokens.IDENT)) {
        identifier = stream._token.value;

        // The value 'auto' may not be used as a page name and MUST be treated as a syntax error.
        if (lowerCmp(identifier, 'auto')) {
          this._unexpectedToken(stream._token);
        }
      }

      // see if there's a colon upcoming
      if (stream.peek() === Tokens.COLON) {
        pseudoPage = this._pseudoPage();
      }

      this._ws();

      this.fire({
        type:   'startpage',
        id:     identifier,
        pseudo: pseudoPage,
      }, start);

      this._readDeclarations({readMargins: true});

      this.fire({
        type:   'endpage',
        id:     identifier,
        pseudo: pseudoPage,
      });
    }

    _margin() {
      const margin = this._marginSym();
      if (!margin) return false;

      this.fire({
        type: 'startpagemargin',
        margin,
      });

      this._readDeclarations();

      this.fire({
        type: 'endpagemargin',
        margin,
      });

      return true;
    }

    _marginSym() {
      if (this._tokenStream.match(TT.margins)) {
        return SyntaxUnit.fromToken(this._tokenStream._token);
      } else {
        return null;
      }
    }

    _pseudoPage() {
      const stream = this._tokenStream;
      stream.mustMatch(Tokens.COLON, false);
      stream.mustMatch(Tokens.IDENT, false);
      // TODO: CSS3 Paged Media says only "left", "center", and "right" are allowed
      return stream._token.value;
    }

    _fontFace() {
      const stream = this._tokenStream;
      stream.mustMatch(Tokens.FONT_FACE_SYM);

      this.fire('startfontface');

      this._ws();
      this._readDeclarations();

      this.fire('endfontface');
    }

    _viewport() {
      const stream = this._tokenStream;
      const start = stream.mustMatch(Tokens.VIEWPORT_SYM);

      // only viewport-fit is allowed but we're reusing MediaQuery syntax unit,
      // and accept anything for the sake of simplicity since the spec isn't yet final:
      // https://drafts.csswg.org/css-round-display/#extending-viewport-rule
      const descriptors = this._mediaQueryList();

      this.fire({
        type: 'startviewport',
        descriptors,
      }, start);

      this._ws();
      this._readDeclarations();

      this.fire({
        type: 'endviewport',
        descriptors,
      });
    }

    _document() {
      const stream = this._tokenStream;
      const functions = [];
      const start = stream.mustMatch(Tokens.DOCUMENT_SYM);
      const prefix = start.value.split('-')[1] || '';
      do {
        this._ws();
        functions.push(this._documentFunction() || stream.LT(1));
      } while (stream.match(Tokens.COMMA));
      this._ws();
      if (this.options.emptyDocument && stream.peek() !== Tokens.LBRACE) {
        this.fire({type: 'emptydocument', functions, prefix}, start);
        return;
      }
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

      this.fire({
        type: 'startdocument',
        functions,
        prefix,
      }, start);

      this._ws();

      let action;
      do action = Parser.ACTIONS.document.get(stream.peek());
      while (action ? action.call(this) || true : this._ruleset());

      stream.mustMatch(Tokens.RBRACE);

      this.fire({
        type: 'enddocument',
        functions,
        prefix,
      });

      this._ws();
    }

    _documentMisplaced() {
      this.fire({
        type:    'error',
        message: 'Nested @document produces broken code',
      }, this._tokenStream.LT(1));
      this._document();
    }

    _documentFunction() {
      const stream = this._tokenStream;
      if (stream.match(Tokens.URI)) {
        const res = new PropertyValuePart(stream._token);
        this._ws();
        return res;
      }
      return this._function();
    }

    _operator(inFunction) {
      if (this._tokenStream.match(inFunction ? TT.opInFunc : TT.op)) {
        const value = new PropertyValuePart(this._tokenStream._token);
        this._ws();
        return value;
      }
    }

    _combinator() {
      if (this._tokenStream.match(TT.combinator)) {
        const value = new Combinator(this._tokenStream._token);
        this._ws();
        return value;
      }
    }

    _property() {
      const stream = this._tokenStream;
      let value = null;
      let hack = null;
      let tokenValue, token, start;

      // check for star hack - throws error if not allowed
      if (stream.peek() === Tokens.STAR && this.options.starHack) {
        stream.get();
        token = stream._token;
        start = token;
        hack = token.value;
      }

      if (stream.match(TT.identCustom)) {
        token = stream._token;
        tokenValue = token.value;

        // check for underscore hack - no error if not allowed because it's valid CSS syntax
        if (tokenValue.charAt(0) === '_' && this.options.underscoreHack) {
          hack = '_';
          tokenValue = tokenValue.substring(1);
        }

        value = new PropertyName(tokenValue, hack, start || token);
        this._ws();
      }

      return value;
    }

    _ruleset() {
      const stream = this._tokenStream;
      let braceOpened;
      try {
        stream.skipComment();

        if (parserCache.findBlock()) return true;
        parserCache.startBlock();

        const selectors = this._selectorsGroup();
        if (!selectors) {
          parserCache.cancelBlock();
          return false;
        }

        parserCache.adjustBlockStart(selectors[0]);

        this.fire({
          type: 'startrule',
          selectors,
        }, selectors[0]);

        this._readDeclarations({stopAfterBrace: true});
        braceOpened = true;

        this.fire({
          type: 'endrule',
          selectors,
        });

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
      const selectors = [];
      let selector, comma;

      while ((selector = this._selector())) {
        selectors.push(selector);
        this._ws(true);
        comma = this._tokenStream.match(Tokens.COMMA);
        if (!comma) break;
        this._ws(true);
      }

      if (comma) this._unexpectedToken(this._tokenStream.LT(1));

      return selectors.length ? selectors : null;
    }

    _selector() {
      const stream = this._tokenStream;
      const selector = [];
      let nextSelector = null;
      let combinator = null;

      nextSelector = this._simpleSelectorSequence();
      if (!nextSelector) return null;

      selector.push(nextSelector);

      while (true) {
        combinator = this._combinator();

        if (combinator) {
          selector.push(combinator);
          nextSelector = this._simpleSelectorSequence();
          if (nextSelector) {
            selector.push(nextSelector);
            continue;
          }
          this._unexpectedToken(stream.LT(1));
          break;
        }

        if (!this._ws(true)) break;

        // make a fallback whitespace combinator
        const ws = new Combinator(stream._token);
        // look for an explicit combinator
        combinator = this._combinator();

        // selector is required if there's a combinator
        nextSelector = this._simpleSelectorSequence();
        if (nextSelector) {
          selector.push(combinator || ws);
          selector.push(nextSelector);
        } else if (combinator) {
          this._unexpectedToken(stream.LT(1));
        }
      }

      return new Selector(selector, selector[0]);
    }

    _simpleSelectorSequence() {
      const stream = this._tokenStream;
      const start = stream._lt[stream._ltIndex] || stream.LT(1);
      const modifiers = [];
      let text = '';

      const ns = this._namespacePrefix();
      const elementName = this._typeSelector(ns) || this._universal(ns);
      if (elementName) {
        text += elementName;
      } else if (ns) {
        stream.unget();
      }

      while (true) {
        const action = Parser.ACTIONS.simpleSelectorSequence.get(stream.peek());
        const component = action && action.call(this);
        if (!component) break;
        modifiers.push(component);
        text += component;
      }

      return text && new SelectorPart(elementName, modifiers, text, start);
    }

    _typeSelector(ns) {
      const stream = this._tokenStream;
      const nsSupplied = ns !== undefined;
      ns = nsSupplied ? ns : this._namespacePrefix();
      const elementName = this._elementName();

      if (!elementName) {
        if (!nsSupplied && ns && ns.length > 0) stream.unget();
        if (!nsSupplied && ns && ns.length > 1) stream.unget();
        return null;
      }

      if (ns) {
        elementName.text = ns + elementName.text;
        elementName.col -= ns.length;
      }
      return elementName;
    }

    _hash() {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.HASH)) return null;
      return new SelectorSubPart(stream._token.value, 'id', stream._token);
    }

    _class() {
      if (!this._tokenStream.match(Tokens.DOT)) return null;
      this._tokenStream.mustMatch(Tokens.IDENT, false);
      const {value, startLine: line, startCol: col, offset} = this._tokenStream._token;
      return new SelectorSubPart('.' + value, 'class', {line, col: col - 1, offset});
    }

    _elementName() {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.IDENT)) return null;
      return new SelectorSubPart(stream._token.value, 'elementName', stream._token);
    }

    _namespacePrefix() {
      const stream = this._tokenStream;
      const lt = stream._lt;
      const i = stream._ltIndex;
      if ((i < lt.length && lt[i].type || stream.LA(1)) !== Tokens.PIPE &&
          (i + 1 < lt.length && lt[i + 1].type || stream.LA(2)) !== Tokens.PIPE) {
        return null;
      }
      return (stream.match(TT.ns).value || '') + stream.mustMatch(Tokens.PIPE, false).value;
    }

    _universal(ns = this._namespacePrefix()) {
      return `${ns || ''}${this._tokenStream.match(Tokens.STAR).value || ''}` || null;
    }

    _attrib() {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.LBRACKET)) return null;
      const start = stream._token;
      let value = start.value +
        this._ws() +
        (this._namespacePrefix() || '') +
        stream.mustMatch(Tokens.IDENT, false).value +
        this._ws();
      if (stream.match(TT.attrMatch)) {
        value += stream._token.value + this._ws() +
          stream.mustMatch(TT.identString).value +
          this._ws();
        const next = stream.LT(1);
        if (next.type === Tokens.IDENT && /^[is]$/i.test(next.value)) {
          stream.get();
          value += next.value + this._ws();
        }
      }
      stream.mustMatch(Tokens.RBRACKET);
      return new SelectorSubPart(value + ']', 'attribute', start);
    }

    _pseudo() {
      const stream = this._tokenStream;
      let pseudo = null;
      let colons = ':';
      let line, col, offset;

      // read 1 or 2 colons
      if (!stream.match(Tokens.COLON)) return null;
      if (stream.match(Tokens.COLON)) colons += ':';

      if (stream.match(Tokens.IDENT)) {
        pseudo = stream._token.value;
        line = stream._token.startLine;
        col = stream._token.startCol - colons.length;
        offset = stream._token.offset - colons.length;
      } else if (stream.peek() === Tokens.FUNCTION) {
        line = stream.LT(1).startLine;
        col = stream.LT(1).startCol - colons.length;
        offset = stream.LT(1).offset - colons.length;
        if (stream.match(Tokens.FUNCTION)) {
          pseudo =
            stream._token.value +
            this._ws() +
            (this._expression({list: true}) || '') +
            ')';
          stream.mustMatch(Tokens.RPAREN);
        }
      }

      if (pseudo) return new SelectorSubPart(colons + pseudo, 'pseudo', {line, col, offset});

      const startLine = stream.LT(1).startLine;
      const startCol = stream.LT(0).startCol;
      throw new SyntaxError(
        `Expected a 'FUNCTION' or 'IDENT' after colon at line ${startLine}, col ${startCol}.`,
        {startLine, startCol});
    }

    _expression({calc, list} = {}) {
      const chunks = [];
      const stream = this._tokenStream;
      while (stream.get()) {
        const {type, value} = stream._token;
        if (calc && type === Tokens.FUNCTION) {
          if (!RX_CALC.test(value)) this._unexpectedToken();
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
      return chunks.length ? chunks.join('') : null;
    }

    _is() {
      const stream = this._tokenStream;
      if (!stream.match([Tokens.IS, Tokens.ANY, Tokens.WHERE])) return null;

      let arg;
      const start = stream._token;
      const type = lower(Tokens[start.type].name);
      const value =
        start.value +
        this._ws() +
        ((arg = this._selectorsGroup())) +
        this._ws() +
        ')';
      stream.mustMatch(Tokens.RPAREN);

      const subpart = new SelectorSubPart(value, type, start);
      subpart.args = arg;
      return subpart;
    }

    _negation() {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.NOT)) return null;

      const start = stream._token;
      let value = start.value + this._ws();

      const arg = this._selectorsGroup();
      if (!arg) this._unexpectedToken(stream.LT(1));
      const parts = arg[0].parts;
      if (arg.length > 1 ||
          parts.length !== 1 ||
          parts[0].modifiers.length + (parts[0].elementName ? 1 : 0) > 1 ||
          /^:not\b/i.test(parts[0])) {
        this.fire({
          type: 'warning',
          message: `Simple selector expected, but found '${arg.join(', ')}'`,
        }, arg[0]);
      }
      value += arg[0] + this._ws() + ')';
      stream.mustMatch(Tokens.RPAREN);

      const subpart = new SelectorSubPart(value, 'not', start);
      subpart.args.push(arg[0]);
      return subpart;
    }

    _declaration(consumeSemicolon) {
      const stream = this._tokenStream;

      const property = this._property();
      if (!property) {
        return false;
      }

      stream.mustMatch(Tokens.COLON);

      let value = null;
      // whitespace is a part of custom property value
      if (property.text.startsWith('--')) {
        value = this._customProperty();
      } else {
        this._ws();
        value = this._expr();
      }

      // if there's no parts for the value, it's an error
      if (!value || value.length === 0) {
        this._unexpectedToken(stream.LT(1));
      }

      const important = this._prio();

      /*
       * If hacks should be allowed, then only check the root
       * property. If hacks should not be allowed, treat
       * _property or *property as invalid properties.
       */
      let propertyName = property.toString();
      if (this.options.starHack && property.hack === '*' ||
          this.options.underscoreHack && property.hack === '_') {
        propertyName = property.text;
      }

      let invalid = null;
      try {
        validateProperty(propertyName, value);
      } catch (ex) {
        invalid = ex;
      }

      const event = {
        type: 'property',
        property,
        value,
        important,
      };
      if (invalid) {
        event.invalid = invalid;
        event.message = invalid.message;
      }
      this.fire(event, property);

      if (consumeSemicolon) stream.match(Tokens.SEMICOLON);
      return true;
    }

    _prio() {
      const result = this._tokenStream.match(Tokens.IMPORTANT_SYM);
      this._ws();
      return result;
    }

    _expr(inFunction, endToken = Tokens.RPAREN) {
      const stream = this._tokenStream;
      const values = [];

      while (true) {
        let value = this._term(inFunction);
        if (!value && !values.length) return null;

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

        const operator = this._operator(inFunction);
        if (operator) values.push(operator);
      }

      return values[0] ? new PropertyValue(values, values[0]) : null;
    }

    _customProperty() {
      const reader = this._tokenStream._reader;
      const value = [];

      // a custom property value may end before these characters
      // that belong to the parent declaration, not to the custom property
      let end = /[;!})]/;
      const endings = [];

      readValue:
      while (!reader.eof()) {
        const chunk = reader.readMatch(/([^;!'"{}()[\]/]|\/(?!\*))+/y);
        if (chunk) {
          value.push(chunk);
        }

        reader.mark();
        const c = reader.read();
        value.push(c);

        switch (c) {
          case '/':
            value.push(reader.readMatch(/([^*]|\*(?!\/))*(\*\/|$)/y));
            continue;
          case '"':
          case "'":
            reader.reset();
            value.pop();
            value.push(this._tokenStream.readString());
            continue;
          case '{':
            endings.push(end);
            end = '}';
            continue;
          case '(':
            endings.push(end);
            end = ')';
            continue;
          case '[':
            endings.push(end);
            end = ']';
            continue;
          case ';':
          case '!':
            if (endings.length) {
              continue;
            }
            reader.reset();
          // fallthrough
          case '}':
          case ')':
          case ']':
            if (end instanceof RegExp ? !end.test(c) : c !== end) {
              reader.reset();
              return null;
            }
            end = endings.pop();
            if (end) {
              continue;
            }
            if (c === '}' || c === ')') {
              // unget parent }
              reader.reset();
              value.pop();
            }
            break readValue;
        }
      }
      if (!value[0]) return null;
      const token = this._tokenStream._token;
      token.value = value.join('');
      token.type = Tokens.CUSTOM_PROP;
      return new PropertyValue([new PropertyValuePart(token)], token);
    }

    _term(inFunction) {
      const stream = this._tokenStream;
      const unary = stream.match(TT.plusMinus) && stream._token;

      const finalize = (token, value) => {
        if (!token && unary) stream.unget();
        if (!token) return null;
        if (token instanceof SyntaxUnit) return token;
        if (unary) {
          token.startLine = unary.startLine;
          token.startCol = unary.startCol;
          token.value = unary.value + (value || token.value);
        } else if (value) {
          token.value = value;
        }
        return new PropertyValuePart(token);
      };

      // exception for IE filters
      if (stream.peek() === Tokens.IE_FUNCTION && this.options.ieFilters) {
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
        stream.match(inFunction === 'var' ? TT.termVar : TT.term) && stream._token ||
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

      if (asText) return text;

      const unit = new SyntaxUnit(text, start, 'function');
      unit.expr = expr;
      unit.name = name;
      unit.tokenType = Tokens.FUNCTION;
      return unit;
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

      return text.join('');
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
        const {startLine, startCol} = token;
        throw new SyntaxError(
          `Expected a hex color but found '${color}' at line ${startLine}, col ${startCol}.`,
          {startLine, startCol});
      }

      this._ws();
      return token;
    }

    //-----------------------------------------------------------------
    // Animations methods
    //-----------------------------------------------------------------

    _keyframes() {
      const stream = this._tokenStream;
      const token = stream.mustMatch(Tokens.KEYFRAMES_SYM);
      const prefix = /^@-([^-]+)-/.test(token.value) ? RegExp.$1 : '';

      this._ws();
      const name = this._keyframeName();

      stream.mustMatch(Tokens.LBRACE);
      this.fire({
        type: 'startkeyframes',
        name,
        prefix,
      }, token);

      // check for key
      while (true) {
        this._ws();
        const tt = stream.peek();
        if (tt !== Tokens.IDENT && tt !== Tokens.PERCENTAGE) break;
        this._keyframeRule();
      }

      stream.mustMatch(Tokens.RBRACE);
      this.fire({
        type: 'endkeyframes',
        name,
        prefix,
      });
      this._ws();
    }

    _keyframeName() {
      const stream = this._tokenStream;
      stream.mustMatch(TT.identString);
      return SyntaxUnit.fromToken(stream._token);
    }

    _keyframeRule() {
      const keyList = this._keyList();

      this.fire({
        type: 'startkeyframerule',
        keys: keyList,
      }, keyList[0]);

      this._readDeclarations();

      this.fire({
        type: 'endkeyframerule',
        keys: keyList,
      });
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
      let token;

      if (stream.match(Tokens.PERCENTAGE)) {
        return SyntaxUnit.fromToken(stream._token);
      } else if (stream.match(Tokens.IDENT)) {
        token = stream._token;

        if (/from|to/i.test(token.value)) {
          return SyntaxUnit.fromToken(token);
        }

        stream.unget();
      }

      // if it gets here, there wasn't a valid token, so time to explode
      this._unexpectedToken(stream.LT(1));
    }

    //-----------------------------------------------------------------
    // Helper methods
    //-----------------------------------------------------------------

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
      stopAfterBrace = false
    } = {}) {
      const stream = this._tokenStream;
      if (checkStart) stream.mustMatch(Tokens.LBRACE);

      try {
        while (stream.peek() !== Tokens.RBRACE) {
          this._ws(true);
          if (stream.match(Tokens.SEMICOLON) || readMargins && this._margin()) continue;
          if (!this._declaration(true)) break;
        }
        stream.mustMatch(Tokens.RBRACE);
        if (!stopAfterBrace) this._ws();
        return;

      } catch (ex) {
        // if not a syntax error, rethrow it
        if (!(ex instanceof SyntaxError) || this.options.strict) throw ex;

        this.fire(Object.assign({}, ex, {type: 'error', error: ex}));

        switch (stream.advance([Tokens.SEMICOLON, Tokens.RBRACE])) {
          case Tokens.SEMICOLON:
            // see if there's another declaration
            this._readDeclarations({checkStart: false, readMargins, stopAfterBrace});
            return;
          case Tokens.RBRACE:
            // the rule is finished
            return;
          default:
            // rethrow the error because it wasn't handled properly
            throw ex;
        }
      }
    }

    _ws(skipUsoVar) {
      let ws = '';
      const stream = this._tokenStream;
      const tokens = skipUsoVar ? TT.usoS : Tokens.S;
      while (stream.match(tokens)) {
        ws += stream._token.value;
      }
      return ws;
    }

    _unknownSym() {
      const stream = this._tokenStream;
      stream.get();
      const lt0 = stream.LT(0);
      if (this.options.strict) {
        throw new SyntaxError('Unknown @ rule.', lt0);
      }

      this._ws();
      const simpleValue =
        stream.match(TT.identCustom) && SyntaxUnit.fromToken(stream._token) ||
        stream.peek() === Tokens.FUNCTION && this._function({asText: true}) ||
        this._unknownBlock(TT.LParenBracket);

      this._ws();
      const blockValue = this._unknownBlock();
      if (!blockValue) {
        stream.match(Tokens.SEMICOLON);
      }

      this.fire({
        type: 'unknown-at-rule',
        name: lt0.value,
        simpleValue,
        blockValue,
      }, lt0);
      this._ws();
    }

    _unknownBlock(canStartWith = [Tokens.LBRACE]) {
      const stream = this._tokenStream;
      if (!canStartWith.includes(stream.peek())) {
        return null;
      }
      stream.get();
      const start = stream._token;
      const reader = stream._reader;
      reader.mark();
      reader._cursor = start.offset;
      reader._line = start.startLine;
      reader._col = start.startCol;
      const value = [];
      const endings = [];
      let blockEnd;
      while (!reader.eof()) {
        const chunk = reader.readMatch(/[^{}()[\]]*[{}()[\]]?/y);
        const c = chunk.slice(-1);
        value.push(chunk);
        if (c === '{' || c === '(' || c === '[') {
          endings.push(blockEnd);
          blockEnd = c === '{' ? '}' : c === '(' ? ')' : ']';
        } else if (c === '}' || c === ')' || c === ']') {
          if (c !== blockEnd) {
            break;
          }
          blockEnd = endings.pop();
          if (!blockEnd) {
            stream.resetLT();
            return new SyntaxUnit(value.join(''), start);
          }
        }
      }
      reader.reset();
      return null;
    }

    _unexpectedToken(token = this._tokenStream._token) {
      const {value, startLine: line, startCol: col} = token;
      throw new SyntaxError(`Unexpected token '${value}' at line ${line}, col ${col}.`, token);
    }

    _verifyEnd() {
      if (this._tokenStream.LA(1) !== Tokens.EOF) {
        this._unexpectedToken(this._tokenStream.LT(1));
      }
    }

    //-----------------------------------------------------------------
    // Parsing methods
    //-----------------------------------------------------------------

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

    stylesheetMisplaced: new Map([
      [Tokens.CHARSET_SYM, Parser.prototype._charset],
      [Tokens.IMPORT_SYM, Parser.prototype._import],
      [Tokens.NAMESPACE_SYM, Parser.prototype._namespace],
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

  //endregion
  //region Helper functions

  function isHexDigit(c) {
    return (
      c >= '0' && c <= '9' ||
      c >= 'a' && c <= 'f' ||
      c >= 'A' && c <= 'F');
  }

  function isDigit(c) {
    return c >= '0' && c <= '9';
  }

  function isWhitespace(c) {
    return (c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r');
  }

  function isNewLine(c) {
    return (c === '\n' || c === '\r\n' || c === '\r' || c === '\f');
  }

  function isNameStart(c) {
    return (
      c >= 'a' && c <= 'z' ||
      c >= 'A' && c <= 'Z' ||
      c === '_' || c === '\\' ||
      c >= '\u00A0' && c <= '\uFFFF');
  }

  function isNameChar(c) {
    return (c === '-' || c >= '0' && c <= '9' || isNameStart(c));
  }

  function isIdentStart(c) {
    return c === '-' || isNameStart(c);
  }

  function isPseudoElement(pseudo) {
    return pseudo.startsWith('::') ||
           /^:(first-(letter|line)|before|after)$/i.test(pseudo);
  }

  function parseString(str) {
    const replacer = (match, esc) => {
      if (isNewLine(esc)) return '';
      const m = /^[0-9a-f]{1,6}/i.exec(esc);
      return m ? String.fromCodePoint(parseInt(m[0], 16)) : esc;
    };
    // Strip surrounding single/double quotes
    str = str.slice(1, -1);
    return str.replace(/\\(\r\n|[^\r0-9a-f]|[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)/ig, replacer);
  }

  function serializeString(value) {
    const replacer = c => {
      if (c === '"') return '\\' + c;
      // We only escape non-surrogate chars, so using charCodeAt is harmless here.
      const cp = String.codePointAt ? c.codePointAt(0) : c.charCodeAt(0);
      return '\\' + cp.toString(16) + ' ';
    };
    return '"' + value.replace(/["\r\n\f]/g, replacer) + '"';
  }

  //endregion
  //region PUBLIC API

  return {
    css: {
      Colors,
      Combinator,
      Parser,
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
      StringReader,
      SyntaxError,
      SyntaxUnit,
      EventTarget,
      TokenStreamBase,
    },
    cache: parserCache,
  };

  //endregion
})();

self.parserlib.css.Tokens[self.parserlib.css.Tokens.COMMENT].hide = false;
