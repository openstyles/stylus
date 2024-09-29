import {broadcast} from './broadcast';
import {getUrlOrigin} from './tab-util';

let cfg;
export const INJECTOR_CONFIG_MAP = {
  exposeIframes: 'top',
  disableAll: 'off',
  styleViaASS: 'ass',
};

export default function broadcastInjectorConfig(key, val) {
  if (!cfg) {
    cfg = {};
    setTimeout(throttle);
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
