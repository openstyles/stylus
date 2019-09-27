/* global chromeLocal promisify */
/* exported tokenManager */
'use strict';

const tokenManager = (() => {
  const launchWebAuthFlow = promisify(chrome.identity.launchWebAuthFlow.bind(chrome.identity));
  const AUTH = {
    dropbox: {
      flow: 'token',
      clientId: 'zg52vphuapvpng9',
      authURL: 'https://www.dropbox.com/oauth2/authorize',
      tokenURL: 'https://api.dropboxapi.com/oauth2/token'
    }
  };

  return {getToken, revokeToken, getClientId};

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

  function stringifyQuery(obj) {
    const search = new URLSearchParams();
    for (const key of Object.keys(obj)) {
      search.set(key, obj[key]);
    }
    return search.toString();
  }

  function authUser(name, k) {
    const provider = AUTH[name];
    const state = Math.random().toFixed(8).slice(2);
    const query = {
      response_type: provider.flow,
      client_id: provider.clientId,
      redirect_uri: chrome.identity.getRedirectURL(),
      state
    };
    const url = `${provider.authURL}?${stringifyQuery(query)}`;
    return launchWebAuthFlow({
      url,
      interactive: true
    })
      .then(url => {
        const params = new URLSearchParams(
          provider.flow === 'token' ?
            new URL(url).hash.slice(1) :
            new URL(url).search.slice(1)
        );
        if (params.get('state') !== state) {
          throw new Error(`unexpected state: ${params.get('state')}, expected: ${state}`);
        }
        if (provider.flow === 'token') {
          const obj = {};
          for (const [key, value] of params.entries()) {
            obj[key] = value;
          }
          return obj;
        }
        const code = params.get('code');
        return fetch(provider.tokenURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code,
            grant_type: 'authorization_code',
            client_id: provider.clientId,
            redirect_uri: chrome.identity.getRedirectURL()
          })
        })
          .then(r => {
            if (r.ok) {
              return r.json();
            }
            return r.text()
              .then(body => {
                throw new Error(`failed to fetch (${r.status}): ${body}`);
              });
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
