/* global linter editorWorker cacheFirstCall */
'use strict';

var csslint = (() => { // eslint-disable-line
  const DEFAULT = {
    // Default warnings
    'display-property-grouping': 1,
    'duplicate-properties': 1,
    'empty-rules': 1,
    'errors': 1,
    'warnings': 1,
    'known-properties': 1,

    // Default disabled
    'adjoining-classes': 0,
    'box-model': 0,
    'box-sizing': 0,
    'bulletproof-font-face': 0,
    'compatible-vendor-prefixes': 0,
    'duplicate-background-images': 0,
    'fallback-colors': 0,
    'floats': 0,
    'font-faces': 0,
    'font-sizes': 0,
    'gradients': 0,
    'ids': 0,
    'import': 0,
    'import-ie-limit': 0,
    'important': 0,
    'order-alphabetical': 0,
    'outline-none': 0,
    'overqualified-elements': 0,
    'qualified-headings': 0,
    'regex-selectors': 0,
    'rules-count': 0,
    'selector-max': 0,
    'selector-max-approaching': 0,
    'selector-newline': 0,
    'shorthand': 0,
    'star-property-hack': 0,
    'text-indent': 0,
    'underscore-property-hack': 0,
    'unique-headings': 0,
    'universal-selector': 0,
    'unqualified-attributes': 0,
    'vendor-prefix': 0,
    'zero-units': 0
  };
  let config;

  const prepareConfig = cacheFirstCall(() => {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.hasOwnProperty('editorCSSLintConfig')) {
        return;
      }
      getNewValue().then(linter.refresh);
    });
    return getNewValue();

    function getNewValue() {
      return chromeSync.getLZValue('editorCSSLintConfig')
        .then(newConfig => {
          config = Object.assign({}, DEFAULT, newConfig);
        });
    }
  });

  linter.register((text, options, cm) => {
    if (prefs.get('editor.linter') !== 'csslint' || cm.getOption('mode') !== 'css') {
      return;
    }
    return prepareConfig()
      .then(() => editorWorker.csslint(text, config))
      .then(results =>
        results
          .map(({line, col: ch, message, rule, type: severity}) => line && {
            message,
            from: {line: line - 1, ch: ch - 1},
            to: {line: line - 1, ch},
            rule: rule.id,
            severity,
          })
          .filter(Boolean)
      );
  });

  return {DEFAULT};
})();
