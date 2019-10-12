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
      flow: 'code',
      clientId: '283762574871-d4u58s4arra5jdan2gr00heasjlttt1e.apps.googleusercontent.com',
      clientSecret: 'J0nc5TlR_0V_ex9-sZk-5faf',
      authURL: 'https://accounts.google.com/o/oauth2/v2/auth',
      authQuery: {
        access_type: 'offline'
      },
      tokenURL: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/drive.appdata']
    },
    onedrive: {
      flow: 'code',
      clientId: '3864ce03-867c-4ad8-9856-371a097d47b1',
      clientSecret: '9Pj=TpsrStq8K@1BiwB9PIWLppM:@s=w',
      authURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      redirect_uri: 'https://clngdbkpkpeebahjckkjfobafhncgmne.chromiumapp.org/',
      scopes: ['Files.ReadWrite.AppFolder', 'offline_access']
    }
  };
  const LATENCY = 30;

  return {getToken, revokeToken, getClientId, buildKeys};

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
    const provider = AUTH[name];
    const body = {
      client_id: provider.clientId,
      refresh_token: obj[k.REFRESH],
      grant_type: 'refresh_token',
      scope: provider.scopes.join(' ')
    };
    if (provider.clientSecret) {
      body.client_secret = provider.clientSecret;
    }
    return postQuery(provider.tokenURL, body)
      .then(result => {
        if (!result.refresh_token) {
          result.refresh_token = obj[k.REFRESH];
        }
        return handleTokenResult(result, k);
      });
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
    if (provider.authQuery) {
      Object.assign(query, provider.authQuery);
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
        const body = {
          code,
          grant_type: 'authorization_code',
          client_id: provider.clientId,
          redirect_uri: provider.redirect_uri || chrome.identity.getRedirectURL()
        };
        if (provider.clientSecret) {
          body.client_secret = provider.clientSecret;
        }
        return postQuery(provider.tokenURL, body);
      })
      .then(result => handleTokenResult(result, k));
  }

  function handleTokenResult(result, k) {
    return chromeLocal.set({
      [k.TOKEN]: result.access_token,
      [k.EXPIRE]: result.expires_in ? Date.now() + (Number(result.expires_in) - LATENCY) * 1000 : undefined,
      [k.REFRESH]: result.refresh_token
    })
      .then(() => result.access_token);
  }

  function postQuery(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: stringifyQuery(body)
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
  }
})();
