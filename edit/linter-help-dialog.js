/* global showHelp editorWorker memoize $ $create $createLink t */
/* exported createLinterHelpDialog */
'use strict';

function createLinterHelpDialog(getIssues) {
  let csslintRules;
  const prepareCsslintRules = memoize(() =>
    editorWorker.getCsslintRules()
      .then(rules => {
        csslintRules = rules;
      })
  );
  return {show};

  function show() {
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
        const rule = csslintRules.find(rule => rule.id === ruleID);
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
    Promise.resolve(linter === 'csslint' && prepareCsslintRules())
      .then(() =>
        showHelp(t('linterIssues'),
          $create([
            header[0], headerLink, header[1],
            $create('ul.rules', [...activeRules].map(template)),
          ])
        )
      );
  }
}
