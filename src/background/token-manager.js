import {kAppUrlencoded, kContentType} from '@/js/consts';
import {DNR_ID_IDENTITY, updateSessionRules} from '@/js/dnr';
import {chromeLocal} from '@/js/storage-util';
import {FIREFOX} from '@/js/ua';
import * as URLS from '@/js/urls';
import {clamp, getHost} from '@/js/util';
import {browserWindows} from '@/js/util-webext';
import launchWebAuthFlow from 'webext-launch-web-auth-flow';
import {isVivaldi} from './common';

const AUTH = {
  dropbox: {
    flow: 'token',
    clientId: 'zg52vphuapvpng9',
    authURL: 'https://www.dropbox.com/oauth2/authorize',
    tokenURL: 'https://api.dropboxapi.com/oauth2/token',
    revoke: token =>
      fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }),
  },
  google: {
    flow: 'code',
    clientId: '283762574871-d4u58s4arra5jdan2gr00heasjlttt1e.apps.googleusercontent.com',
    clientSecret: 'J0nc5TlR_0V_ex9-sZk-5faf',
    authURL: 'https://accounts.google.com/o/oauth2/v2/auth',
    authQuery: {
      // NOTE: Google needs 'prompt' parameter to deliver multiple refresh
      // tokens for multiple machines.
      // https://stackoverflow.com/q/18519185
      access_type: 'offline',
      prompt: 'consent',
    },
    tokenURL: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    // FIXME: https://github.com/openstyles/stylus/issues/1248
    // revoke: token => {
      // const params = {token};
      // return postQuery(`https://accounts.google.com/o/oauth2/revoke?${new URLSearchParams(params)}`);
    // },
  },
  onedrive: {
    flow: 'code',
    clientId: '3864ce03-867c-4ad8-9856-371a097d47b1',
    clientSecret: '9Pj=TpsrStq8K@1BiwB9PIWLppM:@s=w',
    authURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Files.ReadWrite.AppFolder', 'offline_access'],
  },
  userstylesworld: {
    flow: 'code',
    clientId: 'zeDmKhJIfJqULtcrGMsWaxRtWHEimKgS',
    clientSecret: 'wqHsvTuThQmXmDiVvOpZxPwSIbyycNFImpAOTxjaIRqDbsXcTOqrymMJKsOMuibFaij' +
      'ZZAkVYTDbLkQuYFKqgpMsMlFlgwQOYHvHFbgxQHDTwwdOroYhOwFuekCwXUlk',
    authURL: URLS.usw + 'api/oauth/style/link',
    tokenURL: URLS.usw + 'api/oauth/token',
    redirect_uri: 'https://gusted.xyz/callback_helper/',
  },
};
const NETWORK_LATENCY = 30; // seconds
const DEFAULT_REDIRECT_URI = 'https://clngdbkpkpeebahjckkjfobafhncgmne.chromiumapp.org/';

let alwaysUseTab = !browserWindows || (FIREFOX ? false : null);

class TokenError extends Error {
  constructor(provider, message) {
    super(`[${provider}] ${message}`);
    this.name = 'TokenError';
    this.provider = provider;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TokenError);
    }
  }
}

function buildKeys(name, hooks) {
  const prefix = `secure/token/${hooks ? hooks.keyName(name) : name}/`;
  const k = {
    TOKEN: `${prefix}token`,
    EXPIRE: `${prefix}expire`,
    REFRESH: `${prefix}refresh`,
  };
  k.LIST = Object.values(k);
  return k;
}

export async function getToken(name, interactive, hooks) {
  const k = buildKeys(name, hooks);
  const obj = await chromeLocal.get(k.LIST);
  if (obj[k.TOKEN]) {
    if (!obj[k.EXPIRE] || Date.now() < obj[k.EXPIRE]) {
      return obj[k.TOKEN];
    }
    if (obj[k.REFRESH]) {
      return refreshToken(name, k, obj);
    }
  }
  if (!interactive) {
    throw new TokenError(name, 'Token is missing');
  }
  return authUser(k, name, interactive, hooks);
}

export async function revokeToken(name, hooks) {
  const provider = AUTH[name];
  const k = buildKeys(name, hooks);
  if (provider.revoke) {
    try {
      const token = await chromeLocal.getValue(k.TOKEN);
      if (token) await provider.revoke(token);
    } catch (e) {
      console.error(e);
    }
  }
  await chromeLocal.remove(k.LIST);
}

async function refreshToken(name, k, obj) {
  if (!obj[k.REFRESH]) {
    throw new TokenError(name, 'No refresh token');
  }
  const provider = AUTH[name];
  const body = {
    client_id: provider.clientId,
    refresh_token: obj[k.REFRESH],
    grant_type: 'refresh_token',
    scope: provider.scopes.join(' '),
  };
  if (provider.clientSecret) {
    body.client_secret = provider.clientSecret;
  }
  const result = await postQuery(provider.tokenURL, body);
  if (!result.refresh_token) {
    // reuse old refresh token
    result.refresh_token = obj[k.REFRESH];
  }
  return handleTokenResult(result, k);
}

async function authUser(keys, name, interactive = false, hooks = null) {
  const provider = AUTH[name];
  const state = Math.random().toFixed(8).slice(2);
  const redirectUri = provider.redirect_uri || DEFAULT_REDIRECT_URI;
  const query = {
    response_type: provider.flow,
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    state,
  };
  if (provider.scopes) {
    query.scope = provider.scopes.join(' ');
  }
  if (provider.authQuery) {
    Object.assign(query, provider.authQuery);
  }
  hooks?.query(query);
  const url = `${provider.authURL}?${new URLSearchParams(query)}`;
  const finalUrl = await (__.MV3 ? authUserMV3 : authUserMV2)(url, interactive,
    redirectUri);
  const params = new URLSearchParams(
    provider.flow === 'token' ?
      new URL(finalUrl).hash.slice(1) :
      new URL(finalUrl).search.slice(1)
  );
  if (params.get('state') !== state) {
    throw new TokenError(name, `Unexpected state: ${params.get('state')}, expected: ${state}`);
  }
  let result;
  if (provider.flow === 'token') {
    const obj = {};
    for (const [key, value] of params) {
      obj[key] = value;
    }
    result = obj;
  } else {
    const code = params.get('code');
    const body = {
      code,
      grant_type: 'authorization_code',
      client_id: provider.clientId,
      redirect_uri: query.redirect_uri,
      state,
    };
    if (provider.clientSecret) {
      body.client_secret = provider.clientSecret;
    }
    result = await postQuery(provider.tokenURL, body);
  }
  return handleTokenResult(result, keys);
}

async function authUserMV2(url, interactive, redirectUri) {
  alwaysUseTab ??= await isVivaldi;
  const width = clamp(screen.availWidth - 100, 400, 800);
  const height = clamp(screen.availHeight - 100, 200, 800);
  const wnd = !alwaysUseTab && await browserWindows.getLastFocused();
  return launchWebAuthFlow({
    url,
    alwaysUseTab,
    interactive,
    redirect_uri: redirectUri,
    windowOptions: wnd && Object.assign({
      state: 'normal',
      width,
      height,
    }, wnd.state !== 'minimized' && {
      // Center the popup to the current window
      top: Math.ceil(wnd.top + (wnd.height - width) / 2),
      left: Math.ceil(wnd.left + (wnd.width - width) / 2),
    }),
  });
}

async function authUserMV3(url, interactive, redirectUri) {
  const apiUrl = chrome.identity.getRedirectURL();
  if (apiUrl !== redirectUri) {
    await updateSessionRules([{
      id: DNR_ID_IDENTITY,
      condition: {
        urlFilter: '|' + redirectUri,
        resourceTypes: ['main_frame'],
      },
      action: {
        type: 'redirect',
        redirect: {
          transform: {
            host: getHost(apiUrl),
          },
        },
      },
    }]);
  }
  try {
    return await chrome.identity.launchWebAuthFlow({interactive, url});
  } finally {
    if (redirectUri) await updateSessionRules(undefined, [DNR_ID_IDENTITY]);
  }
}

async function handleTokenResult(result, k) {
  await chromeLocal.set({
    [k.TOKEN]: result.access_token,
    [k.EXPIRE]: result.expires_in
      ? Date.now() + (result.expires_in - NETWORK_LATENCY) * 1000
      : undefined,
    [k.REFRESH]: result.refresh_token,
  });
  return result.access_token;
}

async function postQuery(url, body) {
  const options = {
    method: 'POST',
    headers: {[kContentType]: kAppUrlencoded},
    body: body ? new URLSearchParams(body) : null,
  };
  const r = await fetch(url, options);
  if (r.ok) {
    return r.json();
  }
  const text = await r.text();
  const err = new Error(`Failed to fetch (${r.status}): ${text}`);
  err.code = r.status;
  throw err;
}
