import {getLZValue, LZ_KEY, setLZValue} from '@/js/chrome-sync';
import {kAppJson} from '@/js/consts';
import {$create, $createLink} from '@/js/dom';
import {messageBox} from '@/js/dom-util';
import {t, tryJSONparse} from '@/js/util';
import editor from '../editor';
import {helpPopup, showCodeMirrorPopup, worker} from '../util';
import {DEFAULTS} from './defaults';
import {getIssues} from './reports';

/** @type {{csslint:{}, stylelint:{}}} */
const RULES = {};
const KNOWN_RULES = {};
const defaultConfig = {};

let cmDlg;
let knownRules;
let isStylelint;
let linter;
let popup;

export async function showLintConfig() {
  linter = await getLinter();
  if (!linter) {
    return;
  }
  await import('@/cm/jsonlint-bundle');
  const config = await getLZValue(LZ_KEY[linter]);
  const defaults = DEFAULTS[linter];
  const title = t('linterConfigPopupTitle', isStylelint ? 'Stylelint' : 'CSSLint');
  const activeRules = new Set(getActiveRules());
  isStylelint = linter === 'stylelint';
  knownRules = KNOWN_RULES[linter] || (
    KNOWN_RULES[linter] = new Set((
      isStylelint
        ? Object.keys(RULES[linter])
        : RULES[linter].map(r => r.id)
    ).sort()));
  for (const cfg of [
    config,
    !defaultConfig[linter] && defaults,
  ].filter(Boolean).map(getConfigRules)) {
    const missingRules = new Set(knownRules);
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
  defaultConfig[linter] = stringifyConfig(defaults);
  popup = showCodeMirrorPopup(title, null, {
    extraKeys: {'Ctrl-Enter': onConfigSave},
    hintOptions: {hint},
    lint: true,
    mode: kAppJson,
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
  cmDlg = popup.codebox;
  cmDlg.focus();
  cmDlg.addOverlay({
    token(stream) {
      const tok = stream.baseToken();
      if (tok && tok.type === 'string property') {
        const id = stream.string.substr(stream.pos + 1, tok.size - 2);
        if (knownRules.has(id)) {
          stream.pos += tok.size;
          return 'string-2 known-linter-rule' + (activeRules.has(id) ? ' active-linter-rule' : '');
        }
      }
      stream.pos += tok ? tok.size : 1e9;
    },
  });
  cmDlg.on('changes', updateConfigButtons);
  updateConfigButtons();
  popup.onClose.add(onConfigClose);
}

export async function showLintHelp() {
  const target = await getLinter();
  const baseUrl = target === 'stylelint'
    ? 'https://stylelint.io/user-guide/rules/'
    : '';
  let headerLink, makeItem;
  if (target === 'csslint') {
    headerLink = $createLink('https://github.com/CSSLint/csslint/wiki/Rules', 'CSSLint');
    makeItem = ruleID => {
      for (const rule of RULES.csslint) {
        if (rule.id === ruleID) {
          return $create('li', [
            $create('b', ruleID + ': '),
            rule.url ? $createLink(rule.url, rule.name) : $create('span', `"${rule.name}"`),
            $create('p', rule.desc),
          ]);
        }
      }
    };
  } else {
    headerLink = $createLink(baseUrl, 'stylelint');
    makeItem = rule =>
      $create('li',
        rule === 'CssSyntaxError' ? rule : $createLink(baseUrl + rule, rule));
  }
  const header = t('linterIssuesHelp', '\x01').split('\x01');
  helpPopup.show(t('linterIssues'),
    $create('div', [
      header[0], headerLink, header[1],
      $create('ul.rules', getActiveRules().map(makeItem)),
      $create('button', {onclick: showLintConfig}, t('configureStyle')),
    ]));
}

function getActiveRules() {
  const all = [...getIssues()].map(issue => issue.rule);
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
    RULES[val] = await worker.getRules(val);
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
      ruleIds.includes(prevWord) && options[prevWord]?.[0] || [];
  } else if (depth === 4 && prevWord === 'severity') {
    words = ['error', 'warning'];
  } else if (depth === 4) {
    words = ['ignore', 'ignoreAtRules', 'except', 'severity'];
  } else if (depth === 5 && lexical.type === ']' && quoted) {
    while (prevWord && !ruleIds.includes(prevWord)) {
      prevWord = (search.find(true) || [])[1];
    }
    words = options[prevWord]?.slice(-1)[0] || ruleIds;
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
  cmDlg = null;
}

function onConfigReset(event) {
  event.preventDefault();
  cmDlg.setValue(defaultConfig[linter]);
  cmDlg.focus();
  updateConfigButtons();
}

async function onConfigSave(event) {
  if (event instanceof Event) {
    event.preventDefault();
  }
  const json = tryJSONparse(cmDlg.getValue());
  if (!json) {
    showLinterErrorMessage(linter, t('linterJSONError'));
    cmDlg.focus();
    return;
  }
  const cfg = getConfigRules(json);
  const defaults = getConfigRules(DEFAULTS[linter]);
  // Explicitly disabling rules enabled in our defaults but not present in the user config
  for (const id in defaults) {
    if (!(id in cfg)) cfg[id] = isStylelint ? false : 0;
  }
  /* Removing rules with a default value to reduce the size of config in sync storage and to use
   * newer defaults in a newer version of the extension in the unlikely case we change them. */
  for (const id in cfg) {
    const def = defaults[id];
    const val = cfg[id];
    if (val ? def && JSON.stringify(val) === JSON.stringify(def) : !def) {
      delete cfg[id];
    }
  }
  setLZValue(LZ_KEY[linter], json);
  cmDlg.markClean();
  cmDlg.focus();
  updateConfigButtons();
}

function getConfigRules(c) {
  return isStylelint ? c.rules || (c.rules = {}) : c;
}

function stringifyConfig(config) {
  return JSON.stringify(config, null, 2)
    .replace(/,\n\s+{\n\s+("severity":\s"\w+")\n\s+}/g, ', {$1}');
}

async function showLinterErrorMessage(title, contents) {
  await messageBox.show({
    title,
    contents,
    className: 'danger center lint-config',
    buttons: [t('confirmOK')],
  });
  popup?.codebox?.focus();
}

function updateConfigButtons() {
  popup.$('.save').disabled = cmDlg.isClean();
  popup.$('.reset').disabled = cmDlg.getValue() === defaultConfig[linter];
  popup.$('.cancel').textContent = t(cmDlg.isClean() ? 'confirmClose' : 'confirmCancel');
}
