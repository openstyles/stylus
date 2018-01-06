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

    'appearance':         'none | auto',
    '-moz-appearance':    'none | button | button-arrow-down | button-arrow-next | button-arrow-previous | ' +
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
    '-ms-appearance':     'none | icon | window | desktop | workspace | document | tooltip | dialog | button | ' +
                          'push-button | hyperlink | radio | radio-button | checkbox | menu-item | tab | menu | ' +
                          'menubar | pull-down-menu | pop-up-menu | list-menu | radio-group | checkbox-group | ' +
                          'outline-tree | range | field | combo-box | signature | password | normal',
    '-webkit-appearance': 'none | button | button-bevel | caps-lock-indicator | caret | checkbox | ' +
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
    '-o-appearance':      'none | window | desktop | workspace | document | tooltip | dialog | button | ' +
                          'push-button | hyperlink | radio | radio-button | checkbox | menu-item | tab | menu | ' +
                          'menubar | pull-down-menu | pop-up-menu | list-menu | radio-group | checkbox-group | ' +
                          'outline-tree | range | field | combo-box | signature | password | normal',

    'azimuth': '<azimuth>',

    // B
    'backface-visibility':     'visible | hidden',
    'background':              '[ <bg-layer> , ]* <final-bg-layer>',
    'background-attachment':   '<attachment>#',
    'background-blend-mode':   '<blend-mode>',
    'background-clip':         '<box>#',
    'background-color':        '<color>',
    'background-image':        '<bg-image>#',
    'background-origin':       '<box>#',
    'background-position':     '<bg-position>',
    'background-repeat':       '<repeat-style>#',
    'background-size':         '<bg-size>#',
    'baseline-shift':          'baseline | sub | super | <percentage> | <length>',
    'behavior':                1,
    'binding':                 1,
    'bleed':                   '<length>',
    'bookmark-label':          '<content-list>',
    'bookmark-level':          'none | <integer>',
    'bookmark-state':          'open | closed',
    'bookmark-target':         'none | <uri> | attr()',
    'border':                  '<border-width> || <border-style> || <color>',
    'border-bottom':           '<border-width> || <border-style> || <color>',
    'border-bottom-color':     '<color>',
    'border-bottom-left-radius':  '<x-one-radius>',
    'border-bottom-right-radius': '<x-one-radius>',
    'border-bottom-style':     '<border-style>',
    'border-bottom-width':     '<border-width>',
    'border-collapse':         'collapse | separate',
    'border-color':            '<color>{1,4}',
    'border-image':            '[ none | <image> ] || <border-image-slice> ' +
                               '[ / <border-image-width> | / <border-image-width>? / <border-image-outset> ]? || ' +
                               '<border-image-repeat>',
    'border-image-outset':     '<border-image-outset>',
    'border-image-repeat':     '<border-image-repeat>',
    'border-image-slice':      '<border-image-slice>',
    'border-image-source':     '<image> | none',
    'border-image-width':      '<border-image-width>',
    'border-left':             '<border-width> || <border-style> || <color>',
    'border-left-color':       '<color>',
    'border-left-style':       '<border-style>',
    'border-left-width':       '<border-width>',
    'border-radius':           '<border-radius>',
    'border-right':            '<border-width> || <border-style> || <color>',
    'border-right-color':      '<color>',
    'border-right-style':      '<border-style>',
    'border-right-width':      '<border-width>',
    'border-spacing':          '<length>{1,2}',
    'border-style':            '<border-style>{1,4}',
    'border-top':              '<border-width> || <border-style> || <color>',
    'border-top-color':        '<color>',
    'border-top-left-radius':  '<x-one-radius>',
    'border-top-right-radius': '<x-one-radius>',
    'border-top-style':        '<border-style>',
    'border-top-width':        '<border-width>',
    'border-width':            '<border-width>{1,4}',
    'bottom':                  '<margin-width>',
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
    'caption-side':      'top | bottom',
    'clear':             'none | right | left | both',
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
    'column-rule':       '<border-width> || <border-style> || <color>',
    'column-rule-color': '<color>',
    'column-rule-style': '<border-style>',
    'column-rule-width': '<border-width>',
    'column-span':       'none | all',
    'column-width':      '<length> | auto',
    'columns':           1,
    'content':           'normal | none | <content-list> [ / <string> ]?',
    'counter-increment': 1,
    'counter-reset':     1,
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
    'display':   'inline | block | list-item | inline-block | table | inline-table | ' +
                 'table-row-group | table-header-group | table-footer-group | table-row | ' +
                 'table-column-group | table-column | table-cell | table-caption | grid | ' +
                 'inline-grid | run-in | ruby | ruby-base | ruby-text | ruby-base-container | ' +
                 'ruby-text-container | contents | none | -moz-box | -moz-inline-block | ' +
                 '-moz-inline-box | -moz-inline-grid | -moz-inline-stack | -moz-inline-table | ' +
                 '-moz-grid | -moz-grid-group | -moz-grid-line | -moz-groupbox | -moz-deck | ' +
                 '-moz-popup | -moz-stack | -moz-marker | -webkit-box | -webkit-inline-box | ' +
                 '-ms-flexbox | -ms-inline-flexbox | flex | -webkit-flex | inline-flex | ' +
                 '-webkit-inline-flex',

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
    'drop-initial-size':          'auto | line | <length> | <percentage>',
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
    'float':          'left | right | none',
    'float-offset':   1,
    'flood-color':    1,
    'flood-opacity':  '<opacity-value>',
    'font':           '<font-shorthand> | caption | icon | menu | message-box | small-caption | status-bar',
    'font-family':    '<font-family>',
    'font-feature-settings':   '<feature-tag-value> | normal',
    'font-kerning':            'auto | normal | none',
    'font-size':               '<font-size>',
    'font-size-adjust':        '<number> | none',
    'font-stretch':            '<font-stretch>',
    'font-style':              '<font-style>',
    'font-variant':            '<font-variant> | normal | none',
    'font-variant-alternates': '<font-variant-alternates> | normal',
    'font-variant-caps':       '<font-variant-caps> | normal',
    'font-variant-east-asian': '<font-variant-east-asian> | normal',
    'font-variant-ligatures':  '<font-variant-ligatures> | normal | none',
    'font-variant-numeric':    '<font-variant-numeric> | normal',
    'font-variant-position':   'normal | sub | super',
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
    'hanging-punctuation': 1,
    'height':              '<margin-width> | <content-sizing>',
    'hyphenate-after':     '<integer> | auto',
    'hyphenate-before':    '<integer> | auto',
    'hyphenate-character': '<string> | auto',
    'hyphenate-lines':     'no-limit | <integer>',
    'hyphenate-resource':  1,
    'hyphens':             'none | manual | auto',

    // I
    'icon':              1,
    'image-orientation': 'angle | auto',
    'image-rendering':   'auto | optimizeSpeed | optimizeQuality',
    'image-resolution':  1,
    'ime-mode':          'auto | normal | active | inactive | disabled',
    'inline-box-align':  'last | <integer>',
    'isolation':         'auto | isolate',

    // J
    'justify-content': '<justify-content>',
    'justify-items':   'normal | stretch | <baseline-position> | [ <overflow-position>? <self-position> ] | ' +
                       '[ legacy || [ left | right | center ] ]',
    'justify-self':    '<justify-self>',

    // K
    'kerning': 'auto | <length>',

    // L
    'left':                   '<margin-width>',
    'letter-spacing':         '<length> | normal',
    'line-height':            '<line-height>',
    'line-break':             'auto | loose | normal | strict',
    'line-stacking':          1,
    'line-stacking-ruby':     'exclude-ruby | include-ruby',
    'line-stacking-shift':    'consider-shifts | disregard-shifts',
    'line-stacking-strategy': 'inline-line-height | block-line-height | max-height | grid-height',
    'list-style':             1,
    'list-style-image':       '<uri> | none',
    'list-style-position':    'inside | outside',
    'list-style-type':        'disc | circle | square | decimal | decimal-leading-zero | lower-roman | ' +
                              'upper-roman | lower-greek | lower-latin | upper-latin | armenian | ' +
                              'georgian | lower-alpha | upper-alpha | none',

    // M
    'margin':             '<margin-width>{1,4}',
    'margin-bottom':      '<margin-width>',
    'margin-left':        '<margin-width>',
    'margin-right':       '<margin-width>',
    'margin-top':         '<margin-width>',
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
    'max-height':         '<length> | <percentage> | <content-sizing> | none',
    'max-width':          '<length> | <percentage> | <content-sizing> | none',
    'min-height':         '<length> | <percentage> | <content-sizing> | contain-floats | ' +
                          '-moz-contain-floats | -webkit-contain-floats',
    'min-width':          '<length> | <percentage> | <content-sizing> | contain-floats | ' +
                          '-moz-contain-floats | -webkit-contain-floats',
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
    'opacity':         '<opacity-value>',
    'order':           '<integer>',
    'orphans':         '<integer>',
    'outline':         '[ <color> | invert ] || [ auto | <border-style> ] || <border-width>',
    'outline-color':   '<color> | invert',
    'outline-offset':  '<length>',
    'outline-style':   '<border-style> | auto',
    'outline-width':   '<border-width>',
    'overflow':        '<overflow>',
    'overflow-style':  1,
    'overflow-wrap':   'normal | break-word',
    'overflow-x':      '<overflow>',
    'overflow-y':      '<overflow>',

    // P
    'padding':            '<padding-width>{1,4}',
    'padding-bottom':     '<padding-width>',
    'padding-left':       '<padding-width>',
    'padding-right':      '<padding-width>',
    'padding-top':        '<padding-width>',
    'page':               1,
    'page-break-after':   'auto | always | avoid | left | right',
    'page-break-before':  'auto | always | avoid | left | right',
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
    'resize':           1,
    'rest':             1,
    'rest-after':       1,
    'rest-before':      1,
    'richness':         1,
    'right':            '<margin-width>',
    'rotate':           'none | <number>{3}? <angle>',
    'rotation':         1,
    'rotation-point':   1,
    'row-gap':          '<row-gap>',
    'ruby-align':       1,
    'ruby-overhang':    1,
    'ruby-position':    1,
    'ruby-span':        1,

    // S
    'scale':             'none | <number>{1,3}',
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
    'tab-size':        '<integer> | <length>',
    'target':          1,
    'target-name':     1,
    'target-new':      1,
    'target-position': 1,
    'text-align':      'left | right | center | justify | match-parent | start | end',
    'text-align-last': 1,
    'text-anchor':     'start | middle | end',
    'text-decoration':       '<text-decoration-line> || <text-decoration-style> || <text-decoration-color>',
    'text-decoration-color': '<text-decoration-color>',
    'text-decoration-line':  '<text-decoration-line>',
    'text-decoration-skip':  'none | [ objects || [ spaces | [ leading-spaces || trailing-spaces ] ] || ' +
                             'edges || box-decoration ]',
    'text-decoration-style': '<text-decoration-style>',
    'text-emphasis':    1,
    'text-height':      1,
    'text-indent':      '<length> | <percentage>',
    'text-justify':     'auto | none | inter-word | inter-ideograph | inter-cluster | distribute | kashida',
    'text-outline':     1,
    'text-overflow':    'clip | ellipsis',
    'text-rendering':   'auto | optimizeSpeed | optimizeLegibility | geometricPrecision',
    'text-shadow':      'none | [ [ <color> && <length>{2,3} ] | <length>{2,3} ]#',
    'text-transform':   'capitalize | uppercase | lowercase | none',
    'text-wrap':        'normal | none | avoid',
    'top':              '<margin-width>',
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
    'white-space':          'normal | pre | nowrap | pre-wrap | pre-line | -pre-wrap |' +
                            ' -o-pre-wrap | -moz-pre-wrap | -hp-pre-wrap',
    'white-space-collapse': 1,
    'widows':               '<integer>',
    'width':                '<length> | <percentage> | <content-sizing> | auto',
    'will-change':          '<will-change>',
    'word-break':           'normal | keep-all | break-all',
    'word-spacing':         '<length> | normal',
    'word-wrap':            'normal | break-word',
    'writing-mode':         'horizontal-tb | vertical-rl | vertical-lr | lr-tb | rl-tb | tb-rl | ' +
                            'bt-rl | tb-lr | bt-lr | lr-bt | rl-bt | lr | rl | tb',

    // Z
    'z-index': '<integer> | auto',
    'zoom':    '<number> | <percentage> | normal',
  };

  //endregion
  //region ValidationTypes - definitions

  const ValidationTypes = {
    simple: {
      '<absolute-size>': 'xx-small | x-small | small | medium | large | x-large | xx-large',

      '<animateable-feature>': 'scroll-position | contents | <animateable-feature-name>',
      '<animateable-feature-name>': function (part) {
        return this['<ident>'](part) &&
               !/^(unset|initial|inherit|will-change|auto|scroll-position|contents)$/i.test(part);
      },

      '<angle>': part => part.type === 'angle',

      '<attr-fallback>': part => !/\battr\(/i.test(part.text),

      '<attachment>': 'scroll | fixed | local',

      '<basic-shape>': 'inset() | circle() | ellipse() | polygon()',

      '<bg-image>': '<image> | <gradient> | none',

      '<blend-mode>': 'normal | multiply | screen | overlay | darken | lighten | color-dodge | ' +
                      'color-burn | hard-light | soft-light | difference | exclusion | hue | ' +
                      'saturation | color | luminosity',

      '<border-style>': 'none | hidden | dotted | dashed | solid | double | groove | ridge | inset | outset',

      '<border-width>': '<length> | thin | medium | thick',

      '<box>': 'padding-box | border-box | content-box',

      '<clip-source>': '<uri>',

      '<column-gap>': 'normal | <length> | <percentage>',

      '<content-distribution>': 'space-between | space-around | space-evenly | stretch',
      '<content-position>': 'center | start | end | flex-start | flex-end',

      // https://www.w3.org/TR/css3-sizing/#width-height-keywords
      '<content-sizing>': 'fill-available | -moz-available | -webkit-fill-available | max-content | ' +
                          '-moz-max-content | -webkit-max-content | min-content | -moz-min-content | ' +
                          '-webkit-min-content | fit-content | -moz-fit-content | -webkit-fit-content',

      '<cubic-bezier-timing-function>': 'ease | ease-in | ease-out | ease-in-out | cubic-bezier()',

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

      '<font-size>': '<absolute-size> | <relative-size> | <length> | <percentage>',
      '<font-stretch>': 'normal | ultra-condensed | extra-condensed | condensed | semi-condensed | ' +
                        'semi-expanded | expanded | extra-expanded | ultra-expanded',
      '<font-style>': 'normal | italic | oblique',
      '<font-variant-caps>': 'small-caps | all-small-caps | petite-caps | all-petite-caps | ' +
                             'unicase | titling-caps',
      '<font-variant-css21>': 'normal | small-caps',
      '<font-weight>': 'normal | bold | bolder | lighter | ' +
                       '100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900',

      '<generic-family>': 'serif | sans-serif | cursive | fantasy | monospace',

      '<geometry-box>': '<shape-box> | fill-box | stroke-box | view-box',

      '<glyph-angle>': part => part.type === 'angle' && part.units === 'deg',

      '<gradient>': part =>
        part.type === 'function' &&
        /^(?:-(?:ms|moz|o|webkit)-)?(?:repeating-)?(?:radial-|linear-)?gradient/i.test(part),

      //eslint-disable-next-line no-use-before-define
      '<hex-color>': part => part.tokenType === Tokens.HASH,

      '<icccolor>': 'cielab() | cielch() | cielchab() | icc-color() | icc-named-color()',

      // any identifier
      '<ident>': part => part.type === 'identifier' || part.wasIdent,
      '<ident-not-span>': part => (part.type === 'identifier' || part.wasIdent) && !/^span$/i.test(part.value),
      '<ident-not-generic-family>': function (part) {
        return this['<ident>'](part) && !this['<generic-family>'](part);
      },

      '<image>': '<uri>',

      '<inflexible-breadth>': '<length-percentage> | min-content | max-content | auto',

      '<integer>': part => part.type === 'integer',

      '<length>': part =>
        part.type === 'function' && /^(?:-(?:ms|moz|o|webkit)-)?calc/i.test(part) ||
        part.type === 'length' ||
        part.type === 'number' ||
        part.type === 'integer' ||
        part.text === '0',

      '<length-percentage>': '<length> | <percentage>',

      '<line>': part => part.type === 'integer',

      '<line-height>': '<number> | <length> | <percentage> | normal',

      '<margin-width>': '<length> | <percentage> | auto',

      '<miterlimit>': function (part) {
        return this['<number>'](part) && part.value >= 1;
      },

      '<nonnegative-length-or-percentage>': function (part) {
        return (this['<length>'](part) || this['<percentage>'](part)) &&
               (String(part) === '0' || part.type === 'function' || (part.value) >= 0);
      },
      '<nonnegative-number-or-percentage>': function (part) {
        return (this['<number>'](part) || this['<percentage>'](part)) &&
               (String(part) === '0' || part.type === 'function' || (part.value) >= 0);
      },

      '<number-percentage>': '<number> | <percentage>',

      '<positive-integer>': function (part) {
        return this['<number>'](part) && (part.type === 'function' || part.value > 0);
      },

      //eslint-disable-next-line no-use-before-define
      '<named-color>': part => lower(part.text) in Colors,

      '<number>': function (part) {
        return part.type === 'number' || this['<integer>'](part);
      },

      '<opacity-value>': function (part) {
        return this['<number>'](part) && part.value >= 0 && part.value <= 1;
      },

      '<overflow>': 'visible | hidden | scroll | auto',

      '<overflow-position>': 'unsafe | safe',

      '<padding-width>': '<nonnegative-length-or-percentage>',

      '<percentage>': part => part.type === 'percentage' || String(part) === '0',

      '<relative-size>': 'smaller | larger',

      '<row-gap>': '<column-gap>',

      '<self-position>': 'center | start | end | self-start | self-end | flex-start | flex-end',

      '<shape-box>': '<box> | margin-box',

      '<single-animation-direction>': 'normal | reverse | alternate | alternate-reverse',
      '<single-animation-fill-mode>': 'none | forwards | backwards | both',
      '<single-animation-name>': function (part) {
        return this['<ident>'](part) &&
               /^-?[a-z_][-a-z0-9_]+$/i.test(part) &&
               !/^(none|unset|initial|inherit)$/i.test(part);
      },

      '<step-timing-function>': 'step-start | step-end | steps()',

      '<string>': part => part.type === 'string',

      '<text-decoration-color>': '<color>',

      '<text-decoration-style>': 'solid | double | dotted | dashed | wavy',

      '<time>': part => part.type === 'time',

      '<track-breadth>': '<length-percentage> | <flex> | min-content | max-content | auto',

      '<transform-function>': 'matrix() | translate() | translateX() | translateY() | ' +
                              'scale() | scaleX() | scaleY() | ' +
                              'rotate() | skew() | skewX() | skewY()',

      '<unicode-range>': part => /^U\+[0-9a-f?]{1,6}(-[0-9a-f?]{1,6})?\s*$/i.test(part),

      '<unit>': part => part.text === '%' || lower(part) in UNITS,

      '<uri>': part => part.type === 'uri',

      '<var>': part => {
        //eslint-disable-next-line no-use-before-define
        if (part.tokenType === Tokens.USO_VAR) return true;
        if (part.type !== 'function' || !part.expr) return false;
        const subparts = part.expr.parts;
        return subparts.length &&
          lower(part.name) === 'var' &&
          subparts[0].type === 'custom-property' && (
            subparts.length === 1 ||
            subparts[1].text === ','
          );
      },

      '<width>': '<margin-width>',
    },

    complex: {
      '<align-content>': 'normal | <baseline-position> | <content-distribution> | ' +
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

      '<bg-size>': '[ <length> | <percentage> | auto ]{1,2} | cover | contain',

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
      '<border-image-width>': '[ <length> | <percentage> | <number> | auto ]{1,4}',
      '<border-radius>': '<nonnegative-length-or-percentage>{1,4} [ / <nonnegative-length-or-percentage>{1,4} ]?',

      '<box-shadow>': 'none | <shadow>#',

      '<clip-path>': '<basic-shape> || <geometry-box>',

      '<color>': 'rgb() | rgba() | hsl() | hsla() | hwb() | gray() | device-cmyk() | color() | ' +
                 '<hex-color> | <named-color>',

      '<color-adjuster>': 'red() | green() | blue() | alpha() | a() | rgb() | hue() | ' +
                          'saturation() | lightness() | whiteness() | blackness() | ' +
                          'tint() | shade() | blend() | blenda() | contrast()',

      '<content-list>': '[ <string> | <image> | attr() | content() | leader() | ' +
                        '[ open-quote | close-quote | no-open-quote | no-close-quote ] | ' +
                        '[ target-counter() | target-counters() | target-text() ] ]+',

      // "list of comma and/or white space separated <length>s and
      // <percentage>s".  There is a non-negative constraint.
      '<dasharray>': Matcher =>
         Matcher.cast('<nonnegative-length-or-percentage>')
           .braces(1, Infinity, '#', Matcher.cast(',').question()),

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

      '<grid-line>': 'auto | <ident-not-span> | [ <integer> && <ident-not-span>? ] | ' +
                     '[ span && [ <integer> || <ident-not-span> ] ]',

      '<grid-template>': 'none | [ <grid-template-rows> / <grid-template-columns> ] | ' +
                         '[ <line-names>? <string> <track-size>? <line-names>? ]+ ' +
                         '[ / <explicit-track-list> ]?',
      '<grid-template-columns>': 'none | <track-list> | <auto-track-list>',
      '<grid-template-rows>': '<grid-template-columns>',

      '<justify-content>': 'normal | <content-distribution> | <overflow-position>? ' +
                           '[ <content-position> | left | right ]',

      '<justify-self>': 'auto | normal | stretch | <baseline-position> | <overflow-position>? ' +
                        '[ <self-position> | left | right ]',

      '<line-names>': '<ident-not-span>*',

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

      // inset? && [ <length>{2,4} && <color>? ]
      '<shadow>': Matcher =>
        Matcher.many(
          [true],
          Matcher.cast('<length>').braces(2, 4),
          'inset',
          '<color>'),

      '<single-timing-function>': 'linear | <cubic-bezier-timing-function> | <step-timing-function> | frames()',

      '<text-decoration-line>': 'none | [ underline || overline || line-through || blink ]',

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

      '<x-one-radius>': '[ <length> | <percentage> ]{1,2}',
    },

    functions: {
      'attr': '<ident> [ string | color | url | integer | number | length | angle | time | frequency | <unit> ]? ' +
              '[ , <attr-fallback> ]?',

      'rgb':  '<rgb-color>',
      'rgba': '<rgb-color>',
      'hsl':  '<hsl-color>',
      'hsla': '<hsl-color>',
      'hwb':  '<hsl-color>',
      'gray': '<number> [ / <nonnegative-number-or-percentage> ]? )',
      'device-cmyk': '<number-percentage>{4} [ / <nonnegative-number-or-percentage> ]? , <color>?',

      'color':        '[ <color> | [ <number> | <angle> ] ] <color-adjuster>*',
      'content':      '[ text | before | after | first-letter | marker ]?',
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
      'hue-rotate':  '<angle> | <zero>',
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
      'rotate':     '[ <angle> | <zero> ]',
      'skew':       '[ <angle> | <zero> ] [ , [ <angle> | <zero> ] ]?',
      'skewX':      '[ <angle> | <zero> ]',
      'skewY':      '[ <angle> | <zero> ]',
    },

    functionsMayBeEmpty: new Set([
      // https://drafts.fxtf.org/filter-effects/#supported-filter-functions
      // omitted values default to the initial value for interpolation
      'blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale',
      'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia',
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
  };

  //endregion
  //region Tokens

  /*
   * The following token names are defined in CSS3 Grammar:
   * https://www.w3.org/TR/css3-syntax/#lexical
   */
  const Tokens = [
    // HTML-style comments
    {name: 'CDO'},
    {name: 'CDC'},

    // ignorables
    {name: 'S', whitespace: true},
    {name: 'COMMENT', whitespace: true, comment: true, hide: true},

    // attribute equality
    {name: 'INCLUDES', text: '~='},
    {name: 'DASHMATCH', text: '|='},
    {name: 'PREFIXMATCH', text: '^='},
    {name: 'SUFFIXMATCH', text: '$='},
    {name: 'SUBSTRINGMATCH', text: '*='},

    // identifier types
    {name: 'STRING'},
    {name: 'IDENT'},
    {name: 'HASH'},

    // at-keywords
    {name: 'IMPORT_SYM', text: '@import'},
    {name: 'PAGE_SYM', text: '@page'},
    {name: 'MEDIA_SYM', text: '@media'},
    {name: 'FONT_FACE_SYM', text: '@font-face'},
    {name: 'CHARSET_SYM', text: '@charset'},
    {name: 'NAMESPACE_SYM', text: '@namespace'},
    {name: 'SUPPORTS_SYM', text: '@supports'},
    {name: 'VIEWPORT_SYM', text: ['@viewport', '@-ms-viewport', '@-o-viewport']},
    {name: 'DOCUMENT_SYM', text: ['@document', '@-moz-document']},
    {name: 'UNKNOWN_SYM'}, //{ name: "ATKEYWORD"},

    // CSS3 animations
    {name: 'KEYFRAMES_SYM', text: ['@keyframes', '@-webkit-keyframes', '@-moz-keyframes', '@-o-keyframes']},

    // important symbol
    {name: 'IMPORTANT_SYM'},

    // measurements
    {name: 'LENGTH'},
    {name: 'ANGLE'},
    {name: 'TIME'},
    {name: 'FREQ'},
    {name: 'DIMENSION'},
    {name: 'PERCENTAGE'},
    {name: 'NUMBER'},

    // functions
    {name: 'URI'},
    {name: 'FUNCTION'},

    // Unicode ranges
    {name: 'UNICODE_RANGE'},

    /*
     * The following token names are defined in CSS3 Selectors: https://www.w3.org/TR/css3-selectors/#selector-syntax
     */

    // invalid string
    {name: 'INVALID'},

    // combinators
    {name: 'PLUS', text: '+'},
    {name: 'GREATER', text: '>'},
    {name: 'COMMA', text: ','},
    {name: 'TILDE', text: '~'},

    // modifier
    {name: 'NOT'},
    {name: 'ANY', text: ['any', '-webkit-any', '-moz-any']},

    /*
     * Defined in CSS3 Paged Media
     */
    {name: 'TOPLEFTCORNER_SYM', text: '@top-left-corner'},
    {name: 'TOPLEFT_SYM', text: '@top-left'},
    {name: 'TOPCENTER_SYM', text: '@top-center'},
    {name: 'TOPRIGHT_SYM', text: '@top-right'},
    {name: 'TOPRIGHTCORNER_SYM', text: '@top-right-corner'},
    {name: 'BOTTOMLEFTCORNER_SYM', text: '@bottom-left-corner'},
    {name: 'BOTTOMLEFT_SYM', text: '@bottom-left'},
    {name: 'BOTTOMCENTER_SYM', text: '@bottom-center'},
    {name: 'BOTTOMRIGHT_SYM', text: '@bottom-right'},
    {name: 'BOTTOMRIGHTCORNER_SYM', text: '@bottom-right-corner'},
    {name: 'LEFTTOP_SYM', text: '@left-top'},
    {name: 'LEFTMIDDLE_SYM', text: '@left-middle'},
    {name: 'LEFTBOTTOM_SYM', text: '@left-bottom'},
    {name: 'RIGHTTOP_SYM', text: '@right-top'},
    {name: 'RIGHTMIDDLE_SYM', text: '@right-middle'},
    {name: 'RIGHTBOTTOM_SYM', text: '@right-bottom'},

    /*
     * The following token names are defined in CSS3 Media Queries: https://www.w3.org/TR/css3-mediaqueries/#syntax
     */
    {name: 'RESOLUTION', state: 'media'},

    /*
     * The following token names are not defined in any CSS specification but are used by the lexer.
     */

    // not a real token, but useful for stupid IE filters
    {name: 'IE_FUNCTION'},

    // part of CSS3 grammar but not the Flex code
    {name: 'CHAR'},

    // TODO: Needed?
    // Not defined as tokens, but might as well be
    {name: 'PIPE', text: '|'},
    {name: 'SLASH', text: '/'},
    {name: 'MINUS', text: '-'},
    {name: 'STAR', text: '*'},

    {name: 'LBRACE', text: '{', endChar: '}'},
    {name: 'RBRACE', text: '}'},
    {name: 'LBRACKET', text: '[', endChar: ']'},
    {name: 'RBRACKET', text: ']'},
    {name: 'EQUALS', text: '='},
    {name: 'COLON', text: ':'},
    {name: 'SEMICOLON', text: ';'},
    {name: 'LPAREN', text: '(', endChar: ')'},
    {name: 'RPAREN', text: ')'},
    {name: 'DOT', text: '.'},

    {name: 'USO_VAR', comment: true},
    {name: 'CUSTOM_PROP'},
  ];

  {
    Tokens.UNKNOWN = -1;
    Tokens.unshift({name: 'EOF'});

    const nameMap = [];
    const typeMap = new Map();
    for (let i = 0, len = Tokens.length; i < len; i++) {
      nameMap.push(Tokens[i].name);
      Tokens[Tokens[i].name] = i;
      if (Tokens[i].text) {
        if (Tokens[i].text instanceof Array) {
          for (let j = 0; j < Tokens[i].text.length; j++) {
            typeMap.set(Tokens[i].text[j], i);
          }
        } else {
          typeMap.set(Tokens[i].text, i);
        }
      }
    }

    Tokens.name = function (tt) {
      return nameMap[tt];
    };

    Tokens.type = function (c) {
      return typeMap.get(c) || -1;
    };
  }

  //endregion
  //region lowerCase helper

  const lowercaseCache = new Map();

  function lower(text) {
    if (typeof text !== 'string') text = String(text);
    let result = lowercaseCache.get(text);
    if (result) return result;
    result = text.toLowerCase();
    lowercaseCache.set(text, result);
    return result;
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
  //region PropertyName

  class PropertyName extends SyntaxUnit {

    constructor(text, hack, pos) {
      super(text, pos, TYPES.PROPERTY_NAME_TYPE);
      /**
       * The type of IE hack applied ("*", "_", or null).
       * @type String
       * @property hack
       */
      this.hack = hack;
    }

    toString() {
      return (this.hack || '') + this.text;
    }
  }

  //endregion
  //region PropertyValue

  class PropertyValue extends SyntaxUnit {
    /**
     * Represents a single part of a CSS property value, meaning that it represents
     * just everything single part between ":" and ";". If there are multiple values
     * separated by commas, this type represents just one of the values.
     * @param {String[]} parts An array of value parts making up this value.
     */
    constructor(parts, pos) {
      super(parts.join(' '), pos, TYPES.PROPERTY_VALUE_TYPE);
      this.parts = parts;
    }
  }

  //endregion
  //region PropertyValuePart

  const tokenConverter = new Map();

  class PropertyValuePart extends SyntaxUnit {
    /**
     * Represents a single part of a CSS property value, meaning that it represents
     * just one part of the data between ":" and ";".
     */
    constructor(token) {
      const {value, type} = token;
      super(value, token, TYPES.PROPERTY_VALUE_PART_TYPE);

      this.type = 'unknown';
      this.tokenType = type;
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

    static parseString(str) {
      const replacer = (match, esc) => {
        if (isNewLine(esc)) return '';
        const m = /^[0-9a-f]{1,6}/i.exec(esc);
        return m ? String.fromCodePoint(parseInt(m[0], 16)) : esc;
      };
      // Strip surrounding single/double quotes
      str = str.slice(1, -1);
      return str.replace(/\\(\r\n|[^\r0-9a-f]|[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)/ig, replacer);
    }

    static serializeString(value) {
      const replacer = c => {
        if (c === '"') return '\\' + c;
        // We only escape non-surrogate chars, so using charCodeAt is harmless here.
        const cp = String.codePointAt ? c.codePointAt(0) : c.charCodeAt(0);
        return '\\' + cp.toString(16) + ' ';
      };
      return '"' + value.replace(/["\r\n\f]/g, replacer) + '"';
    }
  }

  [
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

      const text = self.text;
      if (text[0] === '"' &&
          /^"([^\n\r\f\\"]|\\\r\n|\\[^\r0-9a-f]|\\[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)*"/i.test(text)) {
        self.type = 'string';
        self.value = PropertyValuePart.parseString(text);
        return;
      }
      if (text[0] === "'" &&
          /^'([^\n\r\f\\']|\\\r\n|\\[^\r0-9a-f]|\\[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)*'/i.test(text)) {
        self.type = 'string';
        self.value = PropertyValuePart.parseString(text);
      }

    }],
    [Tokens.IDENT, self => {

      const text = self.text;
      let namedColor;
      if (!text.includes('-') && (namedColor = Colors[lower(text)])) {
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
  ].forEach(([tt, fn]) => tokenConverter.set(tt, fn));

  //endregion
  //region SelectorPart

  class SelectorPart extends SyntaxUnit {
    /**
     * Represents a single part of a selector string, meaning a single set of
     * element name and modifiers. This does not include combinators such as
     * spaces, +, >, etc.
     * @param {String} elementName The element name in the selector or null
     *      if there is no element name.
     * @param {Array} modifiers Array of individual modifiers for the element.
     *      The parts that come after the element name, such as class names, IDs, pseudo classes/elements, etc.
     *      May be empty if there are none.
     */
    constructor(elementName, modifiers, text, pos) {
      super(text, pos, TYPES.SELECTOR_PART_TYPE);
      this.elementName = elementName;
      this.modifiers = modifiers;
    }
  }

  //endregion
  //region Specificity

  class Specificity {
    /**
     * Represents a selector's specificity.
     * @namespace parserlib.css
     * @class Specificity
     * @constructor
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
     * Compare this specificity to another.
     * @param {Specificity} other The other specificity to compare to.
     * @return {int} -1 if the other specificity is larger, 1 if smaller, 0 if equal.
     * @method compare
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
     * Creates a numeric value for the specificity.
     * @return {int} The numeric value for the specificity.
     * @method valueOf
     */
    valueOf() {
      return (this.a * 1000) + (this.b * 100) + (this.c * 10) + this.d;
    }

    /**
     * Returns a string representation for specificity.
     * @return {String} The string representation of specificity.
     * @method toString
     */
    toString() {
      return this.a + ',' + this.b + ',' + this.c + ',' + this.d;
    }

    /**
     * Calculates the specificity of the given selector.
     * @param {parserlib.css.Selector} The selector to calculate specificity for.
     * @return {parserlib.css.Specificity} The specificity of the selector.
     * @static
     * @method calculate
     */
    static calculate(selector) {

      let i, len, part;
      let b = 0;
      let c = 0;
      let d = 0;

      function updateValues(part) {

        let i, j, len, num, modifier;
        const elementName = part.elementName ? part.elementName.text : '';

        if (elementName && elementName.charAt(elementName.length - 1) !== '*') {
          d++;
        }

        for (i = 0, len = part.modifiers.length; i < len; i++) {
          modifier = part.modifiers[i];
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
              for (j = 0, num = modifier.args.length; j < num; j++) {
                updateValues(modifier.args[j]);
              }
          }
        }
      }

      for (i = 0, len = selector.parts.length; i < len; i++) {
        part = selector.parts[i];

        if (part instanceof SelectorPart) {
          updateValues(part);
        }
      }

      return new Specificity(0, b, c, d);
    }
  }

  //endregion
  //region SelectorSubPart

  class SelectorSubPart extends SyntaxUnit {
    /**
     * Represents a selector modifier string, meaning a class name, element name,
     * element ID, pseudo rule, etc.
     */
    constructor(text, type, pos) {
      super(text, pos, TYPES.SELECTOR_SUB_PART_TYPE);
      this.type = type;
      // Some subparts have arguments
      this.args = [];
    }
  }

  //endregion
  //region Selector

  class Selector extends SyntaxUnit {
    /**
     * Represents an entire single selector, including all parts but not
     * including multiple selectors (those separated by commas).
     * @param {Array} parts Array of selectors parts making up this selector.
     */
    constructor(parts, pos) {
      super(parts.join(' '), pos, TYPES.SELECTOR_TYPE);
      this.parts = parts;
      this.specificity = Specificity.calculate(this);
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
  //region Combinator

  class Combinator extends SyntaxUnit {
    /**
     * Represents a selector combinator (whitespace, +, >).
     */
    constructor(token) {
      const {value} = token;
      super(value, token, TYPES.COMBINATOR_TYPE);
      this.type =
        value === '>' ? 'child' :
        value === '+' ? 'adjacent-sibling' :
        value === '~' ? 'sibling' :
        !value.trim() ? 'descendant' :
          'unknown';
    }
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
     * Reads characters that match either text or a regular expression and
     * returns those characters. If a match is found, the row and column
     * are adjusted; if no match is found, the reader's state is unchanged.
     * reading or false to stop.
     * @param {String|RegExp} matcher If a string, then the literal string
     *      value is searched for. If a regular expression, then any string
     *      matching the pattern is search for.
     * @return {String} The string made up of all characters that matched or
     *      null if there was no match.
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
     * @return {String} The string made up the read characters.
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

  const cachedMatcher = new Map();

  class Matcher {
    /**
     * This class implements a combinator library for matcher functions.
     * The combinators are described at:
     * https://developer.mozilla.org/en-US/docs/Web/CSS/Value_definition_syntax#Component_value_combinators
     */
    constructor(matchFunc, toString) {
      this.matchFunc = matchFunc;
      this.toString = typeof toString === 'function' ? toString : () => toString;
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
      function eat(matcher) {
        const result = reader.readMatch(matcher);
        if (result === null) {
          throw new SyntaxError('Expected ' + matcher, reader._line, reader._col);
        }
        return result;
      }
      function expr() {
        // expr = oror (" | " oror)*
        const m = [oror()];
        while (reader.readMatch(' | ')) {
          m.push(oror());
        }
        return m.length === 1 ? m[0] : Matcher.alt.apply(Matcher, m);
      }
      function oror() {
        // oror = andand ( " || " andand)*
        const m = [andand()];
        while (reader.readMatch(' || ')) {
          m.push(andand());
        }
        return m.length === 1 ? m[0] : Matcher.oror.apply(Matcher, m);
      }
      function andand() {
        // andand = seq ( " && " seq)*
        const m = [seq()];
        while (reader.readMatch(' && ')) {
          m.push(seq());
        }
        return m.length === 1 ? m[0] : Matcher.andand.apply(Matcher, m);
      }
      function seq() {
        // seq = mod ( " " mod)*
        const m = [mod()];
        while (reader.readMatch(/\s(?![&|\]])/y)) {
          m.push(mod());
        }
        return m.length === 1 ? m[0] : Matcher.seq.apply(Matcher, m);
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
      const result = expr();
      if (!reader.eof()) {
        throw new SyntaxError('Expected end of string', reader._line, reader._col);
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
      m = new Matcher(expr => expr.hasNext() && ValidationTypes.isType(expr, type), type);
      cachedMatcher.set(type, m);
      return m;
    }

    // Matcher for one or more juxtaposed words, which all must occur, in the given order.
    static seq(...args) {
      const ms = args.map(Matcher.cast);
      if (ms.length === 1) return ms[0];
      return new Matcher(
        expression => ms.every(m => m.match(expression)),
        prec => {
          const p = Matcher.prec.SEQ;
          const s = ms.map(m => m.toString(p)).join(' ');
          return prec > p ? `[ ${s} ]` : s;
        });
    }

    // Matcher for one or more alternatives, where exactly one must occur.
    static alt(...args) {
      const ms = args.map(Matcher.cast);
      if (ms.length === 1) return ms[0];
      return new Matcher(
        expression => ms.some(m => m.match(expression)),
        prec => {
          const p = Matcher.prec.ALT;
          const s = ms.map(m => m.toString(p)).join(' | ');
          return prec > p ? `[ ${s} ]` : s;
        });
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

      if (required === true) required = new Array(ms.length).fill(true);

      const result = new Matcher(expression => {
        const seen = [];
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
              expression.drop();
              continue;
            }
            seen[i] = true;
            // Increase matchCount if this was a required element
            // (or if all the elements are optional)
            if (tryMatch(matchCount + (required === false || required[i] ? 1 : 0))) {
              expression.drop();
              return true;
            }
            // Backtrack: try *not* matching using this rule, and
            // let's see if it leads to a better overall match.
            expression.restore();
            seen[i] = false;
          }
          if (pass === 0) {
            max = Math.max(matchCount, max);
            return matchCount === ms.length;
          } else {
            return matchCount === max;
          }
        }

      }, prec => {
        const p = required === false ? Matcher.prec.OROR : Matcher.prec.ANDAND;
        const s = ms.map((m, i) => {
          if (required !== false && !required[i]) {
            return m.toString(Matcher.prec.MOD) + '?';
          }
          return m.toString(p);
        }).join(required === false ? ' || ' : ' && ');
        return prec > p ? `[ ${s} ]` : s;
      });

      result.options = ms;
      return result;
    }

    /**
     * Create a matcher for two or more options, where all options are
     * mandatory but they may appear in any order.
     */
    static andand(...args) {
      return Matcher.many(true, ...args);
    }

    /**
     * Create a matcher for two or more options, where options are
     * optional and may appear in any order, but at least one must be
     * present.
     */
    static oror(...args) {
      return Matcher.many(false, ...args);
    }

    match(expression) {
      // Save/restore marks to ensure that failed matches always restore
      // the original location in the expression.
      expression.mark();

      const result = this.matchFunc(expression);
      if (result) expression.drop();
      else expression.restore();

      return result;
    }

    // This returns a standalone function to do the matching.
    func() {
      return (...args) => this.match(...args);
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
      optSep = optSep && optSep.then(this);
      marker = marker || '{' + min + (min === max ? '' : ',' + max) + '}';

      const matchNext = !optSep
        ? expression => this.match(expression)
        : (expression, i) => (!i ? this : optSep).match(expression);

      const matchFunc = expression => {
        let i = 0;
        while (i < max && matchNext(expression, i)) i++;
        return i >= min;
      };

      return new Matcher(matchFunc, () => this.toString(Matcher.prec.MOD) + marker);
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

  //endregion
  //region MediaFeature

  class MediaFeature extends SyntaxUnit {
    /**
     * Represents a media feature, such as max-width:500.
     * @param {SyntaxUnit} name The name of the feature.
     * @param {SyntaxUnit} value The value of the feature or null if none.
     */
    constructor(name, value) {
      const text = '(' + name + (value !== null ? ':' + value : '') + ')';
      super(text, name, TYPES.MEDIA_FEATURE_TYPE);

      this.name = name;
      this.value = value;
    }
  }

  //endregion
  //region MediaQuery

  class MediaQuery extends SyntaxUnit {
    /**
     * Represents an individual media query.
     * @param {String} modifier The modifier "not" or "only" (or null).
     * @param {String} mediaType The type of media (i.e., "print").
     * @param {Array} parts Array of selectors parts making up this selector.
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
  //region PropertyValueIterator

  class PropertyValueIterator {
    /**
     * A utility class that allows for easy iteration over the various parts of a
     * property value.
     * @param {parserlib.css.PropertyValue} value The property value to iterate over.
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

    previous() {
      return this._i > 0 ? this._parts[--this._i] : null;
    }

    mark() {
      this._marks.push(this._i);
    }

    restore() {
      if (this._marks.length) {
        this._i = this._marks.pop();
      }
    }

    drop() {
      this._marks.pop();
    }
  }

  //endregion
  //region TokenStreamBase

  // lookup table size for TokenStreamBase
  const LT_SIZE = 5;

  class TokenStreamBase {
    /**
     * Generic TokenStream providing base functionality.
     */
    constructor(input) {
      this._reader = new StringReader(input ? input.toString() : '');
      // Token object for the last consumed token.
      this._token = null;
      // Lookahead token buffer.
      this._lt = [];
      this._ltIndex = 0;
      this._ltIndexCache = [];
    }

    /**
     * Determines if the next token matches the given token type.
     * If so, that token is consumed; if not, the token is placed
     * back onto the token stream. You can pass in any number of
     * token types and this will return true if any of the token
     * types is found.
     * @param {int|int[]} tokenTypes Either a single token type or an array of
     *      token types that the next token might be. If an array is passed,
     *      it's assumed that the token can be any of these.
     * @return {Boolean} True if the token type matches, false if not.
     */
    match(tokenTypes) {
      const isArray = Array.isArray(tokenTypes);
      let tt;
      do {
        tt = this.get();
        if (isArray ? tokenTypes.includes(tt) : tt === tokenTypes) {
          return true;
        }
      } while (tt === Tokens.COMMENT && this.LA(0) !== 0);

      // no match found, put the token back
      this.unget();
      return false;
    }

    /**
     * Determines if the next token matches the given token type.
     * If so, that token is consumed; if not, an error is thrown.
     * @param {int|int[]} tokenTypes Either a single token type or an array of
     *      token types that the next token should be. If an array is passed,
     *      it's assumed that the token must be one of these.
     * @return {void}
     */
    mustMatch(tokenTypes) {
      if (!this.match(tokenTypes)) {
        const {startLine: line, startCol: col, offset} = this.LT(1);
        const info = Tokens[Array.isArray(tokenTypes) ? tokenTypes[0] : tokenTypes];
        throw new SyntaxError(`Expected ${info.text || info.name} at line ${line}, col ${col}.`, {line, col, offset});
      }
    }

    /**
     * Keeps reading from the token stream until either one of the specified
     * token types is found or until the end of the input is reached.
     * @param {int|int[]} tokenTypes Either a single token type or an array of
     *      token types that the next token should be. If an array is passed,
     *      it's assumed that the token must be one of these.
     * @return {void}
     */
    advance(tokenTypes) {
      while (this.LA(0) !== 0 && !this.match(tokenTypes)) {
        this.get();
      }
      return this.LA(0);
    }

    /**
     * Consumes the next token from the token stream.
     * @return {int} The token type of the token that was just consumed.
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
     * Looks ahead a certain number of tokens and returns the token type at
     * that position. This will throw an error if you lookahead past the
     * end of input, past the size of the lookahead buffer, or back past
     * the first token in the lookahead buffer.
     * @param {int} The index of the token type to retrieve. 0 for the
     *      current token, 1 for the next, -1 for the previous, etc.
     * @return {int} The token type of the token in the given position.
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
     * Looks ahead a certain number of tokens and returns the token at
     * that position. This will throw an error if you lookahead past the
     * end of input, past the size of the lookahead buffer, or back past
     * the first token in the lookahead buffer.
     * @param {int} The index of the token type to retrieve. 0 for the
     *      current token, 1 for the next, -1 for the previous, etc.
     * @return {Object} The token of the token in the given position.
     */
    LT(index) {
      // lookahead first to prime the token buffer
      this.LA(index);
      // now find the token, subtract one because _ltIndex is already at the next index
      return this._lt[this._ltIndex + index - 1];
    }

    /**
     * Returns the token type for the next token in the stream without
     * consuming it.
     * @return {int} The token type of the next token in the stream.
     */
    peek() {
      return this.LA(1);
    }

    /**
     * Returns the last consumed token to the token stream.
     */
    unget() {
      if (this._ltIndexCache.length) {
        this._ltIndex -= this._ltIndexCache.pop();
        this._token = this._lt[this._ltIndex - 1];
      } else {
        throw new Error('Too much lookahead.');
      }
    }
  }

  //endregion
  //region TokenStream

  class TokenStream extends TokenStreamBase {

    mustMatch(tokenTypes) {
      this._skipUsoVar();
      super.mustMatch(tokenTypes);
    }

    _skipUsoVar() {
      const lt1 = this._lt[this._ltIndex] || this.LT(1);
      if (lt1.type !== Tokens.USO_VAR) return;
      while (this.match([Tokens.USO_VAR, Tokens.S])) { /*NOP*/ }
    }

    /**
     * A token stream that produces CSS tokens.
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

        case null:
          return this.createToken(Tokens.EOF, null, pos);

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
         * - CHAR
         */
        case '|':
        case '~':
        case '^':
        case '$':
        case '*':
          return reader.peek() === '=' ?
            this.comparisonToken(c, pos) :
            this.charToken(c, pos);

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
        case '-':
          // could be closing HTML-style comment or CSS variable
          return (
            reader.peek() === '-' ? (
              /\w/.test(reader.peek(2)) ?
                this.identOrFunctionToken(c, pos) :
                this.htmlCommentEndToken(c, pos)
            ) : (
            isNameStart(reader.peek()) ?
              this.identOrFunctionToken(c, pos) :
              this.charToken(c, pos)
            )
          );

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
         * - NOT
         * - CHAR
         */
        case ':':
          return this.notOrAnyToken(c, pos);

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
      const reader = this._reader;
      let rule = first;
      let tt = Tokens.CHAR;

      /*
       * First, mark where we are. There are only four @ rules,
       * so anything else is really just an invalid token.
       * Basically, if this doesn't match one of the known @
       * rules, just return '@' as an unknown token and allow
       * parsing to continue after that point.
       */
      reader.mark();

      // try to find the at-keyword
      const ident = this.readName();
      rule = first + ident;
      tt = Tokens.type(lower(rule));

      // if it's not valid, use the first character only and reset the reader
      if (tt === Tokens.CHAR || tt === Tokens.UNKNOWN) {
        if (rule.length > 1) {
          tt = Tokens.UNKNOWN_SYM;
        } else {
          tt = Tokens.CHAR;
          rule = first;
          reader.reset();
        }
      }

      return this.createToken(tt, rule, pos);
    }

    /**
     * Produces a character token based on the given character
     * and location in the stream. If there's a special (non-standard)
     * token name, this is used; otherwise CHAR is used.
     * @param {String} c The character for the token.
     */
    charToken(c, pos) {
      let tt = Tokens.type(c);
      const opts = {};

      if (tt === -1) {
        tt = Tokens.CHAR;
      } else {
        opts.endChar = Tokens[tt].endChar;
      }

      return this.createToken(tt, c, pos, opts);
    }

    /**
     * Produces a character token based on the given character
     * and location in the stream. If there's a special (non-standard)
     * token name, this is used; otherwise CHAR is used.
     * @param {String} first The first character for the token.
     */
    commentToken(first, pos) {
      const comment = this.readComment(first);
      const isUsoVar = comment.startsWith('/*[[') && comment.endsWith(']]*/');
      return this.createToken(isUsoVar ? Tokens.USO_VAR : Tokens.COMMENT, comment, pos);
    }

    /**
     * Produces a comparison token based on the given character
     * and location in the stream. The next character must be
     * read and is already known to be an equals sign.
     * @param {String} c The character for the token.
     */
    comparisonToken(c, pos) {
      const reader = this._reader;
      const comparison = c + reader.read();
      const tt = Tokens.type(comparison) || Tokens.CHAR;
      return this.createToken(tt, comparison, pos);
    }

    /**
     * Produces a hash token based on the specified information. The
     * first character provided is the pound sign (#) and then this
     * method reads a name afterward.
     * @param {String} first The first character (#) in the hash name.
     */
    hashToken(first, pos) {
      const name = this.readName(first);
      return this.createToken(Tokens.HASH, name, pos);
    }

    /**
     * Produces a CDO or CHAR token based on the specified information. The
     * first character is provided and the rest is read by the function to determine
     * the correct token to create.
     * @param {String} first The first character in the token.
     */
    htmlCommentStartToken(first, pos) {
      const reader = this._reader;
      let text = first;

      reader.mark();
      text += reader.readCount(3);

      if (text === '<!--') {
        return this.createToken(Tokens.CDO, text, pos);
      } else {
        reader.reset();
        return this.charToken(first, pos);
      }
    }

    /**
     * Produces a CDC or CHAR token based on the specified information. The
     * first character is provided and the rest is read by the function to determine
     * the correct token to create.
     * @param {String} first The first character in the token.
     */
    htmlCommentEndToken(first, pos) {
      const reader = this._reader;
      let text = first;

      reader.mark();
      text += reader.readCount(2);

      if (text === '-->') {
        return this.createToken(Tokens.CDC, text, pos);
      } else {
        reader.reset();
        return this.charToken(first, pos);
      }
    }

    /**
     * Produces an IDENT or FUNCTION token based on the specified information. The
     * first character is provided and the rest is read by the function to determine
     * the correct token to create.
     * @param {String} first The first character in the identifier.
     */
    identOrFunctionToken(first, pos) {
      const reader = this._reader;
      const uriFns = ['url', 'url-prefix', 'domain'];

      const name = this.readName(first);

      switch (reader.peek()) {

        // might be a URI or function
        case '(':
          reader.read();
          if (uriFns.includes(lower(name))) {
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

        // might be an IE function
        case ':':
          // IE-specific functions always being with progid:
          if (lower(name) === 'progid') {
            return this.createToken(Tokens.IE_FUNCTION, name + reader.readTo('('), pos);
          }
      }

      const type = name.startsWith('--') ? Tokens.CUSTOM_PROP : Tokens.IDENT;
      return this.createToken(type, name, pos);
    }

    /**
     * Produces an IMPORTANT_SYM or CHAR token based on the specified information. The
     * first character is provided and the rest is read by the function to determine
     * the correct token to create.
     * @param {String} first The first character in the token.
     */
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

    /**
     * Produces a NOT or ANY or CHAR token based on the specified information. The
     * first character is provided and the rest is read by the function to determine
     * the correct token to create.
     * @param {String} first The first character in the token.
     */
    notOrAnyToken(first, pos) {
      const reader = this._reader;
      const func = reader.readMatch(/not\(|(-(moz|webkit)-)?any\(/iy);
      if (func) {
        const type = /^n/i.test(func) ? Tokens.NOT : Tokens.ANY;
        return this.createToken(type, first + func, pos);
      }
      return this.charToken(first, pos);
    }

    /**
     * Produces a number token based on the given character
     * and location in the stream. This may return a token of
     * NUMBER, EMS, EXS, LENGTH, ANGLE, TIME, FREQ, DIMENSION,
     * or PERCENTAGE.
     * @param {String} first The first character for the token.
     */
    numberToken(first, pos) {
      const reader = this._reader;
      const value = this.readNumber(first);
      let tt = Tokens.NUMBER;
      let units, type;

      const c = reader.peek();
      if (isIdentStart(c)) {
        units = this.readName(reader.read());
        type = UNITS[lower(units)];
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

    /**
     * Produces a string token based on the given character
     * and location in the stream. Since strings may be indicated
     * by single or double quotes, a failure to match starting
     * and ending quotes results in an INVALID token being generated.
     * The first character in the string is passed in and then
     * the rest are read up to and including the final quotation mark.
     * @param {String} first The first character in the string.
     */
    stringToken(first, pos) {
      const delim = first;
      let string = first;
      const reader = this._reader;
      let tt = Tokens.STRING;
      let c = reader.read();
      let i;

      while (c) {
        string += c;

        if (c === '\\') {
          c = reader.read();
          if (c === null) {
            break; // premature EOF after backslash
          } else if (/[^\r\n\f0-9a-f]/i.test(c)) {
            // single-character escape
            string += c;
          } else {
            // read up to six hex digits
            for (i = 0; isHexDigit(c) && i < 6; i++) {
              string += c;
              c = reader.read();
            }
            // swallow trailing newline or space
            if (c === '\r' && reader.peek() === '\n') {
              string += c;
              c = reader.read();
            }
            if (isWhitespace(c)) {
              string += c;
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

      // if c is null, that means we're out of input and the string was never closed
      if (c === null) {
        tt = Tokens.INVALID;
      }

      return this.createToken(tt, string, pos);
    }

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

    /**
     * Produces a S token based on the specified information. Since whitespace
     * may have multiple characters, this consumes all whitespace characters
     * into a single token.
     * @param {String} first The first character in the token.
     */
    whitespaceToken(first, pos) {
      const value = first + this.readWhitespace();
      return this.createToken(Tokens.S, value, pos);
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
        if (value === null) return null;
        value = PropertyValuePart.parseString(value);
      } else {
        value = this.readUnquotedURL();
      }

      this.readWhitespace();
      if (reader.peek() !== ')') return null;

      // Ensure argument to URL is always double-quoted
      // (This simplifies later processing in PropertyValuePart.)
      return {value, text: uri + PropertyValuePart.serializeString(value) + reader.read()};
    }

    // This method never fails, although it may return an empty string.
    readUnquotedURL(first) {
      const reader = this._reader;
      let url = first || '';
      let c;

      for (c = reader.peek(); c; c = reader.peek()) {
        // Note that the grammar at
        // https://www.w3.org/TR/CSS2/grammar.html#scanner
        // incorrectly includes the backslash character in the
        // `url` production, although it is correctly omitted in
        // the `baduri1` production.
        if (/^[\u00A0-\uFFFF]$/.test(c) || /^[-!#$%&*-[\]-~]$/.test(c)) {
          url += c;
          reader.read();
        } else if (c === '\\') {
          if (/^[^\r\n\f]$/.test(reader.peek(2))) {
            url += this.readEscape(reader.read());
          } else {
            break; // bad escape sequence.
          }
        } else {
          break; // bad character
        }
      }

      return url;
    }

    readName(first) {
      const reader = this._reader;
      const ident = [first || ''];

      do {
        const chunk = reader.readMatch(/[-_\da-zA-Z\u00A0-\uFFFF]*/y);
        ident.push(chunk);
        reader.mark();
        const c = reader.read();
        if (c === '\\' && /^[^\r\n\f]$/.test(reader.peek())) {
          ident.push(this.readEscape(c));
        } else {
          reader.reset();
          break;
        }
      } while (true);

      return ident.length > 2 ? ident.join('') : ident.length > 1 ? ident[0] + ident[1] : ident[0];
    }

    readEscape() {
      const cp = this._reader.readMatch(/[0-9a-f]{1,6}\b\s*/iy);
      return cp ? String.fromCodePoint(parseInt(cp, 16)) : this._reader.read();
    }

    readComment(first) {
      return first +
             this._reader.readCount(2 - first.length) +
             this._reader.readMatch(/([^*]|\*(?!\/))*(\*\/|$)/y);
    }
  }

  //-----------------------------------------------------------------------------
  // Helper functions
  //-----------------------------------------------------------------------------

  function isHexDigit(c) {
    return c !== null && (
      c >= '0' && c <= '9' ||
      c >= 'a' && c <= 'f' ||
      c >= 'A' && c <= 'F');
  }

  function isDigit(c) {
    return c !== null && c >= '0' && c <= '9';
  }

  function isWhitespace(c) {
    return c !== null && (c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r');
  }

  function isNewLine(c) {
    return c !== null && (c === '\n' || c === '\r\n' || c === '\r' || c === '\f');
  }

  function isNameStart(c) {
    return c !== null && (
      c >= 'a' && c <= 'z' ||
      c >= 'A' && c <= 'Z' ||
      c === '_' || c === '\\' ||
      c >= '\u00A0' && c <= '\uFFFF');
  }

  function isNameChar(c) {
    return c !== null && (c === '-' || c >= '0' && c <= '9' || isNameStart(c));
  }

  function isIdentStart(c) {
    return c !== null && (c === '-' || isNameStart(c));
  }

  function isPseudoElement(pseudo) {
    if (pseudo.startsWith('::')) return true;
    switch (lower(pseudo)) {
      case ':first-letter':
      case ':first-line':
      case ':before':
      case ':after':
        return true;
    }
  }

  //endregion
  //region ValidationTypes - methods

  Object.assign(ValidationTypes, {

    isLiteral(part, literals) {
      const args = literals.includes(' | ') ? literals.split(' | ') : [literals];
      const {text} = part;
      let textLo;

      for (const arg of args) {

        if (arg[0] === '<') {
          const simple = this.simple[arg];
          if (simple && simple.call(this.simple, part)) {
            return true;
          }
          continue;
        }

        if (arg.endsWith('()')) {
          if (!part.name || part.name.length !== arg.length - 2) continue;
          const name = arg.slice(0, -2);
          if (part.name === name ||
              lower(arg).startsWith((textLo = textLo || lower(text)).slice(0, name.length))) {
            // empty function parameter means the initial value is used
            if (!part.expr) return this.functionsMayBeEmpty.has(name);
            const fn = this.functions[name];
            if (!fn) return true;
            const expression = new PropertyValueIterator(part.expr);
            if (fn.match(expression) && !expression.hasNext()) {
              return true;
            }
            const {text} = expression.value;
            throw new ValidationError(`Expected '${this.explode(String(fn))}' but found '${text}'.`,
              expression.value);
          }
          continue;
        }

        let argLo;
        if (text === arg ||
            (textLo = textLo || lower(text)) === (argLo = argLo || lower(arg)) ||
            text[0] === '-' && (
              textLo.startsWith('-webkit-') ||
              textLo.startsWith('-moz-') ||
              textLo.startsWith('-ms-') ||
              textLo.startsWith('-o-')
            ) && textLo.slice(textLo.indexOf('-', 1) + 1) === argLo) {
          return true;
        }

      }
      return false;
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

    /**
     * Determines if the next part(s) of the given expression
     * are of a given type.
     */
    isType(expression, type) {
      const part = expression.peek();
      let result;

      if (this.simple['<var>'](part)) {
        result = true;

      } else if (type.charAt(0) !== '<') {
        result = this.isLiteral(part, type);

      } else if (this.simple[type]) {
        result = this.simple[type](part);

      } else {
        return this.complex[type] instanceof Matcher ?
          this.complex[type].match(expression) :
          this.complex[type](expression);
      }

      if (result) expression.next();
      return result;
    },
  });

  {
    let action = rule => part => ValidationTypes.isLiteral(part, rule);
    ['simple', 'complex', 'functions'].forEach(name => {
      const set = ValidationTypes[name];
      for (const id in set) {
        const rule = set[id];
        if (typeof rule === 'string') {
          set[id] = Object.defineProperty(action(rule), 'originalText', {value: rule});
        } else if (/^Matcher\s/.test(rule)) {
          set[id] = rule(Matcher);
        }
      }
      action = rule => Matcher.parse(rule);
    });
  }

  //endregion
  //region Validation

  const validationCache = new Map();

  function validateProperty(property, value) {
    // All properties accept some CSS-wide values.
    // https://drafts.csswg.org/css-values-3/#common-keywords
    if (/^(inherit|initial|unset)$/i.test(value.parts[0])) {
      if (value.parts.length > 1) {
        throwEndExpected(value.parts[1], true);
      }
      return;
    }

    const prop = lower(property);
    let known = validationCache.get(prop);
    if (known && known.has(value.text)) return;

    const spec = Properties[prop] || /^-(webkit|moz|ms|o)-(.+)/i.test(prop) && Properties[RegExp.$2];

    if (typeof spec === 'number') return;
    if (!spec && prop.startsWith('-')) return;
    if (!spec) throw new ValidationError(`Unknown property '${property}'.`, property);

    // Property-specific validation.
    const expression = new PropertyValueIterator(value);
    const result = Matcher.parse(spec).match(expression);

    const hasNext = expression.hasNext();
    if (result) {
      if (hasNext) throwEndExpected(expression.next());

    } else {
      if (hasNext && expression._i) {
        throwEndExpected(expression.peek());
      } else {
        const {text} = expression.value;
        throw new ValidationError(`Expected '${ValidationTypes.describe(spec)}' but found '${text}'.`,
          expression.value);
      }
    }

    if (!known) validationCache.set(prop, (known = new Set()));
    known.add(value.text);

    function throwEndExpected(token, force) {
      if (force || token.name !== 'var' || token.type !== 'function') {
        throw new ValidationError(`Expected end of value but found '${token.text}'.`, token);
      }
    }
  }

  //endregion
  //region Parser

  class Parser extends EventTarget {
    /**
     * A CSS3 parser.
     * @param {Object} options (Optional) Various options for the parser:
     *      starHack (true|false) to allow IE6 star hack as valid,
     *      underscoreHack (true|false) to interpret leading underscores
     *      as IE6-7 targeting for known properties, ieFilters (true|false)
     *      to indicate that IE < 8 filters should be accepted and not throw
     *      syntax errors.
     */
    constructor(options) {
      super();
      this.options = options || {};
      this._tokenStream = null;
    }

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
      return super.fire(event);
    }
    /*
     * stylesheet
     *  : [ CHARSET_SYM S* STRING S* ';' ]?
     *    [S|CDO|CDC]* [ import [S|CDO|CDC]* ]*
     *    [ namespace [S|CDO|CDC]* ]*
     *    [ [ ruleset | media | page | font_face | keyframes_rule | supports_rule ] [S|CDO|CDC]* ]*
     *  ;
     */
    _stylesheet() {
      const stream = this._tokenStream;
      let tt;

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

      while ((tt = stream.peek()) > Tokens.EOF) {
        try {
          switch (tt) {

            case Tokens.MEDIA_SYM:
              this._media();
              this._skipCruft();
              continue;

            case Tokens.PAGE_SYM:
              this._page();
              this._skipCruft();
              continue;

            case Tokens.FONT_FACE_SYM:
              this._fontFace();
              this._skipCruft();
              continue;

            case Tokens.KEYFRAMES_SYM:
              this._keyframes();
              this._skipCruft();
              continue;

            case Tokens.VIEWPORT_SYM:
              this._viewport();
              this._skipCruft();
              continue;

            case Tokens.DOCUMENT_SYM:
              this._document();
              this._skipCruft();
              continue;

            case Tokens.SUPPORTS_SYM:
              this._supports();
              this._skipCruft();
              continue;

            case Tokens.UNKNOWN_SYM: {
              stream.get();
              const lt0 = stream.LT(0);
              if (this.options.strict) {
                throw new SyntaxError('Unknown @ rule.', lt0);
              }

              this.fire({
                type:    'error',
                error:   null,
                message: 'Unknown @ rule: ' + lt0.value + '.',
              }, lt0);

              // skip {} block
              let count = 0;
              do {
                const brace = stream.advance([Tokens.LBRACE, Tokens.RBRACE]);
                count += brace === Tokens.LBRACE ? 1 : -1;
              } while (count > 0 && !stream._reader.eof());
              if (count < 0) stream.unget();
              continue;
            }
            case Tokens.S:
              this._ws();
              continue;

            default: {
              if (this._ruleset()) continue;

              let token;
              // error handling for known issues
              switch (tt) {
                case Tokens.CHARSET_SYM:
                  token = stream.LT(1);
                  this._charset(false);
                  throw new SyntaxError('@charset not allowed here.', token);

                case Tokens.IMPORT_SYM:
                  token = stream.LT(1);
                  this._import(false);
                  throw new SyntaxError('@import not allowed here.', token);

                case Tokens.NAMESPACE_SYM:
                  token = stream.LT(1);
                  this._namespace(false);
                  throw new SyntaxError('@namespace not allowed here.', token);

                default:
                  stream.get();
                  this._unexpectedToken(stream._token);
              }
            }
          }
        } catch (ex) {
          if (ex instanceof SyntaxError && !this.options.strict) {
            this.fire(Object.assign({}, ex, {type: 'error', error: ex}));
          } else {
            throw ex;
          }
        }
      }

      if (stream.peek() !== Tokens.EOF) {
        this._unexpectedToken(stream._token);
      }

      this.fire('endstylesheet');
    }

    _charset(emit) {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.CHARSET_SYM)) return;

      const start = stream._token;
      this._ws();

      stream.mustMatch(Tokens.STRING);
      const charset = stream._token.value;
      this._ws();

      stream.mustMatch(Tokens.SEMICOLON);

      if (emit !== false) {
        this.fire({
          type: 'charset',
          charset,
        }, start);
      }
    }

    _import(emit) {
      /*
       * import
       *   : IMPORT_SYM S*
       *    [STRING|URI] S* media_query_list? ';' S*
       */
      const stream = this._tokenStream;

      stream.mustMatch(Tokens.IMPORT_SYM);
      const start = stream._token;

      this._ws();
      stream.mustMatch([Tokens.STRING, Tokens.URI]);
      const uri = stream._token.value.replace(/^(?:url\()?["']?([^"']+?)["']?\)?$/, '$1');

      this._ws();
      const mediaList = this._mediaQueryList();

      // must end with a semicolon
      stream.mustMatch(Tokens.SEMICOLON);
      this._ws();

      if (emit !== false) {
        this.fire({
          type: 'import',
          media: mediaList,
          uri,
        }, start);
      }

    }

    /*
     * namespace
     *   : NAMESPACE_SYM S* [namespace_prefix S*]? [STRING|URI] S* ';' S*
     */
    _namespace(emit) {
      const stream = this._tokenStream;
      let prefix;

      // read import symbol
      stream.mustMatch(Tokens.NAMESPACE_SYM);
      const start = stream._token;
      this._ws();

      // it's a namespace prefix - no _namespace_prefix() method because it's just an IDENT
      if (stream.match(Tokens.IDENT)) {
        prefix = stream._token.value;
        this._ws();
      }

      stream.mustMatch([Tokens.STRING, Tokens.URI]);
      const uri = stream._token.value.replace(/(?:url\()?["']([^"']+)["']\)?/, '$1');

      this._ws();

      stream.mustMatch(Tokens.SEMICOLON);
      this._ws();

      if (emit !== false) {
        this.fire({
          type: 'namespace',
          prefix,
          uri,
        }, start);
      }
    }

    /*
     * supports_rule
     *  : SUPPORTS_SYM S* supports_condition S* group_rule_body
     *  ;
     */
    _supports(emit) {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.SUPPORTS_SYM)) return;

      const start = stream._token;
      this._ws();

      this._supportsCondition();
      this._ws();

      stream.mustMatch(Tokens.LBRACE);
      this._ws();

      if (emit !== false) {
        this.fire('startsupports', start);
      }

      while (this._ruleset()) { /*NOP*/ }

      let error;
      const token = stream.LT(1);
      if (token.type === Tokens.MEDIA_SYM) {
        this._media();
        error = new SyntaxError('@media not allowed here.', token);
      }

      stream.mustMatch(Tokens.RBRACE);

      if (emit !== false) {
        this.fire('endsupports');
      }

      this._ws();

      if (error) throw error;
    }

    /*
     * supports_condition
     *  : supports_negation | supports_conjunction | supports_disjunction |
     *    supports_condition_in_parens
     *  ;
     */
    _supportsCondition() {
      const stream = this._tokenStream;
      if (stream.match(Tokens.IDENT)) {
        const ident = lower(stream._token.value);
        if (ident === 'not') {
          stream.mustMatch(Tokens.S);
          this._supportsConditionInParens();
        } else {
          stream.unget();
        }
      } else {
        this._supportsConditionInParens();
        this._ws();
        while (stream.peek() === Tokens.IDENT) {
          const ident = lower(stream.LT(1).value);
          if (ident === 'and' || ident === 'or') {
            stream.mustMatch(Tokens.IDENT);
            this._ws();
            this._supportsConditionInParens();
            this._ws();
          }
        }
      }
    }

    /*
     * supports_condition_in_parens
     *  : ( '(' S* supports_condition S* ')' ) | supports_declaration_condition |
     *    general_enclosed
     *  ;
     */
    _supportsConditionInParens() {
      const stream = this._tokenStream;
      if (stream.match(Tokens.LPAREN)) {
        this._ws();
        if (stream.match(Tokens.IDENT)) {
          // look ahead for not keyword,
          // if not given, continue with declaration condition.
          const ident = lower(stream._token.value);
          if (ident === 'not') {
            this._ws();
            this._supportsCondition();
            this._ws();
            stream.mustMatch(Tokens.RPAREN);
          } else {
            stream.unget();
            this._supportsDeclarationCondition(false);
          }
        } else {
          this._supportsCondition();
          this._ws();
          stream.mustMatch(Tokens.RPAREN);
        }
      } else {
        this._supportsDeclarationCondition();
      }
    }

    /*
     * supports_declaration_condition
     *  : '(' S* declaration ')'
     *  ;
     */
    _supportsDeclarationCondition(requireStartParen) {
      if (requireStartParen !== false) {
        this._tokenStream.mustMatch(Tokens.LPAREN);
      }
      this._ws();
      this._declaration();
      this._tokenStream.mustMatch(Tokens.RPAREN);
    }

    /*
     * media
     *   : MEDIA_SYM S* media_query_list S* '{' S* ruleset* '}' S*
     *   ;
     */
    _media() {
      const stream = this._tokenStream;

      stream.mustMatch(Tokens.MEDIA_SYM);
      const start = stream._token;

      this._ws();
      const mediaList = this._mediaQueryList();

      stream.mustMatch(Tokens.LBRACE);
      this._ws();

      this.fire({
        type: 'startmedia',
        media: mediaList,
      }, start);

      const actions = new Map([
        [Tokens.PAGE_SYM, this._page],
        [Tokens.FONT_FACE_SYM, this._fontFace],
        [Tokens.VIEWPORT_SYM, this._viewport],
        [Tokens.DOCUMENT_SYM, this._document],
        [Tokens.SUPPORTS_SYM, this._supports],
        [Tokens.MEDIA_SYM, this._media],
      ]);
      let action;
      do action = actions.get(stream.peek());
      while (action ? action.call(this) || true : this._ruleset());

      stream.mustMatch(Tokens.RBRACE);

      this.fire({
        type: 'endmedia',
        media: mediaList,
      });

      this._ws();
    }

    /*
     * media_query_list
     *   : S* [media_query [ ',' S* media_query ]* ]?
     *   ;
     */
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

    /*
     * Note: "expression" in the grammar maps to the _media_expression method.
     *
     * media_query
     *   : [ONLY | NOT]? S* media_type S* [ AND S* expression ]*
     *   | expression [ AND S* expression ]*
     *   ;
     */
    _mediaQuery() {
      const stream = this._tokenStream;
      let type = null;
      let ident = null;
      let token = null;
      const expressions = [];

      if (stream.match(Tokens.IDENT)) {
        ident = lower(stream._token.value);

        // since there's no custom tokens for these, need to manually check
        if (ident !== 'only' && ident !== 'not') {
          stream.unget();
          ident = null;
        } else {
          token = stream._token;
        }
      }

      this._ws();

      if (stream.peek() === Tokens.IDENT) {
        type = this._mediaType();
        if (token === null) {
          token = stream._token;
        }
      } else if (stream.peek() === Tokens.LPAREN) {
        if (token === null) {
          token = stream.LT(1);
        }
        expressions.push(this._mediaExpression());
      }

      if (type === null && expressions.length === 0) return null;

      this._ws();
      while (stream.match(Tokens.IDENT)) {
        if (lower(stream._token.value) !== 'and') {
          this._unexpectedToken(stream._token);
        }
        this._ws();
        expressions.push(this._mediaExpression());
      }

      return new MediaQuery(ident, type, expressions, token);
    }

    /*
     * media_type
     *   : IDENT
     *   ;
     */
    _mediaType() {
      return this._mediaFeature();
    }

    /**
     * Note: in CSS3 Media Queries, this is called "expression".
     * Renamed here to avoid conflict with CSS3 Selectors
     * definition of "expression". Also note that "expr" in the
     * grammar now maps to "expression" from CSS3 selectors.
     * @method _media_expression
     * @private
     *
     * expression
     *  : '(' S* media_feature S* [ ':' S* expr ]? ')' S*
     *  ;
     */
    _mediaExpression() {
      const stream = this._tokenStream;
      let feature = null;
      let token;
      let expression = null;

      stream.mustMatch(Tokens.LPAREN);

      feature = this._mediaFeature();
      this._ws();

      if (stream.match(Tokens.COLON)) {
        this._ws();
        token = stream.LT(1);
        expression = this._expression();
      }

      stream.mustMatch(Tokens.RPAREN);
      this._ws();

      return new MediaFeature(feature, expression ? new SyntaxUnit(expression, token) : null);
    }

    /*
     * media_feature
     *   : IDENT
     *   ;
     */
    _mediaFeature() {
      this._ws();
      this._tokenStream.mustMatch(Tokens.IDENT);
      return SyntaxUnit.fromToken(this._tokenStream._token);
    }

    /*
     * page:
     *    PAGE_SYM S* IDENT? pseudo_page? S*
     *    '{' S* [ declaration | margin ]? [ ';' S* [ declaration | margin ]? ]* '}' S*
     *    ;
     */
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
        if (lower(identifier) === 'auto') {
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

    /*
     * margin :
     *    margin_sym S* '{' declaration [ ';' S* declaration? ]* '}' S*
     *    ;
     */
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

    /*
     * margin_sym :
     *    TOPLEFTCORNER_SYM |
     *    TOPLEFT_SYM |
     *    TOPCENTER_SYM |
     *    TOPRIGHT_SYM |
     *    TOPRIGHTCORNER_SYM |
     *    BOTTOMLEFTCORNER_SYM |
     *    BOTTOMLEFT_SYM |
     *    BOTTOMCENTER_SYM |
     *    BOTTOMRIGHT_SYM |
     *    BOTTOMRIGHTCORNER_SYM |
     *    LEFTTOP_SYM |
     *    LEFTMIDDLE_SYM |
     *    LEFTBOTTOM_SYM |
     *    RIGHTTOP_SYM |
     *    RIGHTMIDDLE_SYM |
     *    RIGHTBOTTOM_SYM
     *    ;
     */
    _marginSym() {
      if (this._tokenStream.match([
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
      ])) {
        return SyntaxUnit.fromToken(this._tokenStream._token);
      } else {
        return null;
      }
    }

    /*
     * pseudo_page
     *   : ':' IDENT
     *   ;
     */
    _pseudoPage() {
      const stream = this._tokenStream;
      stream.mustMatch(Tokens.COLON);
      stream.mustMatch(Tokens.IDENT);
      // TODO: CSS3 Paged Media says only "left", "center", and "right" are allowed
      return stream._token.value;
    }

    /*
     * font_face
     *   : FONT_FACE_SYM S*
     *     '{' S* declaration [ ';' S* declaration ]* '}' S*
     *   ;
     */
    _fontFace() {
      const stream = this._tokenStream;
      stream.mustMatch(Tokens.FONT_FACE_SYM);

      this.fire('startfontface');

      this._ws();
      this._readDeclarations();

      this.fire('endfontface');
    }

    /*
     * viewport
     *   : VIEWPORT_SYM S*
     *     '{' S* declaration? [ ';' S* declaration? ]* '}' S*
     *   ;
     */
    _viewport() {
      const stream = this._tokenStream;
      stream.mustMatch(Tokens.VIEWPORT_SYM);

      this.fire('startviewport');

      this._ws();
      this._readDeclarations();

      this.fire('endviewport');
    }

    /*
     * document
     *   : DOCUMENT_SYM S*
     *     _document_function [ ',' S* _document_function ]* S*
     *     '{' S* ruleset* '}'
     *   ;
     */
    _document() {
      const stream = this._tokenStream;
      const functions = [];
      let prefix = '';

      stream.mustMatch(Tokens.DOCUMENT_SYM);
      const start = stream._token;
      if (/^@-([^-]+)-/.test(start.value)) {
        prefix = RegExp.$1;
      }

      do {
        this._ws();
        functions.push(this._documentFunction());
      } while (stream.match(Tokens.COMMA));

      this._ws();
      stream.mustMatch(Tokens.LBRACE);

      this.fire({
        type: 'startdocument',
        functions,
        prefix,
      }, start);

      this._ws();

      const actions = new Map([
        [Tokens.PAGE_SYM, this._page],
        [Tokens.FONT_FACE_SYM, this._fontFace],
        [Tokens.VIEWPORT_SYM, this._viewport],
        [Tokens.DOCUMENT_SYM, this._document],
        [Tokens.SUPPORTS_SYM, this._supports],
        [Tokens.MEDIA_SYM, this._media],
        [Tokens.KEYFRAMES_SYM, this._keyframes],
      ]);
      let action;
      do action = actions.get(stream.peek());
      while (action ? action.call(this) || true : this._ruleset());

      stream.mustMatch(Tokens.RBRACE);

      this.fire({
        type: 'enddocument',
        functions,
        prefix,
      });

      this._ws();
    }

    /*
     * document_function
     *   : function | URI S*
     *   ;
     */
    _documentFunction() {
      const stream = this._tokenStream;
      return stream.match(Tokens.URI) ?
        new PropertyValuePart(stream._token) :
        this._function();
    }

    /*
     * operator (outside function)
     *  : '/' S* | ',' S* | /( empty )/
     * operator (inside function)
     *  : '/' S* | '+' S* | '*' S* | '-' S* /( empty )/
     *  ;
     */
    _operator(inFunction) {
      if (this._tokenStream.match([
        Tokens.SLASH,
        Tokens.COMMA,
        ...(!inFunction ? [] : [
          Tokens.PLUS,
          Tokens.STAR,
          Tokens.MINUS,
        ])
      ])) {
        const value = new PropertyValuePart(this._tokenStream._token);
        this._ws();
        return value;
      }
      return null;
    }

    /*
     * combinator
     *  : PLUS S* | GREATER S* | TILDE S* | S+
     *  ;
     */
    _combinator() {
      if (this._tokenStream.match([Tokens.PLUS, Tokens.GREATER, Tokens.TILDE])) {
        const value = new Combinator(this._tokenStream._token);
        this._ws();
        return value;
      }
      return null;
    }

    /*
     * unary_operator
     *  : '-' | '+'
     *  ;
     */
    _unaryOperator() {
      return this._tokenStream.match([Tokens.MINUS, Tokens.PLUS]) ?
        this._tokenStream._token.value :
        null;
    }

    /*
     * property
     *   : IDENT S*
     *   ;
     */
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

      if (stream.match([Tokens.IDENT, Tokens.CUSTOM_PROP])) {
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

    /*
     * ruleset
     *   : selectors_group
     *     '{' S* declaration? [ ';' S* declaration? ]* '}' S*
     *   ;
     */
    _ruleset() {
      try {
        this._tokenStream._skipUsoVar();

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
        if (this._tokenStream.advance([Tokens.RBRACE]) !== Tokens.RBRACE) throw ex;
        // If even a single selector fails to parse, the entire ruleset should be thrown away,
        // so we let the parser continue with the next one
        return true;
      }
    }

    /*
     * selectors_group
     *   : selector [ COMMA S* selector ]*
     *   ;
     */
    _selectorsGroup() {
      const selectors = [];
      let selector, comma;

      while ((selector = this._selector())) {
        selectors.push(selector);
        this._ws();
        comma = this._tokenStream.match(Tokens.COMMA);
        if (!comma) break;
        this._ws();
      }

      if (comma) this._unexpectedToken(this._tokenStream.LT(1));

      return selectors.length ? selectors : null;
    }

    /*
     * selector
     *   : simple_selector_sequence [ combinator simple_selector_sequence ]*
     *   ;
     */
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

        if (!this._ws()) break;

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

    /*
     * simple_selector_sequence
     *   : [ type_selector | universal ]
     *     [ HASH | class | attrib | pseudo | any | negation ]*
     *   | [ HASH | class | attrib | pseudo | any | negation ]+
     *   ;
     */
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
        const next = stream.peek();
        const component =
          next === Tokens.HASH && this._hash() ||
          next === Tokens.DOT && this._class() ||
          next === Tokens.LBRACKET && this._attrib() ||
          next === Tokens.COLON && this._pseudo() ||
          next === Tokens.ANY && this._any() ||
          next === Tokens.NOT && this._negation();
        if (!component) break;
        modifiers.push(component);
        text += component.toString();
      }

      return text && new SelectorPart(elementName, modifiers, text, start);
    }

    /*
     * type_selector
     *   : [ namespace_prefix ]? element_name
     *   ;
     */
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

    /*
     * class
     *   : '.' IDENT
     *   ;
     */
    _class() {
      if (!this._tokenStream.match(Tokens.DOT)) return null;
      this._tokenStream.mustMatch(Tokens.IDENT);
      const {value, startLine: line, startCol: col, offset} = this._tokenStream._token;
      return new SelectorSubPart('.' + value, 'class', {line, col: col - 1, offset});
    }

    /*
     * element_name
     *   : IDENT
     *   ;
     */
    _elementName() {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.IDENT)) return null;
      return new SelectorSubPart(stream._token.value, 'elementName', stream._token);
    }

    /*
     * namespace_prefix
     *   : [ IDENT | '*' ]? '|'
     *   ;
     */
    _namespacePrefix() {
      const stream = this._tokenStream;
      const lt = stream._lt;
      const i = stream._ltIndex;
      if ((i < lt.length && lt[i].type || stream.LA(1)) !== Tokens.PIPE &&
          (i + 1 < lt.length && lt[i + 1].type || stream.LA(2)) !== Tokens.PIPE) {
        return null;
      }
      let value = '';
      if (stream.match([Tokens.IDENT, Tokens.STAR])) {
        value += stream._token.value;
      }
      stream.mustMatch(Tokens.PIPE);
      return value + '|';
    }

    /*
     * universal
     *   : [ namespace_prefix ]? '*'
     *   ;
     */
    _universal(ns = this._namespacePrefix()) {
      return ((ns || '') + (this._tokenStream.match(Tokens.STAR) ? '*' : '')) || null;
    }

    /*
     * attrib
     *   : '[' S* [ namespace_prefix ]? IDENT S*
     *         [ [ PREFIXMATCH |
     *             SUFFIXMATCH |
     *             SUBSTRINGMATCH |
     *             '=' |
     *             INCLUDES |
     *             DASHMATCH ] S* [ IDENT | STRING ] S*
     *         ]? ']'
     *   ;
     */
    _attrib() {
      const stream = this._tokenStream;

      if (!stream.match(Tokens.LBRACKET)) return null;

      const token = stream._token;
      let value =
        token.value +
        this._ws() +
        (this._namespacePrefix() || '');

      stream.mustMatch(Tokens.IDENT);
      value +=
        stream._token.value +
        this._ws();

      if (stream.match([
        Tokens.PREFIXMATCH,
        Tokens.SUFFIXMATCH,
        Tokens.SUBSTRINGMATCH,
        Tokens.EQUALS,
        Tokens.INCLUDES,
        Tokens.DASHMATCH
      ])) {
        value += stream._token.value +
                 this._ws();

        stream.mustMatch([Tokens.IDENT, Tokens.STRING]);
        value += stream._token.value +
                 this._ws();

        if (stream.match([Tokens.IDENT])) {
          if (lower(stream._token.value) === 'i') {
            value += stream._token.value +
                     this._ws();
          } else {
            stream.unget();
          }
        }
      }

      stream.mustMatch(Tokens.RBRACKET);

      return new SelectorSubPart(value + ']', 'attribute', token);
    }

    /*
     * pseudo
     *   : ':' ':'? [ IDENT | functional_pseudo ]
     *   ;
     */
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

    /*
     * expression
     *   : [ [ PLUS | '-' | DIMENSION | NUMBER | STRING | IDENT ] S* ]+
     *   ;
     */
    _expression({list = false} = {}) {
      const stream = this._tokenStream;
      let value = '';

      while (stream.match([
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
        list && Tokens.COMMA,
      ])) {
        value += stream._token.value;
        value += this._ws();
      }

      return value.length ? value : null;
    }

    /*
     * any
     *   : ANY S* any_arg S* ')'
     *   ;
     */
    _any() {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.ANY)) return null;

      const start = stream._token;
      let value = stream._token.value + this._ws();

      const arg = this._selectorsGroup();
      value += arg + this._ws();

      stream.match(Tokens.RPAREN);
      value += stream._token.value;

      const subpart = new SelectorSubPart(value, 'any', start);
      subpart.args.push(arg);
      return subpart;
    }

    /*
     * negation
     *   : NOT S* negation_arg S* ')'
     *   ;
     */
    _negation() {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.NOT)) return null;

      const start = stream._token;
      let value = stream._token.value + this._ws();

      const arg = this._negationArg();
      value += arg + this._ws();

      stream.match(Tokens.RPAREN);
      value += stream._token.value;

      const subpart = new SelectorSubPart(value, 'not', start);
      subpart.args.push(arg);
      return subpart;
    }

    /*
     * CSS3 allows only a single simple selector!
     * negation_arg
     *   : type_selector | universal | HASH | class | attrib | pseudo
     *   ;
     */
    _negationArg() {
      const stream = this._tokenStream;
      const start = stream.LT(1);
      const next = stream.peek();
      const ns = this._namespacePrefix();
      const arg =
        this._typeSelector(ns) ||
        this._universal(ns) ||
        next === Tokens.HASH && this._hash() ||
        next === Tokens.DOT && this._class() ||
        next === Tokens.LBRACKET && this._attrib() ||
        next === Tokens.COLON && this._pseudo();

      if (!arg) this._unexpectedToken(stream.LT(1));

      return arg.type === 'elementName' ?
        new SelectorPart(arg, [], arg.toString(), start) :
        new SelectorPart(null, [arg], arg.toString(), start);
    }

    /*
     * declaration
     *   : property ':' S* expr prio?
     *   | /( empty )/
     *   ;
     */
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

    /*
     * prio
     *   : IMPORTANT_SYM S*
     *   ;
     */
    _prio() {
      const stream = this._tokenStream;
      const result = stream.match(Tokens.IMPORTANT_SYM);

      this._ws();
      return result;
    }

    /*
     * expr
     *   : term [ operator term ]*
     *   ;
     */
    _expr(inFunction) {
      const stream = this._tokenStream;
      const values = [];

      while (true) {
        let value = this._term(inFunction);
        if (!value && !values.length) return null;

        // get everything inside the parens and let validateProperty handle that
        if (!value && inFunction && stream.peek() !== Tokens.RPAREN) {
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

    /*
     * term
     *   : unary_operator?
     *     [ NUMBER S* | PERCENTAGE S* | LENGTH S* | ANGLE S* |
     *       TIME S* | FREQ S* | function | ie_function ]
     *   | STRING S* | IDENT S* | URI S* | UNICODERANGE S* | hexcolor
     *   ;
     */
    _term(inFunction) {
      const stream = this._tokenStream;

      const unary = this._unaryOperator() && stream._token;

      const finalize = (token, value) => {
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
      if (inFunction && stream.match([Tokens.LPAREN, Tokens.LBRACE, Tokens.LBRACKET])) {
        const token = stream._token;
        const value = token.value + this._expr(inFunction).text + token.endChar;
        stream.mustMatch(Tokens.type(token.endChar));
        return finalize(token, value);
      }

      return finalize(
        // see if there's a simple match
        stream.match([
          Tokens.NUMBER,
          Tokens.PERCENTAGE,
          Tokens.LENGTH,
          Tokens.ANGLE,
          Tokens.TIME,
          Tokens.DIMENSION,
          Tokens.FREQ,
          Tokens.STRING,
          inFunction === 'var' && Tokens.CUSTOM_PROP,
          Tokens.IDENT,
          Tokens.URI,
          Tokens.UNICODE_RANGE,
          Tokens.USO_VAR,
        ]) && stream._token ||
        this._hexcolor() ||
        this._function({asText: unary}));
    }

    /*
     * function
     *   : FUNCTION S* expr ')' S*
     *   ;
     */
    _function({asText} = {}) {
      const stream = this._tokenStream;
      if (!stream.match(Tokens.FUNCTION)) return null;
      this._ws();

      const start = stream._token;
      const name = start.value.slice(0, -1);
      const expr = this._expr(lower(name)) || '';
      const ieFilter = this.options.ieFilters && stream.peek() === Tokens.EQUALS ?
        this._functionIeFilter() : '';
      const text = name + '(' + expr + ieFilter + ')';

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

    /* (My own extension)
     * ie_function
     *   : IE_FUNCTION S* IDENT '=' term [S* ','? IDENT '=' term]+ ')' S*
     *   ;
     */
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

    /*
     * There is a constraint on the color that it must
     * have either 3,4 or 6,8 hex-digits (i.e., [0-9a-fA-F])
     * after the "#"; e.g., "#000" is OK, but "#abcd" is not.
     *
     * hexcolor
     *   : HASH S*
     *   ;
     */
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

    /*
     * keyframes:
     *   : KEYFRAMES_SYM S* keyframe_name S* '{' S* keyframe_rule* '}' {
     *   ;
     */
    _keyframes() {
      const stream = this._tokenStream;
      let prefix = '';

      stream.mustMatch(Tokens.KEYFRAMES_SYM);
      const token = stream._token;
      if (/^@-([^-]+)-/.test(token.value)) prefix = RegExp.$1;

      this._ws();
      const name = this._keyframeName();

      this._ws();
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

    /*
     * keyframe_name:
     *   : IDENT
     *   | STRING
     *   ;
     */
    _keyframeName() {
      const stream = this._tokenStream;
      stream.mustMatch([Tokens.IDENT, Tokens.STRING]);
      return SyntaxUnit.fromToken(stream._token);
    }

    /*
     * keyframe_rule:
     *   : key_list S*
     *     '{' S* declaration [ ';' S* declaration ]* '}' S*
     *   ;
     */
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

    /*
     * key_list:
     *   : key [ S* ',' S* key]*
     *   ;
     */
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

    /*
     * There is a restriction that IDENT can be only "from" or "to".
     *
     * key
     *   : PERCENTAGE
     *   | IDENT
     *   ;
     */
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

    /**
     * Not part of CSS grammar, but useful for skipping over
     * combination of white space and HTML-style comments.
     */
    _skipCruft() {
      while (this._tokenStream.match([
        Tokens.S,
        Tokens.CDO,
        Tokens.CDC,
      ])) { /*NOP*/ }
    }

    /**
     * Not part of CSS grammar, but this pattern occurs frequently
     * in the official CSS grammar. Split out here to eliminate
     * duplicate code.
     * @param {Boolean} checkStart Indicates if the rule should check
     *      for the left brace at the beginning.
     * @param {Boolean} readMargins Indicates if the rule should check
     *      for margin patterns.
     *
     * Reads the pattern
     * S* '{' S* declaration [ ';' S* declaration ]* '}' S*
     * or
     * S* '{' S* [ declaration | margin ]? [ ';' S* [ declaration | margin ]? ]* '}' S*
     * Note that this is how it is described in CSS3 Paged Media, but is actually incorrect.
     * A semicolon is only necessary following a declaration if there's another declaration
     * or margin afterwards.
     */
    _readDeclarations({
      checkStart = true,
      readMargins = false,
      stopAfterBrace = false
    } = {}) {
      const stream = this._tokenStream;

      if (checkStart) {
        this._ws();
        stream.mustMatch(Tokens.LBRACE);
      }

      try {
        while (stream.peek() !== Tokens.RBRACE) {
          this._ws();
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

    /**
     * In some cases, you can end up with two white space tokens in a
     * row. Instead of making a change in every function that looks for
     * white space, this function is used to match as much white space
     * as necessary.
     * @return {String} The white space if found, empty string if not.
     */
    _ws() {
      let ws = '';
      const stream = this._tokenStream;
      while (stream.match(Tokens.S)) {
        ws += stream._token.value;
      }
      return ws;
    }

    /**
     * Throws an error when an unexpected token is found.
     * @param {Object} token The token that was found.
     */
    _unexpectedToken(token) {
      const {value, startLine: line, startCol: col} = token;
      throw new SyntaxError(`Unexpected token '${value}' at line ${line}, col ${col}.`, token);
    }

    /**
     * Helper method used for parsing subparts of a style sheet.
     */
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
      // just passthrough
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
     * @return {parserlib.css.PropertyValue} The property value.
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
