(function(mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function(CodeMirror) {
    "use strict";

    // color names
    var color_names={aliceblue:"rgb(240, 248, 255)",antiquewhite:"rgb(250, 235, 215)",aqua:"rgb(0, 255, 255)",aquamarine:"rgb(127, 255, 212)",azure:"rgb(240, 255, 255)",beige:"rgb(245, 245, 220)",bisque:"rgb(255, 228, 196)",black:"rgb(0, 0, 0)",blanchedalmond:"rgb(255, 235, 205)",blue:"rgb(0, 0, 255)",blueviolet:"rgb(138, 43, 226)",brown:"rgb(165, 42, 42)",burlywood:"rgb(222, 184, 135)",cadetblue:"rgb(95, 158, 160)",chartreuse:"rgb(127, 255, 0)",chocolate:"rgb(210, 105, 30)",coral:"rgb(255, 127, 80)",cornflowerblue:"rgb(100, 149, 237)",cornsilk:"rgb(255, 248, 220)",crimson:"rgb(237, 20, 61)",cyan:"rgb(0, 255, 255)",darkblue:"rgb(0, 0, 139)",darkcyan:"rgb(0, 139, 139)",darkgoldenrod:"rgb(184, 134, 11)",darkgray:"rgb(169, 169, 169)",darkgrey:"rgb(169, 169, 169)",darkgreen:"rgb(0, 100, 0)",darkkhaki:"rgb(189, 183, 107)",darkmagenta:"rgb(139, 0, 139)",darkolivegreen:"rgb(85, 107, 47)",darkorange:"rgb(255, 140, 0)",darkorchid:"rgb(153, 50, 204)",darkred:"rgb(139, 0, 0)",darksalmon:"rgb(233, 150, 122)",darkseagreen:"rgb(143, 188, 143)",darkslateblue:"rgb(72, 61, 139)",darkslategray:"rgb(47, 79, 79)",darkslategrey:"rgb(47, 79, 79)",darkturquoise:"rgb(0, 206, 209)",darkviolet:"rgb(148, 0, 211)",deeppink:"rgb(255, 20, 147)",deepskyblue:"rgb(0, 191, 255)",dimgray:"rgb(105, 105, 105)",dimgrey:"rgb(105, 105, 105)",dodgerblue:"rgb(30, 144, 255)",firebrick:"rgb(178, 34, 34)",floralwhite:"rgb(255, 250, 240)",forestgreen:"rgb(34, 139, 34)",fuchsia:"rgb(255, 0, 255)",gainsboro:"rgb(220, 220, 220)",ghostwhite:"rgb(248, 248, 255)",gold:"rgb(255, 215, 0)",goldenrod:"rgb(218, 165, 32)",gray:"rgb(128, 128, 128)",grey:"rgb(128, 128, 128)",green:"rgb(0, 128, 0)",greenyellow:"rgb(173, 255, 47)",honeydew:"rgb(240, 255, 240)",hotpink:"rgb(255, 105, 180)",indianred:"rgb(205, 92, 92)",indigo:"rgb(75, 0, 130)",ivory:"rgb(255, 255, 240)",khaki:"rgb(240, 230, 140)",lavender:"rgb(230, 230, 250)",lavenderblush:"rgb(255, 240, 245)",lawngreen:"rgb(124, 252, 0)",lemonchiffon:"rgb(255, 250, 205)",lightblue:"rgb(173, 216, 230)",lightcoral:"rgb(240, 128, 128)",lightcyan:"rgb(224, 255, 255)",lightgoldenrodyellow:"rgb(250, 250, 210)",lightgreen:"rgb(144, 238, 144)",lightgray:"rgb(211, 211, 211)",lightgrey:"rgb(211, 211, 211)",lightpink:"rgb(255, 182, 193)",lightsalmon:"rgb(255, 160, 122)",lightseagreen:"rgb(32, 178, 170)",lightskyblue:"rgb(135, 206, 250)",lightslategray:"rgb(119, 136, 153)",lightslategrey:"rgb(119, 136, 153)",lightsteelblue:"rgb(176, 196, 222)",lightyellow:"rgb(255, 255, 224)",lime:"rgb(0, 255, 0)",limegreen:"rgb(50, 205, 50)",linen:"rgb(250, 240, 230)",magenta:"rgb(255, 0, 255)",maroon:"rgb(128, 0, 0)",mediumaquamarine:"rgb(102, 205, 170)",mediumblue:"rgb(0, 0, 205)",mediumorchid:"rgb(186, 85, 211)",mediumpurple:"rgb(147, 112, 219)",mediumseagreen:"rgb(60, 179, 113)",mediumslateblue:"rgb(123, 104, 238)",mediumspringgreen:"rgb(0, 250, 154)",mediumturquoise:"rgb(72, 209, 204)",mediumvioletred:"rgb(199, 21, 133)",midnightblue:"rgb(25, 25, 112)",mintcream:"rgb(245, 255, 250)",mistyrose:"rgb(255, 228, 225)",moccasin:"rgb(255, 228, 181)",navajowhite:"rgb(255, 222, 173)",navy:"rgb(0, 0, 128)",oldlace:"rgb(253, 245, 230)",olive:"rgb(128, 128, 0)",olivedrab:"rgb(107, 142, 35)",orange:"rgb(255, 165, 0)",orangered:"rgb(255, 69, 0)",orchid:"rgb(218, 112, 214)",palegoldenrod:"rgb(238, 232, 170)",palegreen:"rgb(152, 251, 152)",paleturquoise:"rgb(175, 238, 238)",palevioletred:"rgb(219, 112, 147)",papayawhip:"rgb(255, 239, 213)",peachpuff:"rgb(255, 218, 185)",peru:"rgb(205, 133, 63)",pink:"rgb(255, 192, 203)",plum:"rgb(221, 160, 221)",powderblue:"rgb(176, 224, 230)",purple:"rgb(128, 0, 128)",rebeccapurple:"rgb(102, 51, 153)",red:"rgb(255, 0, 0)",rosybrown:"rgb(188, 143, 143)",royalblue:"rgb(65, 105, 225)",saddlebrown:"rgb(139, 69, 19)",salmon:"rgb(250, 128, 114)",sandybrown:"rgb(244, 164, 96)",seagreen:"rgb(46, 139, 87)",seashell:"rgb(255, 245, 238)",sienna:"rgb(160, 82, 45)",silver:"rgb(192, 192, 192)",skyblue:"rgb(135, 206, 235)",slateblue:"rgb(106, 90, 205)",slategray:"rgb(112, 128, 144)",slategrey:"rgb(112, 128, 144)",snow:"rgb(255, 250, 250)",springgreen:"rgb(0, 255, 127)",steelblue:"rgb(70, 130, 180)",tan:"rgb(210, 180, 140)",teal:"rgb(0, 128, 128)",thistle:"rgb(216, 191, 216)",tomato:"rgb(255, 99, 71)",turquoise:"rgb(64, 224, 208)",violet:"rgb(238, 130, 238)",wheat:"rgb(245, 222, 179)",white:"rgb(255, 255, 255)",whitesmoke:"rgb(245, 245, 245)",yellow:"rgb(255, 255, 0)",yellowgreen:"rgb(154, 205, 50)",transparent:"rgba(0, 0, 0, 0)"};

    var colorpicker_class = 'codemirror-colorview';
    var colorpicker_background_class = 'codemirror-colorview-background';

    // Excluded tokens do not show color views..
    var excluded_token = ['comment'];

    CodeMirror.defineOption("colorpicker", false, function (cm, val, old) {

        if (old && old != CodeMirror.Init) {

            if (cm.state.colorpicker)
            {
                cm.state.colorpicker.destroy();
                cm.state.colorpicker = null;

            }
            // remove event listener
        }

        if (val)
        {
            cm.state.colorpicker = new codemirror_colorpicker(cm, val);
        }
    });

    function onChange(cm, evt) {
        if (evt.origin == 'setValue') {  // if content is changed by setValue method, it initialize markers
            cm.state.colorpicker.close_color_picker();
            cm.state.colorpicker.init_color_update();
            cm.state.colorpicker.style_color_update();
        } else {
            cm.state.colorpicker.style_color_update(cm.getCursor().line);
        }

    }

    function onUpdate(cm, evt) {
        if (!cm.state.colorpicker.isUpdate) {
            cm.state.colorpicker.isUpdate = true;
            cm.state.colorpicker.close_color_picker();
            cm.state.colorpicker.init_color_update();
            cm.state.colorpicker.style_color_update();
        }
    }

    function onRefresh(cm, evt) {
        onChange(cm, { origin : 'setValue'});
    }

    function onKeyup(cm, evt) {
        cm.state.colorpicker.keyup(evt);
    }

    function onMousedown(cm, evt) {
        if (cm.state.colorpicker.is_edit_mode())
        {
            cm.state.colorpicker.check_mousedown(evt);
        }
    }

    function onPaste (cm, evt) {
        onChange(cm, { origin : 'setValue'});
    }

    function onScroll (cm) {
        cm.state.colorpicker.close_color_picker();
    }

    function debounce (callback, delay) {

        var t = undefined;

        return function (cm, e) {
            if (t) {
                clearTimeout(t);
            }

            t = setTimeout(function () {
                callback(cm, e);
            }, delay || 300);
        }
    }

    function has_class(el, cls) {
        if (!el || !el.className) {
            return false;
        } else {
            var newClass = ' ' + el.className + ' ';
            return newClass.indexOf(' ' + cls + ' ') > -1;
        }
    }

    function codemirror_colorpicker (cm, opt) {
        var self = this;

        if (typeof opt == 'boolean')
        {
            opt = { mode : 'view' };
        } else {
            opt = Object.assign({ mode: 'view' }, opt || {});
        }

        this.opt = opt;
        this.cm = cm;
        this.markers = {};

        // set excluded token
        excluded_token = this.opt.excluded_token || excluded_token;

        if (this.cm.colorpicker) {
            this.colorpicker = this.cm.colorpicker();
        } else if (this.opt.colorpicker) {
            this.colorpicker = this.opt.colorpicker;
        }

        this.init_event();

    }

    codemirror_colorpicker.prototype.init_event = function () {

        this.cm.on('mousedown', onMousedown);
        this.cm.on('keyup', onKeyup);
        this.cm.on('change', onChange);
        this.cm.on('update', onUpdate);
        this.cm.on('refresh', onRefresh);

        // create paste callback
        this.onPasteCallback = (function (cm, callback) {
            return  function (evt) {
                callback.call(this, cm, evt);
            }
        })(this.cm, onPaste);

        this.cm.getWrapperElement().addEventListener('paste', this.onPasteCallback);

        if (this.is_edit_mode())
        {
            this.cm.on('scroll', debounce(onScroll, 50));
        }

    }

    codemirror_colorpicker.prototype.is_edit_mode = function () {
        return this.opt.mode == 'edit';
    }

    codemirror_colorpicker.prototype.is_view_mode = function () {
        return this.opt.mode == 'view';
    }

    codemirror_colorpicker.prototype.destroy = function () {
        this.cm.off('mousedown', onMousedown);
        this.cm.off('keyup', onKeyup);
        this.cm.off('change', onChange)
        this.cm.getWrapperElement().removeEventListener('paste', this.onPasteCallback);

        if (this.is_edit_mode())
        {
            this.cm.off('scroll');
        }
    }

    codemirror_colorpicker.prototype.hasClass = function (el, className) {
        if (!el.className)
        {
            return false;
        } else {
            var newClass = ' ' + el.className + ' ';
            return newClass.indexOf(' ' + className + ' ') > -1;
        }
    }

    codemirror_colorpicker.prototype.check_mousedown = function (evt) {
        if (this.hasClass(evt.target, colorpicker_background_class) )
        {
            this.open_color_picker(evt.target.parentNode);
        } else {
            this.close_color_picker();
        }
    }

    codemirror_colorpicker.prototype.popup_color_picker = function (defalutColor) {
        var cursor = this.cm.getCursor();
        var self = this;
        var colorMarker = {
            lineNo : cursor.line,
            ch : cursor.ch,
            color: defalutColor || '#FFFFFF',
            isShortCut : true
        };

        Object.keys(this.markers).forEach(function(key) {
            var searchKey = "#" + key;
            if (searchKey.indexOf( "#" + colorMarker.lineNo + ":") > -1) {
                var marker = self.markers[key];

                if (marker.ch <= colorMarker.ch && colorMarker.ch <= marker.ch + marker.color.length) {
                    // when cursor has marker
                    colorMarker.ch = marker.ch;
                    colorMarker.color = marker.color;
                    colorMarker.nameColor = marker.nameColor;
                }

            }
        });

        this.open_color_picker(colorMarker);
    }

    codemirror_colorpicker.prototype.open_color_picker = function (el) {
        var lineNo = el.lineNo;
        var ch = el.ch;
        var nameColor = el.nameColor;
        var color = el.color;


        if (this.colorpicker) {
            var self = this;
            var prevColor = color;
            var pos = this.cm.charCoords({line : lineNo, ch : ch });
            this.colorpicker.show({
                left : pos.left,
                top : pos.bottom,
                isShortCut : el.isShortCut || false,
                hideDelay : self.opt.hideDelay || 2000
            }, nameColor || color, function (newColor) {
                self.cm.replaceRange(newColor, { line : lineNo, ch : ch } , { line : lineNo, ch : ch + prevColor.length }, '*colorpicker');
                prevColor = newColor;
            });

        }

    }

    codemirror_colorpicker.prototype.close_color_picker = function (el) {
        if (this.colorpicker)
        {
            this.colorpicker.hide();
        }
    }

    codemirror_colorpicker.prototype.key = function (lineNo, ch) {
        return [lineNo, ch].join(":");
    }


    codemirror_colorpicker.prototype.keyup = function (evt) {

        if (this.colorpicker ) {
            if (evt.key == 'Escape') {
                this.colorpicker.hide();
            } else if (this.colorpicker.isShortCut() == false) {
                this.colorpicker.hide();
            }
        }
    }

    codemirror_colorpicker.prototype.init_color_update = function () {
        this.markers = {};  // initialize marker list
    }

    codemirror_colorpicker.prototype.style_color_update = function (lineHandle) {

        if (lineHandle) {
            this.match(lineHandle);
        } else {
            var max = this.cm.lineCount();

            for(var lineNo = 0; lineNo < max; lineNo++) {
                this.match(lineNo);
            }
        }

    }

    codemirror_colorpicker.prototype.empty_marker = function (lineNo, lineHandle) {
        var list = lineHandle.markedSpans || [];

        for(var i = 0, len = list.length; i < len; i++) {
            var key = this.key(lineNo, list[i].from);

            if (key && has_class(list[i].marker.replacedWith, colorpicker_class)) {
                delete this.markers[key];
                list[i].marker.clear();
            }

        }
    }

    codemirror_colorpicker.prototype.color_regexp = /(#(?:[\da-f]{3}){1,2}|rgb\((?:\s*\d{1,3},\s*){2}\d{1,3}\s*\)|rgba\((?:\s*\d{1,3},\s*){3}\d*\.?\d+\s*\)|hsl\(\s*\d{1,3}(?:,\s*\d{1,3}%){2}\s*\)|hsla\(\s*\d{1,3}(?:,\s*\d{1,3}%){2},\s*\d*\.?\d+\s*\)|([\w_\-]+))/gi;

    codemirror_colorpicker.prototype.match_result = function (lineHandle) {
        return lineHandle.text.match(this.color_regexp);
    }

    codemirror_colorpicker.prototype.match = function (lineNo) {
        var lineHandle = this.cm.getLineHandle(lineNo);

        this.empty_marker(lineNo, lineHandle);

        var result = this.match_result(lineHandle);
        if (result)
        {
            var obj = { next : 0 };
            for(var i = 0, len = result.length; i < len; i++) {

                if (result[i].indexOf('#') > -1 || result[i].indexOf('rgb') > -1 || result[i].indexOf('hsl') > -1) {
                    this.render(obj, lineNo, lineHandle, result[i]);
                } else {
                    var nameColor = color_names[result[i]];
                    if (nameColor) {
                        this.render(obj, lineNo, lineHandle, result[i], nameColor);
                    }
                }
            }
        }
    }

    codemirror_colorpicker.prototype.make_element = function () {
        var el = document.createElement('div');

        el.className = colorpicker_class;

        if (this.is_edit_mode())
        {
            el.title ="open color picker";
        } else {
            el.title ="";
        }

        el.back_element = this.make_background_element();
        el.appendChild(el.back_element);

        return el;
    }

    codemirror_colorpicker.prototype.make_background_element = function () {
        var el = document.createElement('div');

        el.className = colorpicker_background_class;

        return el;
    }

    codemirror_colorpicker.prototype.set_state = function (lineNo, start, color, nameColor) {
        var marker = this.create_marker(lineNo, start);


        marker.lineNo = lineNo;
        marker.ch = start;
        marker.color = color;
        marker.nameColor = nameColor;

        return marker;
    }

    codemirror_colorpicker.prototype.create_marker = function (lineNo, start) {

        var key = this.key(lineNo,start);

        if (!this.markers[key]) {
            this.markers[key] = this.make_element();
        }


        return this.markers[key];

    }

    codemirror_colorpicker.prototype.has_marker = function (lineNo, start) {
        var key = this.key(lineNo,start);
        return !!(this.markers[key])
    }

    codemirror_colorpicker.prototype.update_element = function (el, color) {
        el.back_element.style.backgroundColor = color;
    }

    codemirror_colorpicker.prototype.set_mark = function (line, ch, el) {
        this.cm.setBookmark({ line : line, ch : ch}, { widget : el, handleMouseEvents : true} );

    }

    codemirror_colorpicker.prototype.is_excluded_token = function (line, ch) {
        var token = this.cm.getTokenAt({line : line, ch : ch});
        var count = 0;
        for(var i = 0, len = excluded_token.length; i < len; i++) {
            if (token.type === excluded_token[i]) {
                count++;
                break;
            }
        }

        return count > 0;   // true is that it has a excluded token
    }

    codemirror_colorpicker.prototype.render = function (cursor, lineNo, lineHandle, color, nameColor) {
        var start = lineHandle.text.indexOf(color, cursor.next);

        if (this.is_excluded_token(lineNo, start) === true) {
            // excluded token do not show.
            return;
        }

        cursor.next = start + color.length;

        if (this.has_marker(lineNo, start))
        {
            this.update_element(this.create_marker(lineNo, start), nameColor || color);
            this.set_state(lineNo, start, color, nameColor);
            return;
        }

        var el  = this.create_marker(lineNo, start);

        this.update_element(el, nameColor || color);
        this.set_state(lineNo, start, color, nameColor || color);
        this.set_mark(lineNo, start, el);
    }
});
