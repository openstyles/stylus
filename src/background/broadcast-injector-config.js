import * as prefs from '@/js/prefs';
import {broadcast} from './broadcast';
import * as colorScheme from './color-scheme';
import {bgBusy, safeTimeout} from './common';
import {getUrlOrigin} from './tab-util';

let cfg;
const INJECTOR_CONFIG_MAP = {
  exposeIframes: 'top',
  disableAll: 'off',
  styleViaASS: 'ass',
};

bgBusy.then(() => {
  prefs.subscribe(Object.keys(INJECTOR_CONFIG_MAP), broadcastInjectorConfig);
  colorScheme.onChange(broadcastInjectorConfig.bind(null, 'dark'));
});

export default function broadcastInjectorConfig(key, val) {
  if (!cfg) {
    cfg = {};
    safeTimeout(throttle);
  }
  cfg[INJECTOR_CONFIG_MAP[key] || key] = val;
}

const data = {
  method: 'injectorConfig',
  cfg,
};

function setTop(tab) {
  data.cfg.top = tab && getUrlOrigin(tab.url);
  return data;
}

function throttle() {
  data.cfg = cfg;
  broadcast(data, {
    getData: cfg.top && setTop,
    onlyIfStyled: !('off' in cfg || 'dark' in cfg),
  });
  cfg = null;
}
