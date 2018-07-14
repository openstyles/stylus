/* global importScripts parserlib CSSLint parseMozFormat */
'use strict';

const CSSLINT_PATH = '/vendor-overwrites/csslint/';
importScripts(CSSLINT_PATH + 'parserlib.js');

parserlib.css.Tokens[parserlib.css.Tokens.COMMENT].hide = false;

self.onmessage = ({data}) => {

  const {action = 'run'} = data;

  if (action === 'parse') {
    if (!self.parseMozFormat) self.importScripts('/js/moz-parser.js');
    self.postMessage(parseMozFormat(data));
    return;
  }

  if (!self.CSSLint) self.importScripts(CSSLINT_PATH + 'csslint.js');

  switch (action) {
    case 'getAllRuleIds':
      // the functions are non-tranferable and we need only an id
      self.postMessage(CSSLint.getRules().map(rule => rule.id));
      return;

    case 'getAllRuleInfos':
      // the functions are non-tranferable
      self.postMessage(CSSLint.getRules().map(rule => JSON.parse(JSON.stringify(rule))));
      return;

    case 'run': {
      const {code, config} = data;
      const results = CSSLint.verify(code, config).messages
        //.filter(m => !m.message.includes('/*[[') && !m.message.includes(']]*/'))
        .map(m => Object.assign(m, {rule: {id: m.rule.id}}));
      self.postMessage(results);
      return;
    }
  }
};
