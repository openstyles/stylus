/* global importScripts parserlib CSSLint parseMozFormat */
'use strict';

importScripts('/vendor-overwrites/csslint/parserlib.js', '/js/moz-parser.js');
parserlib.css.Tokens[parserlib.css.Tokens.COMMENT].hide = false;

self.onmessage = ({data}) => {
  self.postMessage(parseMozFormat(data));
};
