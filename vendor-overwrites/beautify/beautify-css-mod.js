/*jshint curly:true, eqeqeq:true, laxbreak:true, noempty:false */
/*

  The MIT License (MIT)

  Copyright (c) 2007-2017 Einar Lielmanis, Liam Newman, and contributors.

  Permission is hereby granted, free of charge, to any person
  obtaining a copy of this software and associated documentation files
  (the "Software"), to deal in the Software without restriction,
  including without limitation the rights to use, copy, modify, merge,
  publish, distribute, sublicense, and/or sell copies of the Software,
  and to permit persons to whom the Software is furnished to do so,
  subject to the following conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
  BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
  ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
  CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.


 CSS Beautifier
---------------

    Written by Harutyun Amirjanyan, (amirjanyan@gmail.com)

    Based on code initially developed by: Einar Lielmanis, <einar@jsbeautifier.org>
        http://jsbeautifier.org/

    Usage:
        css_beautify(source_text);
        css_beautify(source_text, options);

    The options are (default in brackets):
        indent_size (4)                         — indentation size,
        indent_char (space)                     — character to indent with,
        preserve_newlines (default false)       - whether existing line breaks should be preserved,
        selector_separator_newline (true)       - separate selectors with newline or
                                                  not (e.g. "a,\nbr" or "a, br")
        end_with_newline (false)                - end with a newline
        newline_between_rules (true)            - add a new line after every css rule
        space_around_selector_separator (false) - ensure space around selector separators:
                                                  '>', '+', '~' (e.g. "a>b" -> "a > b")
    e.g

    css_beautify(css_source_text, {
      'indent_size': 1,
      'indent_char': '\t',
      'selector_separator': ' ',
      'end_with_newline': false,
      'newline_between_rules': true,
      'space_around_selector_separator': true
    });
*/

// http://www.w3.org/TR/CSS21/syndata.html#tokenization
// http://www.w3.org/TR/css3-syntax/

(function() {

    function mergeOpts(allOptions, targetType) {
        var finalOpts = {};
        var name;

        for (name in allOptions) {
            if (name !== targetType) {
                finalOpts[name] = allOptions[name];
            }
        }


        //merge in the per type settings for the targetType
        if (targetType in allOptions) {
            for (name in allOptions[targetType]) {
                finalOpts[name] = allOptions[targetType][name];
            }
        }
        return finalOpts;
    }

    var lineBreak = /\r\n|[\n\r\u2028\u2029]/;
    var allLineBreaks = new RegExp(lineBreak.source, 'g');

    function css_beautify(source_text, options) {
        options = options || {};

        // Allow the setting of language/file-type specific options
        // with inheritance of overall settings
        options = mergeOpts(options, 'css');

        source_text = source_text || '';

        var newlinesFromLastWSEat = 0;
        var indentSize = options.indent_size ? parseInt(options.indent_size, 10) : 4;
        var indentCharacter = options.indent_char || ' ';
        var eol = options.eol ? options.eol : 'auto';
        var {
            preserve_newlines = false,
            selector_separator_newline = true,
            end_with_newline = false,
            newline_between_rules = true,
            space_around_combinator = true,
            indent_conditional = true,
            newline_between_properties = true,
            newline_before_open_brace = false,
            newline_after_open_brace = true,
            newline_before_close_brace = true,
        } = options;

        var translatePos = (options.translate_positions || [])[0];
        var translatePosIndex = 0;
        var translatePosLine = translatePos && translatePos.line;
        var translatePosCol = translatePos && translatePos.ch;
        var inputPosLine = 0, inputPosCol = 0;
        var outputPosLine = 0, outputPosCol = 0;

        if (options.indent_with_tabs) {
            indentCharacter = '\t';
            indentSize = 1;
        }

        if (eol === 'auto') {
            eol = '\n';
            if (source_text && lineBreak.test(source_text || '')) {
                eol = source_text.match(lineBreak)[0];
            }
        }

        eol = eol.replace(/\\r/, '\r').replace(/\\n/, '\n');

        // HACK: newline parsing inconsistent. This brute force normalizes the input.
        source_text = source_text.replace(allLineBreaks, '\n');

        // tokenizer
        var whiteRe = /^\s+$/;

        var pos = -1,
            ch;
        var parenLevel = 0;

        function next(resetLine, resetCol) {
            if (resetLine !== undefined) {
                inputPosLine = resetLine;
                inputPosCol = resetCol;
                if (inputPosCol < 0) {
                    inputPosLine--;
                    inputPosCol = pos - source_text.lastIndexOf('\n', pos);
                }
            }
            ch = source_text.charAt(++pos);
            if (translatePos) {
                inputPosCol++;
                if (ch == '\n') {
                    inputPosLine++;
                    inputPosCol = 0;
                }
                if (inputPosLine == translatePosLine && inputPosCol >= translatePosCol
                || inputPosLine > translatePosLine) {
                    translatePos.line = outputPosLine - (inputPosLine - translatePosLine);
                    translatePos.ch = outputPosCol - (inputPosCol - translatePosCol);
                    translatePos.ch += translatePos.ch ? 1 : 0;
                    translatePos = options.translate_positions[++translatePosIndex];
                    translatePosLine = translatePos && translatePos.line;
                    translatePosCol = translatePos && translatePos.ch;
                }
            }
            return ch || '';
        }

        function peek(skipWhitespace) {
            var result = '';
            var prev_pos = pos;
            var prevInputPosLine = inputPosLine;
            var prevInputPosCol = inputPosCol;
            if (skipWhitespace) {
                eatWhitespace();
            }
            result = source_text.charAt(pos + 1) || '';
            pos = prev_pos - 1;
            next(prevInputPosLine, prevInputPosCol - 1);
            return result;
        }

        function eatString(endChars) {
            var start = pos;
            while (next()) {
                if (ch === "\\") {
                    next();
                } else if (endChars.indexOf(ch) !== -1) {
                    break;
                } else if (ch === "\n") {
                    break;
                }
            }
            return source_text.substring(start, pos + 1);
        }

        function peekString(endChar) {
            var prev_pos = pos;
            var prevInputPosLine = inputPosLine;
            var prevInputPosCol = inputPosCol;
            var str = eatString(endChar);
            pos = prev_pos - 1;
            next(prevInputPosLine, prevInputPosCol - 1);
            return str;
        }

        function eatWhitespace(preserve_newlines_local) {
            var result = 0;
            while (whiteRe.test(peek())) {
                next();
                if (ch === '\n' && preserve_newlines_local && preserve_newlines) {
                    print.newLine(true);
                    result++;
                }
            }
            newlinesFromLastWSEat = result;
            return result;
        }

        function skipWhitespace() {
            var result = '';
            if (ch && whiteRe.test(ch)) {
                result = ch;
            }
            while (whiteRe.test(next())) {
                result += ch;
            }
            return result;
        }

        function eatComment(singleLine) {
            var start = pos;
            singleLine = peek() === "/";
            next();
            while (next()) {
                if (!singleLine && ch === "*" && peek() === "/") {
                    next();
                    break;
                } else if (singleLine && ch === "\n") {
                    return source_text.substring(start, pos);
                }
            }

            return source_text.substring(start, pos) + ch;
        }


        function lookBack(str) {
            return source_text.substring(pos - str.length, pos).toLowerCase() ===
                str;
        }

        // Nested pseudo-class if we are insideRule
        // and the next special character found opens
        // a new block
        function foundNestedPseudoClass() {
            var openParen = 0;
            for (var i = pos + 1; i < source_text.length; i++) {
                var ch = source_text.charAt(i);
                if (ch === "{") {
                    return true;
                } else if (ch === '(') {
                    // pseudoclasses can contain ()
                    openParen += 1;
                } else if (ch === ')') {
                    if (openParen === 0) {
                        return false;
                    }
                    openParen -= 1;
                } else if (ch === ";" || ch === "}") {
                    return false;
                }
            }
            return false;
        }

        // printer
        var basebaseIndentString = source_text.match(/^[\t ]*/)[0];
        var singleIndent = new Array(indentSize + 1).join(indentCharacter);
        var indentLevel = 0;
        var nestedLevel = 0;

        function indent() {
            indentLevel++;
            basebaseIndentString += singleIndent;
        }

        function outdent() {
            indentLevel--;
            basebaseIndentString = basebaseIndentString.slice(0, -indentSize);
        }

        var print = {};
        print["{"] = function(ch) {
            newline_before_open_brace ? print.newLine() : print.singleSpace();
            output.push(ch);
            outputPosCol++;
            if (!enteringConditionalGroup || indent_conditional) {
                indent();
            }
            if (!eatWhitespace(true)) {
                newline_after_open_brace || enteringConditionalGroup ? print.newLine() : print.singleSpace();
            }
        };
        print["}"] = function(newline) {
            if (newline) {
                newline_before_close_brace ? print.newLine() : (print.trim(), print.singleSpace());
            }
            output.push('}');
            outputPosCol++;
            if (!eatWhitespace(true) && peek(true) != '}') {
                print.newLine();
            }
        };

        print._lastCharWhitespace = function() {
            return whiteRe.test(output[output.length - 1]);
        };

        print.newLine = function(keepWhitespace) {
            if (output.length) {
                if (!keepWhitespace && output[output.length - 1] !== '\n') {
                    print.trim();
                } else if (output[output.length - 1] === basebaseIndentString) {
                    output.pop();
                    outputPosCol -= basebaseIndentString.length;
                }
                output.push('\n');
                outputPosLine++;
                outputPosCol = 0;

                if (basebaseIndentString) {
                    output.push(basebaseIndentString);
                    outputPosCol += basebaseIndentString.length;
                }
            }
        };
        print.singleSpace = function() {
            if (output.length && !print._lastCharWhitespace()) {
                output.push(' ');
                outputPosCol++;
            }
        };

        print.preserveSingleSpace = function() {
            if (isAfterSpace) {
                print.singleSpace();
            }
        };

        print.trim = function() {
            while (print._lastCharWhitespace()) {
                const text = output.pop();
                if (text.indexOf('\n') >= 0) {
                    outputPosLine -= text.match(/\n/g).length;
                }
            }
            outputPosCol = 0;
            let i = output.length;
            let token;
            while (--i >= 0 && (token = output[i]) != '\n') {
                outputPosCol += token.length;
            }
        };

        print.text = function(text) {
            output.push(text);
            if (text.indexOf('\n') < 0) {
                outputPosCol += text.length;
            } else {
                outputPosLine += text.match(/\n/g).length;
                outputPosCol = text.length - text.lastIndexOf('\n') - 1;
            }
        };


        var output = [];
        /*_____________________--------------------_____________________*/

        var insideRule = false;
        var insidePropertyValue = false;
        var enteringConditionalGroup = false;
        var insideConditionalGroup = false;
        var top_ch = '';
        var last_top_ch = '';

        while (true) {
            var whitespace = skipWhitespace();
            var isAfterSpace = whitespace !== '';
            var isAfterNewline = whitespace.indexOf('\n') !== -1;
            last_top_ch = top_ch;
            top_ch = ch;

            if (!ch) {
                break;
            } else if (ch === '/' && peek() === '*') { /* css comment */
                print.text(eatComment());
                if (peek() !== ';') print.newLine();
            } else if (ch === '/' && peek() === '/') { // single line comment
                if (!isAfterNewline && last_top_ch !== '{') {
                    print.trim();
                }
                print.singleSpace();
                print.text(eatComment());
                print.newLine();
            } else if (ch === '@') {
                print.preserveSingleSpace();

                // deal with less propery mixins @{...}
                if (peek() === '{') {
                    print.text(eatString('}'));
                } else {
                    output.push(ch);
                    outputPosCol++;

                    // strip trailing space, if present, for hash property checks
                    var variableOrRule = peekString(": ,;{}()[]/='\"");

                    if (variableOrRule.match(/[ :]$/)) {
                        // we have a variable or pseudo-class, add it and insert one space before continuing
                        next();
                        variableOrRule = eatString(": ").replace(/\s$/, '');
                        print.text(variableOrRule);
                        print.singleSpace();
                    }

                    variableOrRule = '@' + variableOrRule.replace(/\s$/, '');

                    // might be a nesting at-rule
                    if (variableOrRule in css_beautify.NESTED_AT_RULE) {
                        nestedLevel += 1;
                        if (variableOrRule in css_beautify.CONDITIONAL_GROUP_RULE) {
                            enteringConditionalGroup = true;
                            if (!indent_conditional) {
                                nestedLevel--;
                            }
                        }
                    }
                }
            } else if (ch === '#' && peek() === '{') {
                print.preserveSingleSpace();
                print.text(eatString('}'));
            } else if (ch === '{') {
                if (peek(true) === '}') {
                    eatWhitespace();
                    next();
                    print.singleSpace();
                    output.push("{");
                    outputPosCol++;
                    print['}'](false);
                    if (newlinesFromLastWSEat < 2 && newline_between_rules && indentLevel === 0) {
                        print.newLine(true);
                    }
                } else {
                    print["{"](ch);
                    // when entering conditional groups, only rulesets are allowed
                    if (enteringConditionalGroup) {
                        enteringConditionalGroup = false;
                        insidePropertyValue = false;
                        insideConditionalGroup = true;
                        insideRule = (indentLevel > nestedLevel);
                    } else {
                        // otherwise, declarations are also allowed
                        insideRule = (indentLevel >= nestedLevel);
                    }
                }
            } else if (ch === '}') {
                outdent();
                print["}"](true);
                insideRule = false;
                insidePropertyValue = false;
                if (nestedLevel && (indent_conditional || !insideConditionalGroup)) {
                    nestedLevel--;
                }
                insideConditionalGroup = false;
                if (newlinesFromLastWSEat < 2
                && newline_between_rules
                //&& indentLevel === 0
                && peek(true) != '}') {
                    print.newLine(true);
                }
            } else if (ch === ":") {
                eatWhitespace();
                if ((insideRule || enteringConditionalGroup) &&
                    !(lookBack("&") || foundNestedPseudoClass()) &&
                    !lookBack("(")) {
                    // 'property: value' delimiter
                    // which could be in a conditional group query
                    output.push(':');
                    outputPosCol++;
                    if (!insidePropertyValue) {
                        insidePropertyValue = true;
                        print.singleSpace();
                    }
                } else {
                    // sass/less parent reference don't use a space
                    // sass nested pseudo-class don't use a space

                    // preserve space before pseudoclasses/pseudoelements, as it means "in any child"
                    if (lookBack(" ") && outputPosCol && !/\s$/.test(output[output.length - 1])) {
                        output.push(" ");
                        outputPosCol++;
                    }

                    if (peek() === ":") {
                        // pseudo-element
                        next();
                        output.push("::");
                        outputPosCol += 2;
                    } else {
                        // pseudo-class
                        output.push(':');
                        outputPosCol++;
                    }
                }
            } else if (ch === '"' || ch === '\'') {
                print.preserveSingleSpace();
                print.text(eatString(ch));
            } else if (ch === ';') {
                insidePropertyValue = false;
                output.push(ch);
                outputPosCol++;
                if (!eatWhitespace(true)) {
                    newline_between_properties ? print.newLine() : print.singleSpace();
                }
            } else if (ch === '(') { // may be a url
                if (lookBack("url")) {
                    output.push(ch);
                    outputPosCol++;
                    eatWhitespace();
                    if (next()) {
                        if (ch !== ')' && ch !== '"' && ch !== '\'') {
                            print.text(eatString(')'));
                        } else {
                            pos--;
                        }
                    }
                } else {
                    parenLevel++;
                    print.preserveSingleSpace();
                    output.push(ch);
                    outputPosCol++;
                    eatWhitespace();
                }
            } else if (ch === ')') {
                output.push(ch);
                outputPosCol++;
                parenLevel--;
            } else if (ch === ',') {
                output.push(ch);
                outputPosCol++;
                if (!eatWhitespace(true) && selector_separator_newline && !insidePropertyValue && parenLevel < 1) {
                    print.newLine();
                } else {
                    print.singleSpace();
                }
            } else if ((ch === '>' || ch === '+' || ch === '~') &&
                !insidePropertyValue && parenLevel < 1) {
                //handle combinator spacing
                if (space_around_combinator) {
                    print.singleSpace();
                    output.push(ch);
                    outputPosCol++;
                    print.singleSpace();
                } else {
                    output.push(ch);
                    outputPosCol++;
                    eatWhitespace();
                    // squash extra whitespace
                    if (ch && whiteRe.test(ch)) {
                        ch = '';
                    }
                }
            } else if (ch === ']') {
                output.push(ch);
                outputPosCol++;
            } else if (ch === '[') {
                print.preserveSingleSpace();
                output.push(ch);
                outputPosCol++;
            } else if (ch === '=') { // no whitespace before or after
                eatWhitespace();
                output.push('=');
                outputPosCol++;
                if (whiteRe.test(ch)) {
                    ch = '';
                }
            } else {
                print.preserveSingleSpace();
                output.push(ch);
                outputPosCol++;
            }
        }


        var sweetCode = '';
        if (basebaseIndentString) {
            sweetCode += basebaseIndentString;
        }

        sweetCode += output.join('').replace(/[\r\n\t ]+$/, '');

        // establish end_with_newline
        if (end_with_newline) {
            sweetCode += '\n';
        }

        if (eol !== '\n') {
            sweetCode = sweetCode.replace(/[\n]/g, eol);
        }

        return sweetCode;
    }

    // https://developer.mozilla.org/en-US/docs/Web/CSS/At-rule
    css_beautify.NESTED_AT_RULE = {
        "@page": true,
        "@font-face": true,
        "@keyframes": true,
        // also in CONDITIONAL_GROUP_RULE below
        "@media": true,
        "@supports": true,
        "@-moz-document": true
    };
    css_beautify.CONDITIONAL_GROUP_RULE = {
        "@media": true,
        "@supports": true,
        "@-moz-document": true
    };

    /*global define */
    if (typeof define === "function" && define.amd) {
        // Add support for AMD ( https://github.com/amdjs/amdjs-api/wiki/AMD#defineamd-property- )
        define([], function() {
            return {
                css_beautify: css_beautify
            };
        });
    } else if (typeof exports !== "undefined") {
        // Add support for CommonJS. Just put this file somewhere on your require.paths
        // and you will be able to `var html_beautify = require("beautify").html_beautify`.
        exports.css_beautify = css_beautify;
    } else if (typeof window !== "undefined") {
        // If we're running a web page and don't have either of the above, add our one global
        window.css_beautify = css_beautify;
    } else if (typeof global !== "undefined") {
        // If we don't even have window, try global.
        global.css_beautify = css_beautify;
    }

}());
