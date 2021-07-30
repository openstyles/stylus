/* global API msg */// msg.js
/* global URLS */ // toolbox.js
/* global tokenMan */
'use strict';

const uswApi = (() => {

  //#region Internals

  class TokenHooks {
    constructor(id) {
      this.id = id;
    }
    keyName(name) {
      return `${name}/${this.id}`;
    }
    query(query) {
      return Object.assign(query, {vendor_data: this.id});
    }
  }

  function fakeUsercssHeader(style) {
    const {name, _usw: u = {}} = style;
    const meta = Object.entries({
      '@name': u.name || name || '?',
      '@version': // Same as USO-archive version: YYYYMMDD.hh.mm
        new Date().toISOString().replace(/^(\d+)-(\d+)-(\d+)T(\d+):(\d+).+/, '$1$2$3.$4.$5'),
      '@namespace': u.namespace !== '?' && u.namespace ||
        u.username && `userstyles.world/user/${u.username}` ||
        '?',
      '@description': u.description,
      '@author': u.username,
      '@license': u.license,
    });
    const maxKeyLen = meta.reduce((res, [k]) => Math.max(res, k.length), 0);
    return [
      '/* ==UserStyle==',
      ...meta.map(([k, v]) => `${k}${' '.repeat(maxKeyLen - k.length + 2)}${v || ''}`),
      '==/UserStyle== */',
    ].join('\n') + '\n\n';
  }

  async function linkStyle(style, sourceCode) {
    const {id} = style;
    const metadata = await API.worker.parseUsercssMeta(sourceCode).catch(console.warn) || {};
    const uswData = Object.assign({}, style, {metadata, sourceCode});
    API.data.set('usw' + id, uswData);
    const token = await tokenMan.getToken('userstylesworld', true, new TokenHooks(id));
    const info = await uswFetch('style', token);
    const data = style._usw = Object.assign({token}, info);
    style.url = style.url || data.homepage || `${URLS.usw}style/${data.id}`;
    await uswSave(style);
    return data;
  }

  async function uswFetch(path, token, opts) {
    opts = Object.assign({credentials: 'omit'}, opts);
    opts.headers = Object.assign({Authorization: `Bearer ${token}`}, opts.headers);
    return (await (await fetch(`${URLS.usw}api/${path}`, opts)).json()).data;
  }

  /** Uses a custom method when broadcasting and avoids needlessly sending the entire style */
  async function uswSave(style) {
    const {id, _usw} = style;
    await API.styles.save(style, {broadcast: false});
    msg.broadcastExtension({method: 'uswData', style: {id, _usw}});
  }

  //#endregion
  //#region Exports

  return {
    /**
     * @param {number} id
     * @param {string} sourceCode
     * @return {Promise<string>}
     */
    async publish(id, sourceCode) {
      const style = await API.styles.get(id);
      const data = (style._usw || {}).token
        ? style._usw
        : await linkStyle(style, sourceCode);
      const header = style.usercssData ? '' : fakeUsercssHeader(style);
      return uswFetch(`style/${data.id}`, data.token, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code: header + sourceCode}),
      });
    },

    /**
     * @param {number} id
     * @return {Promise<void>}
     */
    async revoke(id) {
      await tokenMan.revokeToken('userstylesworld', new TokenHooks(id));
      const style = await API.styles.get(id);
      if (style) {
        style._usw = {};
        await uswSave(style);
      }
    },
  };

  //#endregion
})();

/* Doing this outside so we don't break IDE's recognition of the exported methods in IIFE */
for (const [k, fn] of Object.entries(uswApi)) {
  uswApi[k] = async (id, ...args) => {
    API.data.set('usw' + id, true);
    try {
      /* Awaiting inside `try` so that `finally` runs when done */
      return await fn(id, ...args);
    } finally {
      API.data.del('usw' + id);
    }
  };
}
