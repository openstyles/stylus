'use strict';

define(require => {
  const {tryJSONparse} = require('/js/toolbox');
  const {
    $,
    $create,
    $createLink,
    messageBoxProxy,
  } = require('/js/dom');
  const t = require('/js/localization');
  const {chromeSync} = require('/js/storage-util');
  const editor = require('./editor');
  const {DEFAULTS, worker} = require('./linter-manager');
  const {getIssues} = require('./linter-report');
  const {
    helpPopup,
    rerouteHotkeys,
    showCodeMirrorPopup,
  } = require('./util');

  /** @type {{csslint:{}, stylelint:{}}} */
  const RULES = {};
  let cm;
  let defaultConfig;
  let isStylelint;
  let linter;
  let popup;

  return {

    async showLintConfig() {
      linter = $('#editor.linter').value;
      if (!linter) {
        return;
      }
      if (!RULES[linter]) {
        worker.getRules(linter).then(res => (RULES[linter] = res));
      }
      await require([
        '/vendor/codemirror/mode/javascript/javascript',
        '/vendor/codemirror/addon/lint/json-lint',
        'js!/vendor/jsonlint/jsonlint',
      ]);
      const config = await chromeSync.getLZValue(chromeSync.LZ_KEY[linter]);
      const title = t('linterConfigPopupTitle', isStylelint ? 'Stylelint' : 'CSSLint');
      isStylelint = linter === 'stylelint';
      defaultConfig = stringifyConfig(DEFAULTS[linter]);
      popup = showCodeMirrorPopup(title, null, {
        extraKeys: {'Ctrl-Enter': onConfigSave},
        hintOptions: {hint},
        lint: true,
        mode: 'application/json',
        value: config ? stringifyConfig(config) : defaultConfig,
      });
      $('.contents', popup).appendChild(
        $create('div', [
          $create('p', [
            $createLink(
              isStylelint
                ? 'https://stylelint.io/user-guide/rules/'
                : 'https://github.com/CSSLint/csslint/wiki/Rules-by-ID',
              t('linterRulesLink')),
            linter === 'csslint' ? ' ' + t('linterCSSLintSettings') : '',
          ]),
          $create('.buttons', [
            $create('button.save', {onclick: onConfigSave, title: 'Ctrl-Enter'}, t('styleSaveLabel')),
            $create('button.cancel', {onclick: onConfigCancel}, t('confirmClose')),
            $create('button.reset', {onclick: onConfigReset, title: t('linterResetMessage')},
              t('genericResetLabel')),
          ]),
        ]));
      cm = popup.codebox;
      cm.focus();
      cm.on('changes', updateConfigButtons);
      updateConfigButtons();
      rerouteHotkeys(false);
      window.on('closeHelp', onConfigClose, {once: true});
    },

    async showLintHelp() {
      // FIXME: implement a linterChooser?
      const linter = $('#editor.linter').value;
      const baseUrl = linter === 'stylelint'
        ? 'https://stylelint.io/user-guide/rules/'
        // some CSSLint rules do not have a url
        : 'https://github.com/CSSLint/csslint/issues/535';
      let headerLink, template;
      if (linter === 'csslint') {
        headerLink = $createLink('https://github.com/CSSLint/csslint/wiki/Rules', 'CSSLint');
        template = ({rule: ruleID}) => {
          const rule = RULES.csslint.find(rule => rule.id === ruleID);
          return rule &&
            $create('li', [
              $create('b', $createLink(rule.url || baseUrl, rule.name)),
              $create('br'),
              rule.desc,
            ]);
        };
      } else {
        headerLink = $createLink(baseUrl, 'stylelint');
        template = rule =>
          $create('li',
            rule === 'CssSyntaxError' ? rule : $createLink(baseUrl + rule, rule));
      }
      const header = t('linterIssuesHelp', '\x01').split('\x01');
      const activeRules = new Set([...getIssues()].map(issue => issue.rule));
      helpPopup.show(t('linterIssues'),
        $create([
          header[0], headerLink, header[1],
          $create('ul.rules', [...activeRules].map(template)),
        ]));
    },
  };

  function getLexicalDepth(lexicalState) {
    let depth = 0;
    while ((lexicalState = lexicalState.prev)) {
      depth++;
    }
    return depth;
  }

  function hint(cm) {
    const rules = RULES[linter];
    let ruleIds, options;
    if (isStylelint) {
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

    if (depth === 1 && isStylelint) {
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
  }

  function onConfigCancel() {
    helpPopup.close();
    editor.closestVisible().focus();
  }

  function onConfigClose() {
    rerouteHotkeys(true);
    cm = null;
  }

  function onConfigReset(event) {
    event.preventDefault();
    cm.setValue(defaultConfig);
    cm.focus();
    updateConfigButtons();
  }

  async function onConfigSave(event) {
    if (event instanceof Event) {
      event.preventDefault();
    }
    const json = tryJSONparse(cm.getValue());
    if (!json) {
      showLinterErrorMessage(linter, t('linterJSONError'), popup);
      cm.focus();
      return;
    }
    let invalid;
    if (isStylelint) {
      invalid = Object.keys(json.rules).filter(k => !RULES.stylelint.hasOwnProperty(k));
    } else {
      const ids = RULES.csslint.map(r => r.id);
      invalid = Object.keys(json).filter(k => !ids.includes(k));
    }
    if (invalid.length) {
      showLinterErrorMessage(linter, [
        t('linterInvalidConfigError'),
        $create('ul', invalid.map(name => $create('li', name))),
      ], popup);
      return;
    }
    chromeSync.setLZValue(chromeSync.LZ_KEY[linter], json);
    cm.markClean();
    cm.focus();
    updateConfigButtons();
  }

  function stringifyConfig(config) {
    return JSON.stringify(config, null, 2)
      .replace(/,\n\s+{\n\s+("severity":\s"\w+")\n\s+}/g, ', {$1}');
  }

  async function showLinterErrorMessage(title, contents, popup) {
    await messageBoxProxy.show({
      title,
      contents,
      className: 'danger center lint-config',
      buttons: [t('confirmOK')],
    });
    if (popup && popup.codebox) {
      popup.codebox.focus();
    }
  }

  function updateConfigButtons() {
    $('.save', popup).disabled = cm.isClean();
    $('.reset', popup).disabled = cm.getValue() === defaultConfig;
    $('.cancel', popup).textContent = t(cm.isClean() ? 'confirmClose' : 'confirmCancel');
  }
});
