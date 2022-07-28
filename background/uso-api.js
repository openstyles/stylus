/* global URLS stringAsRegExp */// toolbox.js
/* global usercssMan */
'use strict';

/* exported usoApi */
const usoApi = {
  /**
   * Replicating USO-Archive format
   * https://github.com/33kk/uso-archive/blob/flomaster/lib/uso.js
   * https://github.com/33kk/uso-archive/blob/flomaster/lib/converters.js
   */
  async toUsercss(data, {metaOnly = true} = {}) {
    const badKeys = {};
    const newKeys = [];
    const descr = JSON.stringify(data.description.trim());
    const vars = (data.style_settings || []).map(makeVar).join('');
    const sourceCode = `\
/* ==UserStyle==
@name         ${data.name}
@namespace    USO Archive
@version      ${data.updated.replace(/-/g, '').replace(/[T:]/g, '.').slice(0, 14)}
@description  ${/^"['`]|\\/.test(descr) ? descr : descr.slice(1, -1)}
@author       ${(data.user || {}).name || '?'}
@license      ${makeLicense(data.license)}${vars ? '\n@preprocessor uso' + vars : ''}`
      .replace(/\*\//g, '*\\/') +
      `==/UserStyle== */\n${newKeys[0] ? useNewKeys(data.css) : data.css}`;
    const res = await usercssMan.build({sourceCode, metaOnly});
    return Object.assign(res, {badKeys, newKeys});

    function makeLicense(s) {
      return !s ? 'NO-REDISTRIBUTION' :
        s === 'publicdomain' ? 'CC0-1.0' :
          s.startsWith('ccby') ? `${s.toUpperCase().match(/(..)/g).join('-')}-4.0` :
            s;
    }

    function makeVar({
      label,
      setting_type: type,
      install_key: ik,
      style_setting_options: opts,
    }) {
      let value, suffix;
      ik = makeKey(ik);
      label = JSON.stringify(label);
      switch (type) {

        case 'color':
          value = opts[0].value;
          break;

        case 'text':
          value = JSON.stringify(opts[0].value);
          break;

        case 'image': {
          const ikCust = `${ik}-custom`;
          opts.push({
            label: 'Custom',
            install_key: `${ikCust}-dropdown`,
            value: `/*[[${ikCust}]]*/`,
          });
          suffix = `\n@advanced text ${ikCust} ${label.slice(0, -1)} (Custom)" "https://foo.com/123.jpg"`;
          type = 'dropdown';
        } // fallthrough

        case 'dropdown':
          value = '';
          for (const o of opts) {
            const def = o.default ? '*' : '';
            const val = o.value;
            const s = `  ${makeKey(o.install_key)} ${JSON.stringify(o.label + def)} <<<EOT${
              val.includes('\n') ? '\n' : ' '}${val} EOT;\n`;
            value = def ? s + value : value + s;
          }
          value = `{\n${value}}`;
          break;

        default:
          value = '"ERROR: unknown type"';
      }
      return `\n@advanced ${type} ${ik} ${label} ${value}${suffix || ''}`;
    }

    function makeKey(key) {
      let res = badKeys[key];
      if (!res) {
        res = key.replace(/[^-\w]/g, '-');
        res += newKeys.includes(res) ? '-' : '';
        if (key !== res) {
          badKeys[key] = res;
          newKeys.push(res);
        }
      }
      return res;
    }

    function useNewKeys(css) {
      const rxsKeys = stringAsRegExp(Object.keys(badKeys).join('\n'), '', true).replace(/\n/g, '|');
      const rxUsoVars = new RegExp(`(/\\*\\[\\[)(${rxsKeys})(?=]]\\*/)`, 'g');
      return css.replace(rxUsoVars, (s, a, key) => a + badKeys[key]);
    }
  },
};

(() => {
  const timers = {};

  usoApi.pingback = (usoId, delay) => {
    clearTimeout(timers[usoId]);
    delete timers[usoId];
    if (delay > 0) {
      return new Promise(resolve => {
        timers[usoId] = setTimeout(ping, delay, usoId, resolve);
      });
    } else if (delay !== false) {
      return ping(usoId);
    }
  };

  function ping(id, resolve) {
    return fetch(`${URLS.uso}styles/install/${id}?source=stylish-ch`).then(resolve);
  }
})();
