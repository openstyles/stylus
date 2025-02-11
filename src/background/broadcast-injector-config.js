import {pKeepAlive} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {isEmptyObj} from '@/js/util';
import {broadcast} from './broadcast';
import {bgBusy, onSchemeChange} from './common';

let cfg;
let sentCfg = {};
const INJECTOR_CONFIG_MAP = {
  exposeIframes: 'top',
  disableAll: 'off',
  [pKeepAlive]: 'wake',
  styleViaASS: 'ass',
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

const data = {
  method: 'injectorConfig',
  cfg,
};

function throttle() {
  if (!isEmptyObj(cfg)) {
    data.cfg = cfg;
    broadcast(data);
  }
  sentCfg = cfg;
  cfg = null;
}
