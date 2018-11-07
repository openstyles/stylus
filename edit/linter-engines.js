/* global LINTER_DEFAULTS linter editorWorker prefs chromeSync */
'use strict';

(() => {
  registerLinters({
    csslint: {
      storageName: 'editorCSSLintConfig',
      lint: csslint,
      validMode: mode => mode === 'css',
      getConfig: config => Object.assign({}, LINTER_DEFAULTS.CSSLINT, config)
    },
    stylelint: {
      storageName: 'editorStylelintConfig',
      lint: stylelint,
      validMode: () => true,
      getConfig: config => ({
        syntax: 'sugarss',
        rules: Object.assign({}, LINTER_DEFAULTS.STYLELINT.rules, config && config.rules)
      })
    }
  });

  function stylelint(text, config, mode) {
    return editorWorker.stylelint(text, config)
      .then(({results}) => {
        if (!results[0]) {
          return [];
        }
        const output = results[0].warnings.map(({line, column: ch, text, severity}) =>
          ({
            from: {line: line - 1, ch: ch - 1},
            to: {line: line - 1, ch},
            message: text
              .replace('Unexpected ', '')
              .replace(/^./, firstLetter => firstLetter.toUpperCase())
              .replace(/\s*\([^(]+\)$/, ''), // strip the rule,
            rule: text.replace(/^.*?\s*\(([^(]+)\)$/, '$1'),
            severity,
          })
        );
        return mode !== 'stylus' ?
          output :
          output.filter(({message}) =>
            !message.includes('"@css"') || !message.includes('(at-rule-no-unknown)'));
      });
  }

  function csslint(text, config) {
    return editorWorker.csslint(text, config)
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
  }

  function registerLinters(engines) {
    const configs = new Map();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }
      for (const [name, engine] of Object.entries(engines)) {
        if (changes.hasOwnProperty(engine.storageName)) {
          chromeSync.getLZValue(engine.storageName)
            .then(config => {
              configs.set(name, engine.getConfig(config));
              linter.run();
            });
        }
      }
    });

    linter.register((text, options, cm) => {
      const selectedLinter = prefs.get('editor.linter');
      if (!selectedLinter) {
        return;
      }
      const mode = cm.getOption('mode');
      if (engines[selectedLinter].validMode(mode)) {
        return runLint(selectedLinter);
      }
      for (const [name, engine] of Object.entries(engines)) {
        if (engine.validMode(mode)) {
          return runLint(name);
        }
      }

      function runLint(name) {
        return getConfig(name)
          .then(config => engines[name].lint(text, config, mode));
      }
    });

    function getConfig(name) {
      if (configs.has(name)) {
        return Promise.resolve(configs.get(name));
      }
      return chromeSync.getLZValue(engines[name].storageName)
        .then(config => {
          configs.set(name, engines[name].getConfig(config));
          return configs.get(name);
        });
    }
  }
})();
