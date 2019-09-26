/* global chromeLocal promisify */
/* exported tokenManager */
'use strict';

const tokenManager = (() => {
  const launchWebAuthFlow = promisify(chrome.identity.launchWebAuthFlow.bind(chrome.identity));
  const AUTH = {
    // always use code flow?
    dropbox: {
      clientId: 'zg52vphuapvpng9',
      authURL: 'https://www.dropbox.com/oauth2/authorize',
      tokenURL: 'https://api.dropboxapi.com/oauth2/token'
    }
  };

  return {getToken, revokeToken, getClientId};

  function parseSearchParams(url) {
    // TODO: remove .replace(/^\?/, '') when minimum_chrome_version >= 52 (https://crbug.com/601425)
    const search = new URL(url).search;
    return new URLSearchParams(search[0] === '?' ? search.slice(1) : search);
  }

  function getClientId(name) {
    return AUTH[name].clientId;
  }

  function buildKeys(name) {
    const k = {
      TOKEN: `secure/token/${name}/token`,
      EXPIRE: `secure/token/${name}/expire`,
      REFRESH: `secure/token/${name}/refresh`,
    };
    k.LIST = Object.values(k);
    return k;
  }

  function getToken(name) {
    const k = buildKeys(name);
    return chromeLocal.get(k.LIST)
      .then(obj => {
        if (!obj[k.TOKEN] || obj[k.EXPIRE] > Date.now()) {
          return refreshToken(name, k, obj)
            .catch(() => authUser(name, k));
        }
        return obj[k.TOKEN];
      });
  }

  function revokeToken(name) {
    const k = buildKeys(name);
    return chromeLocal.remove(k.LIST);
  }

  function refreshToken(name, k, obj) {
    if (!obj[k.REFRESH]) {
      return Promise.reject(new Error('no refresh token'));
    }
    return Promise.reject(new Error('not implemented yet'));
  }

  function authUser(name, k) {
    const provider = AUTH[name];
    const state = Math.random().toFixed(8).slice(2);
    return launchWebAuthFlow({
      url:
      `${provider.authURL}?response_type=code&redirect_uri=${chrome.identity.getRedirectURL()}` +
      `&state=${state}&client_id=${provider.clientId}`,
      interactive: true
    })
      .then(url => {
        const params = parseSearchParams(url);
        if (params.get('state') !== state) {
          throw new Error(`unexpected state: ${params.get('state')}, expected: ${state}`);
        }
        const code = params.get('code');
        return fetch(provider.tokenURL, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body:
            `code=${code}&grant_type=authorization_code&client_id=${provider.clientId}` +
            `&redirect_uri=${chrome.identity.getRedirectURL()}`
        });
      })
      .then(r => {
        if (r.ok) {
          return r.json();
        }
        return r.json()
          .catch(console.warn)
          .then(json => {
            throw new Error(`failed to fetch (${r.status}): ${json && json.message}`);
          });
      })
      .then(result =>
        chromeLocal.set({
          [k.TOKEN]: result.access_token,
          [k.EXPIRE]: result.expire_in ? Date.now() + result.expire_in * 60 * 1000 : undefined,
          [k.REFRESH]: result.refresh_token
        })
          .then(() => result.access_token)
      );
  }
})();
