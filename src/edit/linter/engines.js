import {getLZValue, LZ_KEY} from '@/js/chrome-sync';
import {kRulesOvr, mimeLESS} from '@/js/consts';
import {onStorageChanged} from '@/js/util-webext';
import * as linterMan from '.';
import editor from '../editor';
import {worker} from '../util';
import {DEFAULTS} from './defaults';
import {linters, onLinterPref} from './store';

export let curLinter = '';
export const overrideCurLinter = val => { curLinter = val; };

const kAtRuleDisallowedList = 'at-rule-disallowed-list';
const configs = new Map();
const configHandlers = {
  __proto__: null,
  csslint: config => ({
    ...config,
    doc: !editor.isUsercss,
  }),
  stylelint: (config, mode) => {
    const rules = {...config.rules};
    const ats = rules[kAtRuleDisallowedList];
    rules[kAtRuleDisallowedList] = ['import', ...Array.isArray(ats) ? ats : []];
    Object.assign(rules, config[kRulesOvr + mode]);
    return {rules};
  },
};

const runLinter = async (text, _options, cm) => {
  const mode = cm.options.mode.replace(mimeLESS, 'less');
  const cfgBase = configs.get(curLinter) || await getConfig(curLinter);
  const cfg = configHandlers[curLinter](cfgBase, mode);
  return worker[curLinter](text, cfg, mode);
};

export const linterPrefSubscriber = (key, val, init) => {
  curLinter = !val ? '' : configHandlers[val] ? val : 'stylelint';
  linters[curLinter ? 'add' : 'delete'](runLinter);
  for (const fn of onLinterPref)
    fn(key, val, init);
  linterMan.run();
};

onStorageChanged.addListener(changes => {
  for (const name of Object.keys(configHandlers)) {
    if (LZ_KEY[name] in changes) {
      getConfig(name).then(linterMan.run);
    }
  }
});

async function getConfig(name) {
  const rawCfg = await getLZValue(LZ_KEY[name]);
  const cfg = {...DEFAULTS[name], ...rawCfg};
  configs.set(name, cfg);
  return cfg;
}
