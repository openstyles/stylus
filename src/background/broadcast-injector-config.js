import {pDisableAll, pExposeIframes, pKeepAlive, pStyleViaASS} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {broadcast} from './broadcast';
import {bgBusy, onSchemeChange} from './common';

let cfg;
let sentCfg = {};
const INJECTOR_CONFIG_MAP = {
  [pExposeIframes]: 'top',
  [pDisableAll]: 'off',
  [pKeepAlive]: 'wake',
  [pStyleViaASS]: 'ass',
};

bgBusy.then(() => {
  prefs.subscribe(Object.keys(INJECTOR_CONFIG_MAP), broadcastInjectorConfig);
});
onSchemeChange.add(broadcastInjectorConfig.bind(null, 'dark'));

export default function broadcastInjectorConfig(key, val) {
  key = INJECTOR_CONFIG_MAP[key] || key;
  if (key === pKeepAlive)
    val = val >= 0;
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

function throttle() {
  if (Object.keys(cfg).length)
    broadcast(null, cfg);
  sentCfg = cfg;
  cfg = null;
}
