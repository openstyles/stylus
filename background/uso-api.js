/* global URLS stringAsRegExp */// toolbox.js
/* global usercssMan */
'use strict';

const usoApi = {};

(() => {
  const pingers = {};

  usoApi.pingback = (usoId, delay) => {
    clearTimeout(pingers[usoId]);
    delete pingers[usoId];
    if (delay > 0) {
      return new Promise(resolve => (pingers[usoId] = setTimeout(ping, delay, usoId, resolve)));
    } else if (delay !== false) {
      return ping(usoId);
    }
  };

  /**
   * Replicating USO-Archive format
   * https://github.com/33kk/uso-archive/blob/flomaster/lib/uso.js
   * https://github.com/33kk/uso-archive/blob/flomaster/lib/converters.js
   */
  usoApi.toUsercss = async (data, {metaOnly = true, varsUrl} = {}) => {
    const badKeys = {};
    const newKeys = [];
    const descr = JSON.stringify(data.description.trim());
    const vars = (data.style_settings || []).map(makeVar, {badKeys, newKeys}).join('');
    const sourceCode = `\
/* ==UserStyle==
@name         ${data.name}
@namespace    USO Archive
@version      ${data.updated.replace(/-/g, '').replace(/[T:]/g, '.').slice(0, 14)}
@description  ${/^"['`]|\\/.test(descr) ? descr : descr.slice(1, -1)}
@author       ${(data.user || {}).name || '?'}
@license      ${makeLicense(data.license)}${vars ? `\n@preprocessor uso${vars}\n` : ''}`
      .replace(/\*\//g, '*\\/') +
      `==/UserStyle== */\n${newKeys[0] ? useNewKeys(data.css, badKeys) : data.css}`;
    const {style} = await usercssMan.build({sourceCode, metaOnly});
    usoApi.useVarsUrl(style, varsUrl);
    return {style, badKeys, newKeys};
  };

  usoApi.useVarsUrl = (style, url) => {
    if (!/\?ik-/.test(url)) {
      return;
    }
    const cfg = {badKeys: {}, newKeys: []};
    const {vars} = style.usercssData;
    if (!vars) {
      return;
    }
    for (let [key, val] of new URLSearchParams(url.split('?')[1])) {
      if (!key.startsWith('ik-')) continue;
      key = makeKey(key.slice(3), cfg);
      const v = vars[key];
      if (!v) continue;
      if (v.options) {
        let sel = val.startsWith('ik-') && optByName(v, makeKey(val.slice(3), cfg));
        if (!sel) {
          key += '-custom';
          sel = optByName(v, key + '-dropdown');
          if (sel) vars[key].value = val;
        }
        if (sel) v.value = sel.name;
      } else {
        v.value = val;
      }
    }
    return true;
  };

  async function ping(id, resolve) {
    await fetch(`${URLS.uso}styles/install/${id}?source=stylish-ch`);
    if (resolve) resolve(true);
    return true;
  }

  function makeKey(key, {badKeys, newKeys}) {
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
    const cfg = this;
    let value, suffix;
    ik = makeKey(ik, cfg);
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
          const s = `  ${makeKey(o.install_key, cfg)} ${JSON.stringify(o.label + def)} <<<EOT${
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

  function optByName(v, name) {
    return v.options.find(o => o.name === name);
  }

  function useNewKeys(css, badKeys) {
    const rxsKeys = stringAsRegExp(Object.keys(badKeys).join('\n'), '', true).replace(/\n/g, '|');
    const rxUsoVars = new RegExp(`(/\\*\\[\\[)(${rxsKeys})(?=]]\\*/)`, 'g');
    return css.replace(rxUsoVars, (s, a, key) => a + badKeys[key]);
  }
})();
