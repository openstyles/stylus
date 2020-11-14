/* global LINTER_DEFAULTS linter editorWorker prefs chromeSync */
'use strict';

(() => {
  registerLinters({
    csslint: {
      storageName: chromeSync.LZ_KEY.csslint,
      lint: csslint,
      validMode: mode => mode === 'css',
      getConfig: config => Object.assign({}, LINTER_DEFAULTS.CSSLINT, config),
    },
    stylelint: {
      storageName: chromeSync.LZ_KEY.stylelint,
      lint: stylelint,
      validMode: () => true,
      getConfig: config => ({
        syntax: 'sugarss',
        rules: Object.assign({}, LINTER_DEFAULTS.STYLELINT.rules, config && config.rules),
      }),
    },
  });

  async function stylelint(text, config, mode) {
    const raw = await editorWorker.stylelint(text, config);
    if (!raw) {
      return [];
    }
    // Hiding the errors about "//" comments as we're preprocessing only when saving/applying
    // and we can't just pre-remove the comments since "//" may be inside a string token or whatever
    const slashCommentAllowed = mode === 'text/x-less' || mode === 'stylus';
    const res = [];
    for (const w of raw.warnings) {
      const msg = w.text.match(/^(?:Unexpected\s+)?(.*?)\s*\([^()]+\)$|$/)[1] || w.text;
      if (!slashCommentAllowed || !(
          w.rule === 'no-invalid-double-slash-comments' ||
          w.rule === 'property-no-unknown' && msg.includes('"//"')
      )) {
        res.push({
          from: {line: w.line - 1, ch: w.column - 1},
          to: {line: w.line - 1, ch: w.column},
          message: msg.slice(0, 1).toUpperCase() + msg.slice(1),
          severity: w.severity,
          rule: w.rule,
        });
      }
    }
    return res;
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
