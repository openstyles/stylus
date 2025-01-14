import * as prefs from '@/js/prefs';
import {isEmptyObj} from '@/js/util';
import {broadcast} from './broadcast';
import * as colorScheme from './color-scheme';
import {bgBusy} from './common';
import {getUrlOrigin} from './tab-util';

let cfg;
let sentCfg = {};
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
  key = INJECTOR_CONFIG_MAP[key] || key;
  if (!cfg) {
    cfg = {};
    cfg[key] = val;
    setTimeout(throttle);
  } else if (sentCfg[key] === val) {
    delete cfg[key];
  } else {
    cfg[key] = val;
  }
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
  if (!isEmptyObj(cfg)) {
    data.cfg = cfg;
    broadcast(data, {
      getData: cfg.top && setTop,
      onlyIfStyled: !('off' in cfg || 'dark' in cfg),
    });
  }
  sentCfg = cfg;
  cfg = null;
}
