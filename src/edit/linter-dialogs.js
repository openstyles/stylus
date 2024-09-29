import messageBox from '/js/dlg/message-box';
import {$, $create, $createLink} from '/js/dom';
import {t} from '/js/localization';
import {chromeSync} from '/js/storage-util';
import {tryJSONparse} from '/js/toolbox';
import editor from './editor';
import linterMan from './linter-manager';
import {helpPopup, showCodeMirrorPopup} from './util';

/** @type {{csslint:{}, stylelint:{}}} */
const RULES = {};
const KNOWN_RULES = {};
const defaultConfig = {};
let cm;
let knownRules;
let isStylelint;
let linter;
let popup;

export async function showLintConfig() {
  linter = await getLinter();
  if (!linter) {
    return;
  }
  await import('/js/jsonlint-bundle');
  const config = await chromeSync.getLZValue(chromeSync.LZ_KEY[linter]);
  const title = t('linterConfigPopupTitle', isStylelint ? 'Stylelint' : 'CSSLint');
  const activeRules = new Set(getActiveRules());
  isStylelint = linter === 'stylelint';
  knownRules = KNOWN_RULES[linter] || (
    KNOWN_RULES[linter] = new Set((
      isStylelint
        ? Object.keys(RULES[linter])
        : RULES[linter].map(r => r.id)
    ).sort()));
  for (let cfg of [
    config,
    !defaultConfig[linter] && linterMan.DEFAULTS[linter],
  ].filter(Boolean)) {
    const missingRules = new Set(knownRules);
    cfg = isStylelint ? cfg.rules : cfg;
    for (const id in cfg) {
      if (cfg[id] && knownRules.has(id)) {
        missingRules.delete(id);
      } else if (/^[a-z]+(-[a-z]+)*$/.test(id)) {
        // Deleting unknown rules that look like a valid id but allow unusual ids for user comments
        delete cfg[id];
      }
    }
    for (const id of missingRules) {
      cfg[id] = isStylelint ? false : 0;
    }
  }
  defaultConfig[linter] = stringifyConfig(linterMan.DEFAULTS[linter]);
  popup = showCodeMirrorPopup(title, null, {
    extraKeys: {'Ctrl-Enter': onConfigSave},
    hintOptions: {hint},
    lint: true,
    mode: 'application/json',
    value: config ? stringifyConfig(config) : defaultConfig[linter],
  });
  popup._contents.appendChild(
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
        $create('button.save', {onclick: onConfigSave, title: 'Ctrl-Enter'},
          t('styleSaveLabel')),
        $create('button.cancel', {onclick: onConfigCancel}, t('confirmClose')),
        $create('button.reset', {onclick: onConfigReset, title: t('linterResetMessage')},
          t('genericResetLabel')),
      ]),
    ]));
  cm = popup.codebox;
  cm.focus();
  cm.addOverlay({
    token(stream) {
      const t = stream.baseToken();
      if (t && t.type === 'string property') {
        const id = stream.string.substr(stream.pos + 1, t.size - 2);
        if (knownRules.has(id)) {
          stream.pos += t.size;
          return 'string-2 known-linter-rule' + (activeRules.has(id) ? ' active-linter-rule' : '');
        }
      }
      stream.pos += t ? t.size : 1e9;
    },
  });
  cm.on('changes', updateConfigButtons);
  updateConfigButtons();
  popup.onClose.add(onConfigClose);
}

export async function showLintHelp() {
  const linter = await getLinter();
  const baseUrl = linter === 'stylelint'
    ? 'https://stylelint.io/user-guide/rules/'
    : '';
  let headerLink, template;
  if (linter === 'csslint') {
    headerLink = $createLink('https://github.com/CSSLint/csslint/wiki/Rules', 'CSSLint');
    template = ruleID => {
      const rule = RULES.csslint.find(rule => rule.id === ruleID);
      return rule &&
        $create('li', [
          $create('b', ruleID + ': '),
          rule.url ? $createLink(rule.url, rule.name) : $create('span', `"${rule.name}"`),
          $create('p', rule.desc),
        ]);
    };
  } else {
    headerLink = $createLink(baseUrl, 'stylelint');
    template = rule =>
      $create('li',
        rule === 'CssSyntaxError' ? rule : $createLink(baseUrl + rule, rule));
  }
  const header = t('linterIssuesHelp', '\x01').split('\x01');
  helpPopup.show(t('linterIssues'),
    $create([
      header[0], headerLink, header[1],
      $create('ul.rules', getActiveRules().map(template)),
      $create('button', {onclick: showLintConfig}, t('configureStyle')),
    ]));
}

function getActiveRules() {
  const all = [...linterMan.getIssues()].map(issue => issue.rule);
  const uniq = new Set(all);
  return [...uniq];
}

function getLexicalDepth(lexicalState) {
  let depth = 0;
  while ((lexicalState = lexicalState.prev)) {
    depth++;
  }
  return depth;
}

async function getLinter() {
  const val = editor.getCurrentLinter();
  if (val && !RULES[val]) {
    RULES[val] = await linterMan.worker.getRules(val);
  }
  return val;
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
  cm = null;
}

function onConfigReset(event) {
  event.preventDefault();
  cm.setValue(defaultConfig[linter]);
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
  const cfg = isStylelint ? json.rules : json;
  for (const id in cfg) {
    if (!cfg[id]) delete cfg[id];
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
  await messageBox.show({
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
  $('.reset', popup).disabled = cm.getValue() === defaultConfig[linter];
  $('.cancel', popup).textContent = t(cm.isClean() ? 'confirmClose' : 'confirmCancel');
}
