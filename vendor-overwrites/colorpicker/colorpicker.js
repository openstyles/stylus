(function(mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["codemirror" ], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function(CodeMirror) {

    CodeMirror.defineExtension("colorpicker", function () {

        var cm  = this;

        var color = {

            trim : function (str) {
                return str.replace(/^\s+|\s+$/g, '');
            },

            /**
             * @method format
             *
             * convert color to format string
             *
             *     // hex
             *     color.format({ r : 255, g : 255, b : 255 }, 'hex')  // #FFFFFF
             *
             *     // rgb
             *     color.format({ r : 255, g : 255, b : 255 }, 'rgb') // rgba(255, 255, 255, 0.5);
             *
             *     // rgba
             *     color.format({ r : 255, g : 255, b : 255, a : 0.5 }, 'rgb') // rgba(255, 255, 255, 0.5);
             *
             * @param {Object} obj  obj has r, g, b and a attributes
             * @param {"hex"/"rgb"} type  format string type
             * @returns {*}
             */
            format : function(obj, type) {
                if (type == 'hex') {
                    var r = obj.r.toString(16);
                    if (obj.r < 16) r = "0" + r;

                    var g = obj.g.toString(16);
                    if (obj.g < 16) g = "0" + g;

                    var b = obj.b.toString(16);
                    if (obj.b < 16) b = "0" + b;

                    return "#" + [r, g, b].join("");
                } else if (type == 'rgb') {
                    if (typeof obj.a == 'undefined') {
                        return "rgb(" + [obj.r, obj.g, obj.b].join(",") + ")";
                    } else {
                        return "rgba(" + [obj.r, obj.g, obj.b, obj.a].join(",") + ")";
                    }
                } else if (type == 'hsl') {
                    if (typeof obj.a == 'undefined') {
                        return "hsl(" + [obj.h, obj.s + '%', obj.l + '%'].join(",") + ")";
                    } else {
                        return "hsla(" + [obj.h, obj.s + '%', obj.l + '%', obj.a].join(",") + ")";
                    }
                }

                return obj;
            },

            /**
             * @method rgb
             *
             * parse string to rgb color
             *
             * 		color.rgb("#FF0000") === { r : 255, g : 0, b : 0 }
             *
             * 		color.rgb("rgb(255, 0, 0)") == { r : 255, g : 0, b : }
             *
             * @param {String} str color string
             * @returns {Object}  rgb object
             */
            parse : function (str) {
                if (typeof str == 'string') {
                    if (str.indexOf("rgb(") > -1) {
                        var arr = str.replace("rgb(", "").replace(")","").split(",");

                        for(var i = 0, len = arr.length; i < len; i++) {
                            arr[i] = parseInt(color.trim(arr[i]), 10);
                        }

                        return { type : 'rgb', r : arr[0], g : arr[1], b : arr[2], a : 1	};
                    } else if (str.indexOf("rgba(") > -1) {
                        var arr = str.replace("rgba(", "").replace(")", "").split(",");

                        for (var i = 0, len = arr.length; i < len; i++) {

                            if (len - 1 == i) {
                                arr[i] = parseFloat(color.trim(arr[i]));
                            } else {
                                arr[i] = parseInt(color.trim(arr[i]), 10);
                            }
                        }

                        return {type: 'rgb', r: arr[0], g: arr[1], b: arr[2], a: arr[3]};
                    } else if (str.indexOf("hsl(") > -1) {
                        var arr = str.replace("hsl(", "").replace(")","").split(",");

                        for(var i = 0, len = arr.length; i < len; i++) {
                            arr[i] = parseInt(color.trim(arr[i]), 10);
                        }

                        var obj = { type : 'hsl', h : arr[0], s : arr[1], l : arr[2], a : 1	};

                        var temp = color.HSLtoRGB(obj.h, obj.s, obj.l);

                        obj.r = temp.r;
                        obj.g = temp.g;
                        obj.b = temp.b;

                        return obj;
                    } else if (str.indexOf("hsla(") > -1) {
                        var arr = str.replace("hsla(", "").replace(")", "").split(",");

                        for (var i = 0, len = arr.length; i < len; i++) {

                            if (len - 1 == i) {
                                arr[i] = parseFloat(color.trim(arr[i]));
                            } else {
                                arr[i] = parseInt(color.trim(arr[i]), 10);
                            }
                        }

                        var obj = {type: 'hsl', h: arr[0], s: arr[1], l: arr[2], a: arr[3]};

                        var temp = color.HSLtoRGB(obj.h, obj.s, obj.l);

                        obj.r = temp.r;
                        obj.g = temp.g;
                        obj.b = temp.b;

                        return obj;
                    } else if (str.indexOf("#") == 0) {

                        str = str.replace("#", "");

                        var arr = [];
                        if (str.length == 3) {
                            for(var i = 0, len = str.length; i < len; i++) {
                                var char = str.substr(i, 1);
                                arr.push(parseInt(char+char, 16));
                            }
                        } else {
                            for(var i = 0, len = str.length; i < len; i+=2) {
                                arr.push(parseInt(str.substr(i, 2), 16));
                            }
                        }

                        return { type : 'hex', r : arr[0], g : arr[1], b : arr[2], a : 1	};
                    }
                }

                return str;

            },

            /**
             * @method HSVtoRGB
             *
             * convert hsv to rgb
             *
             * 		color.HSVtoRGB(0,0,1) === #FFFFF === { r : 255, g : 0, b : 0 }
             *
             * @param {Number} H  hue color number  (min : 0, max : 360)
             * @param {Number} S  Saturation number  (min : 0, max : 1)
             * @param {Number} V  Value number 		(min : 0, max : 1 )
             * @returns {Object}
             */
            HSVtoRGB : function (H, S, V) {

                if (H == 360) {
                    H = 0;
                }

                var C = S * V;
                var X = C * (1 -  Math.abs((H/60) % 2 -1)  );
                var m = V - C;

                var temp = [];

                if (0 <= H && H < 60) { temp = [C, X, 0]; }
                else if (60 <= H && H < 120) { temp = [X, C, 0]; }
                else if (120 <= H && H < 180) { temp = [0, C, X]; }
                else if (180 <= H && H < 240) { temp = [0, X, C]; }
                else if (240 <= H && H < 300) { temp = [X, 0, C]; }
                else if (300 <= H && H < 360) { temp = [C, 0, X]; }

                return {
                    r : Math.ceil((temp[0] + m) * 255),
                    g : Math.ceil((temp[1] + m) * 255),
                    b : Math.ceil((temp[2] + m) * 255)
                };
            },

            /**
             * @method RGBtoHSV
             *
             * convert rgb to hsv
             *
             * 		color.RGBtoHSV(0, 0, 255) === { h : 240, s : 1, v : 1 } === '#FFFF00'
             *
             * @param {Number} R  red color value
             * @param {Number} G  green color value
             * @param {Number} B  blue color value
             * @return {Object}  hsv color code
             */
            RGBtoHSV : function (R, G, B) {

                var R1 = R / 255;
                var G1 = G / 255;
                var B1 = B / 255;

                var MaxC = Math.max(R1, G1, B1);
                var MinC = Math.min(R1, G1, B1);

                var DeltaC = MaxC - MinC;

                var H = 0;

                if (DeltaC == 0) { H = 0; }
                else if (MaxC == R1) {
                    H = 60 * (( (G1 - B1) / DeltaC) % 6);
                } else if (MaxC == G1) {
                    H  = 60 * (( (B1 - R1) / DeltaC) + 2);
                } else if (MaxC == B1) {
                    H  = 60 * (( (R1 - G1) / DeltaC) + 4);
                }

                if (H < 0) {
                    H = 360 + H;
                }

                var S = 0;

                if (MaxC == 0) S = 0;
                else S = DeltaC / MaxC;

                var V = MaxC;

                return { h : H, s : S, v :  V };
            },

            RGBtoHSL : function (r, g, b) {
                r /= 255, g /= 255, b /= 255;
                var max = Math.max(r, g, b), min = Math.min(r, g, b);
                var h, s, l = (max + min) / 2;

                if(max == min){
                    h = s = 0; // achromatic
                }else{
                    var d = max - min;
                    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    switch(max){
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h /= 6;
                }

                return { h : Math.round(h * 360) , s : Math.round(s * 100), l : Math.round(l * 100)};
            },

            HUEtoRGB : function (p, q, t) {
                if(t < 0) t += 1;
                if(t > 1) t -= 1;
                if(t < 1/6) return p + (q - p) * 6 * t;
                if(t < 1/2) return q;
                if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            },

            HSLtoRGB : function (h, s, l) {
                var r, g, b;

                h /= 360;
                s /= 100;
                l /= 100;

                if(s == 0){
                    r = g = b = l; // achromatic
                }else{
                    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                    var p = 2 * l - q;
                    r = this.HUEtoRGB(p, q, h + 1/3);
                    g = this.HUEtoRGB(p, q, h);
                    b = this.HUEtoRGB(p, q, h - 1/3);
                }

                return { r : r * 255, g : g * 255, b : b * 255 };
            }
        };

        var hue_color = [
            { rgb : '#ff0000', start : .0 },
            { rgb : '#ffff00', start : .17 },
            { rgb : '#00ff00', start : .33 },
            { rgb : '#00ffff', start : .50 },
            { rgb : '#0000ff', start : .67 },
            { rgb : '#ff00ff', start : .83 },
            { rgb : '#ff0000', start : 1 }
        ];

        var $body, $root, $hue, $color, $value, $saturation, $drag_pointer, $drag_bar,
            $control, $controlPattern, $controlColor, $hueContainer, $opacity, $opacityContainer, $opacityColorBar, $formatChangeButton,
            $opacity_drag_bar, $information, $informationChange;

        var currentA, currentH, currentS, currentV;
        var $hexCode;
        var $rgb_r, $rgb_g, $rgb_b, $rgb_a;
        var $hsl_h, $hsl_s, $hsl_l, $hsl_a;
        var cssPrefix = getCssValuePrefix();

        var colorpickerCallback = function () {};
        var counter = 0;
        var cached = {};
        var isColorPickerShow = false;
        var isShortCut = false;
        var hideDelay = 2000;

        function dom(tag, className, attr) {

            if (typeof tag != 'string') {
                this.el = tag;
            } else {

                var el  = document.createElement(tag);

                this.uniqId = counter++;

                el.className = className;

                attr = attr || {};

                for(var k in attr) {
                    el.setAttribute(k, attr[k]);
                }

                this.el = el;
            }
        }

        dom.prototype.closest = function (cls) {

            var temp = this;
            var checkCls = false;

            while(!(checkCls = temp.hasClass(cls))) {
                if (temp.el.parentNode) {
                    temp = new dom(temp.el.parentNode);
                } else {
                    return null;
                }
            }

            if (checkCls) {
                return temp;
            }

            return null;
        }

        dom.prototype.removeClass = function (cls) {
            this.el.className = color.trim((" " + this.el.className + " ").replace(' ' + cls + ' ', ' '));
        }

        dom.prototype.hasClass = function (cls) {
            if (!this.el.className)
            {
                return false;
            } else {
                var newClass = ' ' + this.el.className + ' ';
                return newClass.indexOf(' ' + cls + ' ') > -1;
            }
        }

        dom.prototype.addClass = function (cls) {
            if (!this.hasClass(cls)) {
                this.el.className = this.el.className + " " + cls;
            }

        }

        dom.prototype.html = function (html) {
            this.el.innerHTML = html;

            return this;
        }

        dom.prototype.empty = function () {
            return this.html('');
        }

        dom.prototype.append = function (el) {

            if (typeof el == 'string') {
                this.el.appendChild(document.createTextNode(el));
            } else {
                this.el.appendChild(el.el || el);
            }

            return this;
        }

        dom.prototype.appendTo = function (target) {
            var t = target.el ? target.el : target;

            t.appendChild(this.el);

            return this;
        }

        dom.prototype.remove = function () {
            if (this.el.parentNode) {
                this.el.parentNode.removeChild(this.el);
            }

            return this;
        }

        dom.prototype.text = function () {
            return this.el.textContent;
        }

        dom.prototype.css = function (key, value) {
            if (arguments.length == 2) {
                this.el.style[key] = value;
            } else if (arguments.length == 1) {

                if (typeof key == 'string') {
                    return getComputedStyle(this.el)[key];
                } else {
                    var keys = key || {};
                    for(var k in keys) {
                        this.el.style[k] = keys[k];
                    }
                }

            }

            return this;
        }

        dom.prototype.offset = function () {
            var rect = this.el.getBoundingClientRect();

            return {
                top: rect.top + document.body.scrollTop,
                left: rect.left + document.body.scrollLeft
            };
        }

        dom.prototype.position = function () {
            return {
                top: parseFloat(this.el.style.top),
                left: parseFloat(this.el.style.left)
            };
        }

        dom.prototype.width = function () {
            return this.el.offsetWidth;
        }

        dom.prototype.height = function () {
            return this.el.offsetHeight;
        }

        dom.prototype.dataKey = function (key) {
            return this.uniqId + '.' + key;
        }

        dom.prototype.data = function (key, value) {
            if (arguments.length == 2) {
                cached[this.dataKey(key)] = value;
            } else if (arguments.length == 1) {
                return cached[this.dataKey(key)];
            } else {
                var keys = Object.keys(cached);

                var uniqId = this.uniqId + ".";
                return keys.filter(function (key) {
                    if (key.indexOf(uniqId) == 0) {
                        return true;
                    }

                    return false;
                }).map(function (value) {
                    return cached[value];
                })
            }

            return this;
        }

        dom.prototype.val = function (value) {
            if (arguments.length == 0) {
                return this.el.value;
            } else if (arguments.length == 1) {
                this.el.value = value;
            }

            return this;
        }

        dom.prototype.int = function () {
            return parseInt(this.val(), 10);
        }

        dom.prototype.show = function () {
            return this.css('display', 'block');
        }

        dom.prototype.hide = function () {
            return this.css('display', 'none');
        }

        function setRGBInput(r, g, b) {
            $rgb_r.val(r);
            $rgb_g.val(g);
            $rgb_b.val(b);
            $rgb_a.val(currentA);
        }

        function setHSLInput(h, s, l) {
            $hsl_h.val(h);
            $hsl_s.val(s + '%');
            $hsl_l.val(l + '%');
            $hsl_a.val(currentA);
        }

        function getHexFormat() {
            return color.format({
                r : $rgb_r.int(),
                g : $rgb_g.int(),
                b : $rgb_b.int()
            }, 'hex');
        }

        function convertRGB() {
            return color.HSVtoRGB(currentH, currentS, currentV);
        }

        function convertHEX() {
            return color.format(convertRGB(), 'hex');
        }

        function convertHSL() {
            var rgb = color.HSVtoRGB(currentH, currentS, currentV);
            return color.RGBtoHSL(rgb.r, rgb.g, rgb.b);
        }

        function getFormattedColor (format) {
            format = format || 'hex';

            if (format == 'rgb') {
                var rgb = convertRGB();
                rgb.a = currentA == 1 ? undefined : currentA;
                return color.format(rgb, 'rgb');
            } else if (format == 'hsl') {
                var hsl = convertHSL();
                hsl.a = currentA == 1 ? undefined : currentA;
                return color.format(hsl, 'hsl');
            } else {
                var rgb = convertRGB();
                return color.format(rgb, 'hex');
            }
        }

        function setControlColor (color) {
            $controlColor.css('background-color', color);
        }

        function setInputColor() {

            var format = $information.data('format') || 'hex';

            var rgb = null;
            if (format == 'hex') {
                $hexCode.val(convertHEX());
            } else if (format == 'rgb') {
                var rgb = convertRGB();
                setRGBInput(rgb.r, rgb.g, rgb.b);
            } else if (format == 'hsl') {
                var hsl = convertHSL();
                setHSLInput(hsl.h, hsl.s, hsl.l);
            }

            // set background
            setControlColor(getFormattedColor('rgb'));

            var rgb = convertRGB();
            var colorString = color.format(rgb, 'rgb');
            setOpacityColorBar(colorString);

            if (typeof colorpickerCallback == 'function') {

                if (!isNaN(currentA)) {
                    colorpickerCallback(getFormattedColor(format));
                }

            }
        }

        function setMainColor(e) {
            e.preventDefault();
            var pos = $root.position();         // position for screen
            var w = $color.width();
            var h = $color.height();

            var x = e.clientX - pos.left;
            var y = e.clientY - pos.top;

            if (x < 0) x = 0;
            else if (x > w) x = w;

            if (y < 0) y = 0;
            else if (y > h) y = h;

            $drag_pointer.css({
                left: (x - 5) + 'px',
                top: (y - 5) + 'px'
            });

            $drag_pointer.data('pos', { x: x, y : y});

            caculateHSV()
            setInputColor();
        }

        function scale (startColor, endColor, t) {
            var obj = {
                r : parseInt(startColor.r + (endColor.r - startColor.r) * t, 10) ,
                g : parseInt(startColor.g + (endColor.g - startColor.g) * t, 10),
                b : parseInt(startColor.b + (endColor.b - startColor.b) * t, 10)
            };

            return color.format(obj, 'hex');

        }

        function checkHueColor(p) {
            var startColor, endColor;

            for(var i = 0; i < hue_color.length;i++) {
                if (hue_color[i].start >= p) {
                    startColor = hue_color[i-1];
                    endColor = hue_color[i];
                    break;
                }
            }

            if (startColor && endColor) {
                return scale(startColor, endColor, (p - startColor.start)/(endColor.start - startColor.start));
            }

            return hue_color[0].rgb;
        }

        function setBackgroundColor (color) {
            $color.css("background-color", color);
        }

        function setCurrentH (h) {
            currentH = h;
        }

        function setHueColor(e) {
            var min = $hueContainer.offset().left;
            var max = min + $hueContainer.width();
            var current = e ? pos(e).clientX : min + (max - min) * (currentH / 360);

            var dist;
            if (current < min) {
                dist = 0;
            } else if (current > max) {
                dist = 100;
            } else {
                dist = (current - min) / (max - min) * 100;
            }

            var x = ($hueContainer.width() * (dist/100));

            $drag_bar.css({
                left: (x -Math.ceil($drag_bar.width()/2)) + 'px'
            });

            $drag_bar.data('pos', { x : x});

            var hueColor = checkHueColor(dist/100);

            setBackgroundColor(hueColor);
            setCurrentH((dist/100) * 360);
            setInputColor();
        }

        function getCssValuePrefix()
        {
            var rtrnVal = '';//default to standard syntax
            var prefixes = ['', '-o-', '-ms-', '-moz-', '-webkit-'];

            // Create a temporary DOM object for testing
            var dom = document.createElement('div');

            for (var i = 0; i < prefixes.length; i++)
            {
                // Attempt to set the style
                dom.style.background = prefixes[i] + 'linear-gradient(#000000, #ffffff)';

                // Detect if the style was successfully set
                if (dom.style.background)
                {
                    rtrnVal = prefixes[i];
                }
            }

            dom = null;
            delete dom;

            return rtrnVal;
        }

        function setOpacityColorBar(hueColor) {
            var rgb = color.parse(hueColor);

            rgb.a = 0;
            var start = color.format(rgb, 'rgb');

            rgb.a = 1;
            var end = color.format(rgb, 'rgb');

            var prefix = cssPrefix;
            $opacityColorBar.css('background',  'linear-gradient(to right, ' + start + ', ' + end + ')');
        }

        function setOpacity(e) {
            var min = $opacityContainer.offset().left;
            var max = min + $opacityContainer.width();
            var current = pos(e).clientX;
            var dist;

            if (current < min) {
                dist = 0;
            } else if (current > max) {
                dist = 100;
            } else {
                dist = (current - min) / (max - min) * 100;
            }

            var x = ($opacityContainer.width() * (dist/100));

            $opacity_drag_bar.css({
                left: (x -Math.ceil($opacity_drag_bar.width()/2)) + 'px'
            });

            $opacity_drag_bar.data('pos', { x : x });

            caculateOpacity();
            currentFormat();
            setInputColor();
        }

        function caculateOpacity() {
            var opacityPos = $opacity_drag_bar.data('pos') || { x : 0 };
            var a = Math.round((opacityPos.x / $opacityContainer.width()) * 100) / 100;

            currentA = isNaN(a) ? 1 : a;
        }

        function caculateHSV() {
            var pos = $drag_pointer.data('pos') || { x : 0, y : 0 };
            var huePos = $drag_bar.data('pos') || { x : 0 };

            var width = $color.width();
            var height = $color.height();

            var h = (huePos.x / $hueContainer.width()) * 360;
            var s = (pos.x / width);
            var v = ((height - pos.y) / height);

            if (width == 0) {
                h = 0;
                s = 0;
                v = 0;
            }

            currentH = h;
            currentS = s;
            currentV = v;
        }

        function pos(e) {
            if (e.touches && e.touches[0]) {
                return e.touches[0];
            }

            return e;
        }

        function checkNumberKey(e) {
            var code = e.which,
                isExcept = false;

            if(code == 37 || code == 39 || code == 8 || code == 46 || code == 9)
                isExcept = true;

            if(!isExcept && (code < 48 || code > 57))
                return false;

            return true;
        }

        function setRGBtoHexColor(e) {
            var r = $rgb_r.val(),
                g = $rgb_g.val(),
                b = $rgb_b.val();

            if(r == "" || g == "" || b == "") return;

            if(parseInt(r) > 255) $rgb_r.val(255);
            else $rgb_r.val(parseInt(r));

            if(parseInt(g) > 255) $rgb_g.val(255);
            else $rgb_g.val(parseInt(g));

            if(parseInt(b) > 255) $rgb_b.val(255);
            else $rgb_b.val(parseInt(b));

            initColor(getHexFormat());
        }

        function setColorUI() {
            var  x = $color.width() * currentS, y = $color.height() * ( 1 - currentV );

            $drag_pointer.css({
                left : (x - 5) + "px",
                top : (y - 5) + "px"
            });

            $drag_pointer.data('pos', { x  : x, y : y });

            var hueX = $hueContainer.width() * (currentH / 360);

            $drag_bar.css({
                left : (hueX - 7.5) + 'px'
            });

            $drag_bar.data('pos', { x : hueX });

            var opacityX = $opacityContainer.width() * (currentA || 0);

            $opacity_drag_bar.css({
                left : (opacityX - 7.5) + 'px'
            });

            $opacity_drag_bar.data('pos', { x : opacityX });
        }

        function setCurrentHSV (h, s, v, a) {
            currentA = a;
            currentH = h;
            currentS = s;
            currentV = v;
        }

        function setCurrentFormat (format) {
            $information.data('format', format);
            initFormat();
        }



        function initColor(newColor) {
            var c = newColor || "#FF0000", colorObj = color.parse(c);

            setCurrentFormat(colorObj.type);
            setBackgroundColor(c);

            var hsv = color.RGBtoHSV(colorObj.r, colorObj.g, colorObj.b);

            setCurrentHSV(hsv.h, hsv.s, hsv.v, colorObj.a);
            setColorUI();
            setHueColor();
            setInputColor();
        }

        function addEvent (dom, eventName, callback) {
            dom.addEventListener(eventName, callback);
        }

        function removeEvent(dom, eventName, callback) {
            dom.removeEventListener(eventName, callback);
        }

        function EventColorMouseDown(e) {
            $color.data('isDown', true);
            setMainColor(e);
        }

        function EventColorMouseUp(e) {
            $color.data('isDown', false);
        }

        function EventDragBarMouseDown (e) {
            e.preventDefault();
            $hue.data('isDown', true);
        }

        function EventOpacityDragBarMouseDown(e) {
            e.preventDefault();
            $opacity.data('isDown', true);
        }

        function EventHueMouseDown (e) {
            $hue.data('isDown', true);
            setHueColor(e);
        }

        function EventOpacityMouseDown (e) {
            $opacity.data('isDown', true);
            setOpacity(e);
        }

        function EventHexCodeKeyDown(e) {
            if(e.which < 65 || e.which > 70) {
                return checkNumberKey(e);
            }
        }

        function EventHexCodeKeyUp (e) {
            var code = $hexCode.val();

            if(code.charAt(0) == '#' && code.length == 7) {
                initColor(code);
            }
        }

        function EventFormatChangeClick(e) {
            nextFormat();
        }

        function initEvent() {
            addEvent($color.el, 'mousedown', EventColorMouseDown);
            addEvent($color.el, 'mouseup', EventColorMouseUp);
            addEvent($drag_bar.el, 'mousedown', EventDragBarMouseDown);
            addEvent($opacity_drag_bar.el, 'mousedown', EventOpacityDragBarMouseDown);
            addEvent($hueContainer.el, 'mousedown', EventHueMouseDown);
            addEvent($opacityContainer.el, 'mousedown', EventOpacityMouseDown);
            addEvent($hexCode.el, 'keydown', EventHexCodeKeyDown);
            addEvent($hexCode.el, 'keyup', EventHexCodeKeyUp);

            addEvent($rgb_r.el, 'keydown', checkNumberKey);
            addEvent($rgb_r.el, 'keyup', setRGBtoHexColor);
            addEvent($rgb_g.el, 'keydown', checkNumberKey);
            addEvent($rgb_g.el, 'keyup', setRGBtoHexColor);
            addEvent($rgb_b.el, 'keydown', checkNumberKey);
            addEvent($rgb_b.el, 'keyup', setRGBtoHexColor);

            addEvent(document, 'mouseup', EventDocumentMouseUp);
            addEvent(document, 'mousemove', EventDocumentMouseMove);

            addEvent($formatChangeButton.el, 'click', EventFormatChangeClick)
        }

        function checkColorPickerClass(el) {
            var hasColorView = new dom(el).closest('codemirror-colorview');
            var hasColorPicker = new dom(el).closest('codemirror-colorpicker');
            var hasCodeMirror = new dom(el).closest('CodeMirror');
            var IsInHtml = el.nodeName == 'HTML';

            return !!(hasColorPicker || hasColorView || hasCodeMirror);
        }

        function checkInHtml (el) {
            var IsInHtml = el.nodeName == 'HTML';

            return IsInHtml;
        }

        function EventDocumentMouseUp (e) {
            $color.data('isDown', false);
            $hue.data('isDown', false);
            $opacity.data('isDown', false);

            // when color picker clicked in outside
            if (checkInHtml(e.target)) {
                //setHideDelay(hideDelay);
            } else if (checkColorPickerClass(e.target) == false ) {
                hide();
            }

        }

        function EventDocumentMouseMove(e) {
            if ($color.data('isDown')) {
                setMainColor(e);
            }

            if ($hue.data('isDown')) {
                setHueColor(e);
            }

            if ($opacity.data('isDown')) {
                setOpacity(e);
            }
        }

        function destroy() {
            removeEvent($color.el, 'mousedown', EventColorMouseDown);
            removeEvent($color.el, 'mouseup', EventColorMouseUp);
            removeEvent($drag_bar.el, 'mousedown', EventDragBarMouseDown);
            removeEvent($opacity_drag_bar.el, 'mousedown', EventOpacityDragBarMouseDown);
            removeEvent($hueContainer.el, 'mousedown', EventHueMouseDown);
            removeEvent($opacityContainer.el, 'mousedown', EventOpacityMouseDown);
            removeEvent($hexCode.el, 'keydown', EventHexCodeKeyDown);
            removeEvent($hexCode.el, 'keyup', EventHexCodeKeyUp);
            removeEvent($rgb_r.el, 'keydown', checkNumberKey);
            removeEvent($rgb_r.el, 'keyup', setRGBtoHexColor);
            removeEvent($rgb_g.el, 'keydown', checkNumberKey);
            removeEvent($rgb_g.el, 'keyup', setRGBtoHexColor);
            removeEvent($rgb_b.el, 'keydown', checkNumberKey);
            removeEvent($rgb_b.el, 'keyup', setRGBtoHexColor);
            removeEvent(document, 'mouseup', EventDocumentMouseUp);
            removeEvent(document, 'mousemove', EventDocumentMouseMove);
            removeEvent($formatChangeButton.el, 'click', EventFormatChangeClick);

            // remove color picker callback
            colorpickerCallback = undefined;
        }

        function currentFormat () {
            var current_format = $information.data('format') || 'hex';
            if (currentA < 1 && current_format == 'hex' ) {
                var next_format = 'rgb';
                $information.removeClass(current_format);
                $information.addClass(next_format);
                $information.data('format', next_format);

                setInputColor();
            }
        }

        function initFormat () {
            var current_format = $information.data('format') || 'hex';

            $information.removeClass('hex');
            $information.removeClass('rgb');
            $information.removeClass('hsl');
            $information.addClass(current_format);
        }

        function nextFormat() {
            var current_format = $information.data('format') || 'hex';

            var next_format = 'hex';
            if (current_format == 'hex') {
                next_format = 'rgb';
            } else if (current_format == 'rgb') {
                next_format = 'hsl';
            } else if (current_format == 'hsl') {
                if (currentA == 1) {
                    next_format = 'hex';
                } else {
                    next_format = 'rgb';
                }
            }

            $information.removeClass(current_format);
            $information.addClass(next_format);
            $information.data('format', next_format);

            setInputColor();
        }

        function makeInputField(type) {
            var item = new dom('div', 'information-item '+ type);

            if (type == 'hex') {
                var field = new dom('div', 'input-field hex');

                $hexCode = new dom('input', 'input', { type : 'text' });

                field.append($hexCode);
                field.append(new dom('div', 'title').html('HEX'));

                item.append(field);

            } else if (type == 'rgb') {
                var field = new dom('div', 'input-field rgb-r');
                $rgb_r = new dom('input', 'input', { type : 'text' });

                field.append($rgb_r);
                field.append(new dom('div', 'title').html('R'));

                item.append(field);

                field = new dom('div', 'input-field rgb-g');
                $rgb_g = new dom('input', 'input', { type : 'text' });

                field.append($rgb_g);
                field.append(new dom('div', 'title').html('G'));

                item.append(field);

                field = new dom('div', 'input-field rgb-b');
                $rgb_b = new dom('input', 'input', { type : 'text' });

                field.append($rgb_b);
                field.append(new dom('div', 'title').html('B'));

                item.append(field);

                // rgba
                field = new dom('div', 'input-field rgb-a');
                $rgb_a = new dom('input', 'input', { type : 'text' });

                field.append($rgb_a);
                field.append(new dom('div', 'title').html('A'));

                item.append(field);

            } else if (type == 'hsl') {
                var field = new dom('div', 'input-field hsl-h');
                $hsl_h = new dom('input', 'input', { type : 'text' });

                field.append($hsl_h);
                field.append(new dom('div', 'title').html('H'));

                item.append(field);

                field = new dom('div', 'input-field hsl-s');
                $hsl_s = new dom('input', 'input', { type : 'text' });

                field.append($hsl_s);
                field.append(new dom('div', 'title').html('S'));

                item.append(field);

                field = new dom('div', 'input-field hsl-l');
                $hsl_l = new dom('input', 'input', { type : 'text' });

                field.append($hsl_l);
                field.append(new dom('div', 'title').html('L'));

                item.append(field);

                // rgba
                field = new dom('div', 'input-field hsl-a');
                $hsl_a = new dom('input', 'input', { type : 'text' });

                field.append($hsl_a);
                field.append(new dom('div', 'title').html('A'));

                item.append(field);
            }

            return item;
        }

        function init() {
            $body = new dom(document.body);

            $root = new dom('div', 'codemirror-colorpicker');
            $color = new dom('div', 'color');
            $drag_pointer = new dom('div', 'drag-pointer' );
            $value = new dom( 'div', 'value' );
            $saturation = new dom('div', 'saturation' );

            $control = new dom('div', 'control' );
            $controlPattern = new dom('div', 'empty' );
            $controlColor = new dom('div', 'color' );
            $hue = new dom('div', 'hue' );
            $hueContainer = new dom('div', 'hue-container' );
            $drag_bar = new dom('div', 'drag-bar' );
            $opacity = new dom('div', 'opacity' );
            $opacityContainer = new dom('div', 'opacity-container' );
            $opacityColorBar = new dom('div', 'color-bar' );

            $opacity_drag_bar = new dom('div', 'drag-bar2' );

            $information = new dom('div', 'information hex' );

            $informationChange = new dom('div', 'information-change');

            $formatChangeButton = new dom('button', 'format-change-button', { type : 'button'}).html('↔');
            $informationChange.append($formatChangeButton);


            $information.append(makeInputField('hex'));
            $information.append(makeInputField('rgb'));
            $information.append(makeInputField('hsl'));
            $information.append($informationChange);


            $value.append($drag_pointer);
            $saturation.append($value);
            $color.append($saturation);

            $hueContainer.append($drag_bar);
            $hue.append($hueContainer);

            $opacityContainer.append($opacityColorBar);
            $opacityContainer.append($opacity_drag_bar);
            $opacity.append($opacityContainer);

            $control.append($hue);
            $control.append($opacity);
            $control.append($controlPattern);
            $control.append($controlColor);

            $root.append($color);
            $root.append($control);
            $root.append($information);

            initHueColors();
            //initEvent();
            initColor();
        };

        function initHueColors () {
            for(var i = 0, len = hue_color.length; i < len; i++) {
                var hue = hue_color[i];

                var obj = color.parse(hue.rgb);

                hue.r = obj.r;
                hue.g = obj.g;
                hue.b = obj.b;
            }
        }

        /**
         * public methods
         */
        function setColor(value) {
            if(typeof(value) == "object") {
                if(!value.r || !value.g || !value.b)
                    return;

                initColor(color.format(value, "hex"));
            } else if(typeof(value) == "string") {
                if(value.charAt(0) != "#")
                    return;

                initColor(value);
            }
        }

        function getColor(type) {
            caculateHSV();
            var rgb = convertRGB();

            if (type) {
                return color.format(rgb, type);
            }

            return rgb;
        }

        function definePostion (opt) {

            var width = $root.width();
            var height = $root.height();

            // set left position for color picker
            var elementScreenLeft = opt.left - $body.el.scrollLeft ;
            if (width + elementScreenLeft > window.innerWidth) {
                elementScreenLeft -= (width + elementScreenLeft) - window.innerWidth;
            }
            if (elementScreenLeft < 0) { elementScreenLeft = 0; }

            // set top position for color picker
            var elementScreenTop = opt.top - $body.el.scrollTop ;
            if (height + elementScreenTop > window.innerHeight) {
                elementScreenTop -= (height + elementScreenTop) - window.innerHeight;
            }
            if (elementScreenTop < 0) { elementScreenTop = 0; }

            // set position
            $root.css({
                left : elementScreenLeft + 'px',
                top : elementScreenTop + 'px'
            });
        }

        function show (opt, color,  callback) {
            destroy();
            initEvent();
            $root.appendTo(document.body);

            $root.css({
                position: 'fixed',  // color picker has fixed position
                left : '-10000px',
                top : '-10000px'
            });

            $root.show();

            definePostion(opt);

            isColorPickerShow = true;

            isShortCut = opt.isShortCut || false;

            initColor(color);

            // define colorpicker callback
            colorpickerCallback = function (colorString) {
                callback(colorString);
            }

            // define hide delay
            hideDelay = opt.hideDelay || 2000;
            if (hideDelay > 0) {
                setHideDelay(hideDelay);
            }

        }


        var timerCloseColorPicker;
        function setHideDelay (delayTime) {
            delayTime = delayTime || 0;
            removeEvent($root.el, 'mouseenter');
            removeEvent($root.el, 'mouseleave');

            addEvent($root.el, 'mouseenter', function () {
               clearTimeout(timerCloseColorPicker);
            });

            addEvent($root.el, 'mouseleave', function () {
                clearTimeout(timerCloseColorPicker);
                timerCloseColorPicker = setTimeout(hide, delayTime);
            });

            clearTimeout(timerCloseColorPicker);
            timerCloseColorPicker = setTimeout(hide, delayTime);
        }

        function hide () {
            if (isColorPickerShow) {
                destroy();
                $root.hide();
                $root.remove();
                isColorPickerShow = false;
            }

        }

        init();

        return {
            isShortCut : function () {
                return isShortCut;
            },
            $root: $root,
            show: show,
            hide: hide,
            setColor: setColor,
            getColor: getColor
        }
    })

});
