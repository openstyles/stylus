/* global API */// msg.js
/* global RX_META URLS stringAsRegExpStr */// toolbox.js
/* global styleMan */
/* global usercssMan */
'use strict';

const usoApi = (() => {
  const pingers = {};
  const fetchApi = async url => (await (await fetch(url)).json()).result;
  const getMd5Url = usoId => `https://update.userstyles.org/${usoId}.md5`;
  const ordinalSort = (a, b) => a.ordinal - b.ordinal;
  return {

    delete(usoId) {
      const style = findStyle(usoId);
      return style ? styleMan.delete(style.id) : false;
    },

    /** UserCSS metadata may be embedded in the original USO style so let's use its updateURL */
    getEmbeddedMeta(code) {
      const isRaw = arguments[0];
      const m = code.includes('@updateURL') && (isRaw ? code : code.replace(RX_META, '')).match(RX_META);
      return m && API.usercss.buildMeta({sourceCode: m[0]}).catch(() => null);
    },

    async getUpdatability(usoId, asObject) {
      const md5Url = getMd5Url(usoId);
      const md5 = await (await fetch(md5Url)).text();
      const dup = await findStyle(usoId, md5Url);
      // see STATE_EVENTS in install-hook-userstyles.js
      const state = !dup ? 0 : dup.usercssData || dup.originalMd5 === md5 ? 2 : 1;
      return asObject
        ? {dup, md5, md5Url, state}
        : state;
    },

    pingback(usoId, delay) {
      clearTimeout(pingers[usoId]);
      delete pingers[usoId];
      if (delay > 0) {
        return new Promise(resolve => (pingers[usoId] = setTimeout(ping, delay, usoId, resolve)));
      } else if (delay !== false) {
        return ping(usoId);
      }
    },

    /**
     * Replicating USO-Archive format
     */
    async toUsercss(usoId, varsUrl, css, dup, md5, md5Url) {
      let v;
      if (!dup) dup = false; // "polyfilling" for dup?.prop
      const {updateUrl = URLS.usoApi + 'Css/' + usoId} = dup;
      const [data, settings = []] = await Promise.all([
        fetchApi(URLS.usoApi + '/' + usoId),
        fetchApi(URLS.usoApi + 'CustomOptions/' + usoId),
        !dup && usoApi.getUpdatability(usoId, true).then(res => ({dup, md5, md5Url} = res)),
        !css && fetchApi(updateUrl).then(res => (css = res)),
      ]);
      const descr = JSON.stringify(data.description.trim());
      const varMap = {};
      const varDefs = settings.sort(ordinalSort).map(makeVar, varMap).join('');
      const sourceCode = `\
/* ==UserStyle==
@name         ${data.name}
@namespace    USO Archive
@version      ${data.updated.replace(/-/g, '').replace(/[T:]/g, '.').slice(0, 14)}
@description  ${/^"['`]|\\/.test(descr) ? descr : descr.slice(1, -1)}
@author       ${((v = data.user)) ? v.name + (((v = v.paypalEmail)) ? `<${v}>` : '') : '?'}
@license      ${makeLicense(data.license)}
${varDefs ? `\
@preprocessor uso${varDefs}\n` : ''}`.replace(/\*\//g, '*\\/') + `\
==/UserStyle== */
${varDefs ? patchCss(css, varMap) : css}`;
      const {style} = await usercssMan.build({sourceCode, metaOnly: true});
      const vars = (v = varsUrl || dup.updateUrl) && useVars(style, v, varMap);
      if (dup) {
        return style;
      }
      style.md5Url = md5Url;
      style.originalMd5 = md5;
      style.updateUrl = updateUrl;
      await API.usercss.install(style, {dup, vars});
    },
  };

  function useVars(style, src, cfg) {
    src = typeof src === 'string'
      ? new URLSearchParams(src.split('?')[1])
      : Object.entries(src);
    const {vars} = style.usercssData;
    if (!vars) {
      return;
    }
    for (let [key, val] of src) {
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
    return style;
  }

  function findStyle(usoId, md5Url = getMd5Url(usoId)) {
    return styleMan.find({md5Url})
      || styleMan.find({installationUrl: `${URLS.usoa}style/${usoId}`});
  }

  async function ping(id, resolve) {
    await fetch(`${URLS.uso}styles/install/${id}?source=stylish-ch`);
    if (resolve) resolve(true);
    return true;
  }

  function makeKey(key, varMap) {
    let res = varMap[key];
    if (!res && key !== (res = key.replace(/[^-\w]/g, '-'))) {
      while (res in varMap) res += '-';
      varMap[key] = res;
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
    settingType: type,
    installKey: ik,
    styleSettingOption: opts,
  }) {
    const map = this;
    let value, suffix;
    ik = makeKey(ik, map);
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
          installKey: `${ikCust}-dropdown`,
          value: `/*[[${ikCust}]]*/`,
        });
        suffix = `\n@advanced text ${ikCust} ${label.slice(0, -1)} (Custom)" "https://foo.com/123.jpg"`;
        type = 'dropdown';
      } // fallthrough

      case 'dropdown':
        value = '';
        for (const o of opts.sort(ordinalSort)) {
          const def = o.default ? '*' : '';
          const val = o.value;
          const s = `  ${makeKey(o.installKey, map)} ${JSON.stringify(o.label + def)} <<<EOT${
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

  function patchCss(css, map) {
    const rxsKeys = stringAsRegExpStr(Object.keys(map).join('\n')).replace(/\n/g, '|');
    const rxUsoVars = new RegExp(String.raw`(/\*\[\[)(${rxsKeys})(?=]]\*\?/)`, 'g');
    return css.replace(rxUsoVars, (s, a, key) => a + map[key]);
  }
})();
