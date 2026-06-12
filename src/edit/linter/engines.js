import {getLZValue, LZ_KEY} from '@/js/chrome-sync';
import {mimeLESS, UCD} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {notIncludedInArray} from '@/js/util';
import {onStorageChanged} from '@/js/util-webext';
import * as linterMan from '.';
import editor from '../editor';
import {worker} from '../util';
import {DEFAULTS, kAtRuleNoUnknown} from './defaults';

const configs = new Map();
const kIgnoreAtRules = 'ignoreAtRules';
const ignoreAtRulesLess = ['detached-ruleset'];
const ignoreAtRulesStylus = ['block', 'css', 'else', 'extend', 'for', 'if', 'require', 'unless'];
const ignoreAtRulesLessLength = ignoreAtRulesLess.length;
const ignoreAtRulesStylusLength = ignoreAtRulesStylus.length;

const ENGINES = {
  csslint: {
    validMode: mode => mode === 'css',
    getConfig: config => Object.assign({}, DEFAULTS.csslint, config),
    lint: (code, config) => worker.csslint(code, {...config, doc: !editor.isUsercss}),
  },
  stylelint: {
    validMode: () => true,
    getConfig: config => ({
      rules: Object.assign({}, DEFAULTS.stylelint.rules, config && config.rules),
    }),
    lint: (code, config, mode) => {
      const cfgRules = config.rules;
      const isLess = mode === mimeLESS && (mode = 'less');
      const isStylus = mode === 'stylus';
      const kAtRuleDisallowedList = 'at-rule-disallowed-list';
      const ucd = editor.style[UCD];
      let vars;
      let v = cfgRules[kAtRuleDisallowedList];
      if (!Array.isArray(v))
        v = cfgRules[kAtRuleDisallowedList] = [];
      v.push('import');
      if ((vars = ucd?.vars) && (vars = Object.keys(vars).join('|')))
        vars = mode === 'css' ? String.raw`/\*\[\[(${vars})\]\]\*/`
          : `${isLess ? '@' : '(^|[^-\\w])'}(${vars})(?=[^-\\w])`;
      if ((isStylus || isLess) && Array.isArray(v = cfgRules[kAtRuleNoUnknown]) && v[0]) {
        v = cfgRules[kAtRuleNoUnknown] = [...v];
        v = v[1] = {...v[1]};
        const userIgnores = v[kIgnoreAtRules];
        v = v[kIgnoreAtRules] = isLess ? ignoreAtRulesLess : ignoreAtRulesStylus;
        v.length = isLess ? ignoreAtRulesLessLength : ignoreAtRulesStylusLength;
        if (Array.isArray(userIgnores))
          v.push(...userIgnores.filter(notIncludedInArray, v));
      }
      return worker.stylelint(code, config, mode, vars);
    },
  },
};

linterMan.register(async (text, _options, cm) => {
  const linter = prefs.__values['editor.linter'];
  if (linter) {
    const {mode} = cm.options;
    const currentFirst = Object.entries(ENGINES).sort(([a]) => a === linter ? -1 : 1);
    for (const [name, engine] of currentFirst) {
      if (engine.validMode(mode)) {
        const cfg = configs.get(name) || await getConfig(name);
        return ENGINES[name].lint(text, cfg, mode);
      }
    }
  }
});

onStorageChanged.addListener(changes => {
  for (const name of Object.keys(ENGINES)) {
    if (LZ_KEY[name] in changes) {
      getConfig(name).then(linterMan.run);
    }
  }
});

async function getConfig(name) {
  const rawCfg = await getLZValue(LZ_KEY[name]);
  const cfg = ENGINES[name].getConfig(rawCfg);
  configs.set(name, cfg);
  return cfg;
}
