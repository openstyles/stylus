/* global memoize editorWorker showCodeMirrorPopup loadScript messageBox
  LINTER_DEFAULTS rerouteHotkeys $ $create $createLink tryJSONparse t
  chromeSync */
'use strict';

(() => {
  document.addEventListener('DOMContentLoaded', () => {
    $('#linter-settings').addEventListener('click', showLintConfig);
  }, {once: true});

  function stringifyConfig(config) {
    return JSON.stringify(config, null, 2)
      .replace(/,\n\s+\{\n\s+("severity":\s"\w+")\n\s+\}/g, ', {$1}');
  }

  function showLinterErrorMessage(title, contents, popup) {
    messageBox({
      title,
      contents,
      className: 'danger center lint-config',
      buttons: [t('confirmOK')],
    }).then(() => popup && popup.codebox && popup.codebox.focus());
  }

  function showLintConfig() {
    const linter = $('#editor.linter').value;
    if (!linter) {
      return;
    }
    const storageName = linter === 'stylelint' ? 'editorStylelintConfig' : 'editorCSSLintConfig';
    const getRules = memoize(linter === 'stylelint' ?
      editorWorker.getStylelintRules : editorWorker.getCsslintRules);
    const linterTitle = linter === 'stylelint' ? 'Stylelint' : 'CSSLint';
    const defaultConfig = stringifyConfig(
      linter === 'stylelint' ? LINTER_DEFAULTS.STYLELINT : LINTER_DEFAULTS.CSSLINT
    );
    const title = t('linterConfigPopupTitle', linterTitle);
    const popup = showCodeMirrorPopup(title, null, {
      lint: false,
      extraKeys: {'Ctrl-Enter': save},
      hintOptions: {hint},
    });
    $('.contents', popup).appendChild(makeFooter());

    let cm = popup.codebox;
    cm.focus();
    chromeSync.getLZValue(storageName).then(config => {
      cm.setValue(config ? stringifyConfig(config) : defaultConfig);
      cm.clearHistory();
      cm.markClean();
      updateButtonState();
    });
    cm.on('changes', updateButtonState);

    rerouteHotkeys(false);
    window.addEventListener('closeHelp', function _() {
      window.removeEventListener('closeHelp', _);
      rerouteHotkeys(true);
      cm = null;
    });

    loadScript([
      '/vendor/codemirror/mode/javascript/javascript.js',
      '/vendor/codemirror/addon/lint/json-lint.js',
      '/vendor/jsonlint/jsonlint.js'
    ]).then(() => {
      cm.setOption('mode', 'application/json');
      cm.setOption('lint', true);
    });

    function findInvalidRules(config, linter) {
      return getRules()
        .then(rules => {
          if (linter === 'stylelint') {
            return Object.keys(config.rules).filter(k => !config.rules.hasOwnProperty(k));
          }
          const ruleSet = new Set(rules.map(r => r.id));
          return Object.keys(config).filter(k => !ruleSet.has(k));
        });
    }

    function makeFooter() {
      return $create('div', [
        $create('p', [
          $createLink(
            linter === 'stylelint'
              ? 'https://stylelint.io/user-guide/rules/'
              : 'https://github.com/CSSLint/csslint/wiki/Rules-by-ID',
            t('linterRulesLink')),
          linter === 'csslint' ? ' ' + t('linterCSSLintSettings') : '',
        ]),
        $create('.buttons', [
          $create('button.save', {onclick: save, title: 'Ctrl-Enter'}, t('styleSaveLabel')),
          $create('button.cancel', {onclick: cancel}, t('confirmClose')),
          $create('button.reset', {onclick: reset, title: t('linterResetMessage')}, t('genericResetLabel')),
        ]),
      ]);
    }

    function save(event) {
      if (event instanceof Event) {
        event.preventDefault();
      }
      const json = tryJSONparse(cm.getValue());
      if (!json) {
        showLinterErrorMessage(linter, t('linterJSONError'), popup);
        cm.focus();
        return;
      }
      findInvalidRules(json, linter).then(invalid => {
        if (invalid.length) {
          showLinterErrorMessage(linter, [
            t('linterInvalidConfigError'),
            $create('ul', invalid.map(name => $create('li', name))),
          ], popup);
          return;
        }
        chromeSync.setLZValue(storageName, json);
        cm.markClean();
        cm.focus();
        updateButtonState();
      });
    }

    function reset(event) {
      event.preventDefault();
      cm.setValue(defaultConfig);
      cm.focus();
      updateButtonState();
    }

    function cancel(event) {
      event.preventDefault();
      $('.dismiss').dispatchEvent(new Event('click'));
    }

    function updateButtonState() {
      $('.save', popup).disabled = cm.isClean();
      $('.reset', popup).disabled = cm.getValue() === defaultConfig;
      $('.cancel', popup).textContent = t(cm.isClean() ? 'confirmClose' : 'confirmCancel');
    }

    function hint(cm) {
      return getRules().then(rules => {
        let ruleIds, options;
        if (linter === 'stylelint') {
          ruleIds = Object.keys(rules);
          options = rules;
        } else {
          ruleIds = rules.map(r => r.id);
          options = {};
        }
        const cursor = cm.getCursor();
        const {start, end, string, type, state: {lexical}} = cm.getTokenAt(cursor);
        const {line, ch} = cursor;

        const quoted = string.startsWith('"');
        const leftPart = string.slice(quoted ? 1 : 0, ch - start).trim();
        const depth = getLexicalDepth(lexical);

        const search = cm.getSearchCursor(/"([-\w]+)"/, {line, ch: start - 1});
        let [, prevWord] = search.find(true) || [];
        let words = [];

        if (depth === 1 && linter === 'stylelint') {
          words = quoted ? ['rules'] : [];
        } else if ((depth === 1 || depth === 2) && type && type.includes('property')) {
          words = ruleIds;
        } else if (depth === 2 || depth === 3 && lexical.type === ']') {
          words = !quoted ? ['true', 'false', 'null'] :
            ruleIds.includes(prevWord) && (options[prevWord] || [])[0] || [];
        } else if (depth === 4 && prevWord === 'severity') {
          words = ['error', 'warning'];
        } else if (depth === 4) {
          words = ['ignore', 'ignoreAtRules', 'except', 'severity'];
        } else if (depth === 5 && lexical.type === ']' && quoted) {
          while (prevWord && !ruleIds.includes(prevWord)) {
            prevWord = (search.find(true) || [])[1];
          }
          words = (options[prevWord] || []).slice(-1)[0] || ruleIds;
        }
        return {
          list: words.filter(word => word.startsWith(leftPart)),
          from: {line, ch: start + (quoted ? 1 : 0)},
          to: {line, ch: string.endsWith('"') ? end - 1 : end},
        };
      });
    }

    function getLexicalDepth(lexicalState) {
      let depth = 0;
      while ((lexicalState = lexicalState.prev)) {
        depth++;
      }
      return depth;
    }
  }
})();
