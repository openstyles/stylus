import {getLZValue, LZ_KEY} from '@/js/chrome-sync';
import * as prefs from '@/js/prefs';
import {onStorageChanged} from '@/js/util-webext';
import * as linterMan from '.';
import editor from '../editor';
import {worker} from '../util';
import {DEFAULTS} from './defaults';

const configs = new Map();
const ENGINES = {
  csslint: {
    validMode: mode => mode === 'css',
    getConfig: config => Object.assign({}, DEFAULTS.csslint, config),
    async lint(text, config) {
      config.doc = !editor.isUsercss;
      const results = await worker.csslint(text, config);
      return results
        .map(({line, col: ch, message, rule, type: severity}) => line && {
          message,
          from: {line: line - 1, ch: ch - 1},
          to: {line: line - 1, ch},
          rule: rule.id,
          severity,
        })
        .filter(Boolean);
    },
  },
  stylelint: {
    validMode: () => true,
    getConfig: config => ({
      rules: Object.assign({}, DEFAULTS.stylelint.rules, config && config.rules),
    }),
    lint: (code, config, mode) => worker.stylelint({code, config, mode}),
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
