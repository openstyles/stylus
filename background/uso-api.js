/* global API */// msg.js
/* global RX_META URLS */// toolbox.js
/* global download */// common.js
/* global styleMan */
/* global usercssMan */
'use strict';

const usoApi = (() => {
  const pingers = {};
  const getMd5Url = usoId => `https://update.userstyles.org/${usoId}.md5`;
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
      const {updateUrl = URLS.makeUpdateUrl('usoa', usoId)} = dup;
      const jobs = [
        !dup && usoApi.getUpdatability(usoId, true).then(res => ({dup, md5, md5Url} = res)),
        !css && download(updateUrl).then(res => (css = res)),
      ].filter(Boolean);
      if (jobs[0]) await Promise.all(jobs);
      const varMap = {};
      const {style} = await usercssMan.build({sourceCode: css, metaOnly: true});
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
      || styleMan.find({installationUrl: URLS.makeInstallUrl('usoa', usoId)});
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

  function optByName(v, name) {
    return v.options.find(o => o.name === name);
  }
})();
