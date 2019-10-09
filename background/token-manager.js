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
    },
    google: {
      flow: 'token',
      clientId: '283762574871-v3fq18bmocd1fvo4co7pfad0rcb4bti8.apps.googleusercontent.com',
      authURL: 'https://accounts.google.com/o/oauth2/v2/auth',
      scopes: ['https://www.googleapis.com/auth/drive.appdata']
    },
    onedrive: {
      flow: 'token',
      clientId: '3864ce03-867c-4ad8-9856-371a097d47b1',
      authURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      redirect_uri: 'https://clngdbkpkpeebahjckkjfobafhncgmne.chromiumapp.org/',
      scopes: ['Files.ReadWrite.AppFolder']
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
        // console.log(obj, k);
        if (!obj[k.TOKEN] || Date.now() > obj[k.EXPIRE]) {
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
      redirect_uri: provider.redirect_uri || chrome.identity.getRedirectURL(),
      state
    };
    if (provider.scopes) {
      query.scope = provider.scopes.join(' ');
    }
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
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: stringifyQuery({
            code,
            grant_type: 'authorization_code',
            client_id: provider.clientId,
            redirect_uri: provider.redirect_uri || chrome.identity.getRedirectURL()
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
        console.log(result) && 0 || chromeLocal.set({
          [k.TOKEN]: result.access_token,
          [k.EXPIRE]: result.expires_in ? Date.now() + result.expires_in * 60 * 1000 : undefined,
          [k.REFRESH]: result.refresh_token
        })
          .then(() => result.access_token)
      );
  }
})();
