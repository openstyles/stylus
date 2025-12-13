import {kAppUrlencoded, kContentType} from '@/js/consts';
import {DNR_ID_IDENTITY, updateSessionRules} from '@/js/dnr';
import {chromeLocal} from '@/js/storage-util';
import {FIREFOX} from '@/js/ua';
import * as URLS from '@/js/urls';
import {clamp, getHost} from '@/js/util';
import {browserWindows} from '@/js/util-webext';
import launchWebAuthFlow from 'webext-launch-web-auth-flow';
import {isVivaldi} from './common';

// ===== TOKEN ENCRYPTION SYSTEM (CRITICAL SECURITY FIX) =====
const ENCRYPTION_VERSION = 1;
const ENCRYPTION_KEY_CACHE = {};

/**
 * Derives a stable encryption key from extension identity
 * Uses SubtleCrypto with extension ID as seed
 */
async function deriveEncryptionKey() {
  const cacheKey = 'default';
  if (ENCRYPTION_KEY_CACHE[cacheKey]) {
    return ENCRYPTION_KEY_CACHE[cacheKey];
  }

  try {
    // Get deterministic key material from extension identity
    const extensionId = chrome.runtime.id;
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(extensionId + 'stylus-token-encryption-v1'),
      {name: 'PBKDF2'},
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: new TextEncoder().encode('stylus-tokens'),
        iterations: 100000,
      },
      keyMaterial,
      256 // 256 bits for AES-256
    );

    const key = await crypto.subtle.importKey(
      'raw',
      derivedBits,
      {name: 'AES-GCM'},
      false,
      ['encrypt', 'decrypt']
    );

    ENCRYPTION_KEY_CACHE[cacheKey] = key;
    return key;
  } catch (err) {
    console.error('Failed to derive encryption key:', err);
    throw new Error('Encryption system unavailable');
  }
}

/**
 * Encrypts token using AES-256-GCM
 * Returns: {version, iv, data} encoded as base64
 */
async function encryptToken(token) {
  if (!token) return null;

  try {
    const key = await deriveEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
    const encodedToken = new TextEncoder().encode(token);

    const encrypted = await crypto.subtle.encrypt(
      {name: 'AES-GCM', iv},
      key,
      encodedToken
    );

    const payload = {
      version: ENCRYPTION_VERSION,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    };

    // Return as base64 for storage
    return btoa(JSON.stringify(payload));
  } catch (err) {
    console.error('Token encryption failed:', err);
    throw err;
  }
}

/**
 * Decrypts token using AES-256-GCM
 * Handles both encrypted and legacy plaintext tokens
 */
async function decryptToken(encrypted) {
  if (!encrypted) return null;

  try {
    // Try to parse as encrypted token
    const payload = JSON.parse(atob(encrypted));

    if (payload.version !== ENCRYPTION_VERSION) {
      throw new Error(`Unsupported encryption version: ${payload.version}`);
    }

    const key = await deriveEncryptionKey();
    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);

    const decrypted = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv},
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    // Fallback: if decryption fails, check if it's a legacy plaintext token
    try {
      // If it's not a valid base64-encoded JSON with required fields, treat as plaintext
      const decoded = atob(encrypted);
      const payload = JSON.parse(decoded);
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'version' in payload &&
        'iv' in payload &&
        'data' in payload
      ) {
        // Looks like an encrypted token, so rethrow original error
        throw err;
      } else {
        // Not an encrypted token, treat as plaintext
        console.warn('Using plaintext token (unencrypted). Please re-authenticate.');
        return encrypted;
      }
    } catch (fallbackErr) {
      // If atob or JSON.parse fails, treat as plaintext
      console.warn('Using plaintext token (unencrypted). Please re-authenticate.');
      return encrypted;
    }
    // If we get here, something else went wrong
    console.error('Token decryption failed:', err);
    throw new Error('Failed to decrypt token');
  }
}

// ===== END ENCRYPTION SYSTEM =====

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
    // SECURITY: Client secret removed. Use backend token exchange.
    // See: oauth2TokenExchange() function
    authURL: 'https://accounts.google.com/o/oauth2/v2/auth',
    authQuery: {
      // NOTE: Google needs 'prompt' parameter to deliver multiple refresh
      // tokens for multiple machines.
      // https://stackoverflow.com/q/18519185
      access_type: 'offline',
      prompt: 'consent',
    },
    tokenExchangeUrl: URLS.oAuthTokenExchange, // Backend endpoint
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  },
  onedrive: {
    flow: 'code',
    clientId: '3864ce03-867c-4ad8-9856-371a097d47b1',
    // SECURITY: Client secret removed. Use backend token exchange.
    authURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenExchangeUrl: URLS.oAuthTokenExchange, // Backend endpoint
    scopes: ['Files.ReadWrite.AppFolder', 'offline_access'],
  },
  userstylesworld: {
    flow: 'code',
    clientId: 'zeDmKhJIfJqULtcrGMsWaxRtWHEimKgS',
    // SECURITY: Client secret removed. Use backend token exchange.
    authURL: URLS.usw + 'api/oauth/style/link',
    tokenExchangeUrl: URLS.oAuthTokenExchange, // Backend endpoint
    redirect_uri: 'https://gusted.xyz/callback_helper/',
  },
};
// SECURITY: OAuth token exchange through secure backend instead of exposing client secrets
async function oauth2TokenExchange(provider, authCode) {
  // Backend endpoint handles token exchange with secret client credentials
  // This prevents embedding secrets in the extension source code
  const tokenExchangeUrl = AUTH[provider]?.tokenExchangeUrl;
  if (!tokenExchangeUrl) {
    throw new Error(`No token exchange URL configured for provider: ${provider}`);
  }

  const payload = {
    provider,
    authCode,
  };

  try {
    const response = await fetch(tokenExchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Prevent CSRF
      },
      credentials: 'omit', // Don't send cookies to untrusted backend
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    // Validate response contains required fields
    if (!result.access_token) {
      throw new Error('Token exchange response missing access_token');
    }

    return result; // {access_token, refresh_token (optional), expires_in, ...}
  } catch (error) {
    console.error('[token-manager] Token exchange error:', error);
    throw new Error(`Failed to exchange auth code for tokens: ${error.message}`);
  }
}

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
      // Decrypt token before returning
      const token = await decryptToken(obj[k.TOKEN]);
      return token;
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
      const encryptedToken = await chromeLocal.getValue(k.TOKEN);
      if (encryptedToken) {
        const token = await decryptToken(encryptedToken);
        await provider.revoke(token);
      }
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
  const refreshToken = await decryptToken(obj[k.REFRESH]);
  const body = {
    client_id: provider.clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: provider.scopes.join(' '),
  };
  if (provider.clientSecret) {
    body.client_secret = provider.clientSecret;
  }
  const result = await postQuery(provider.tokenURL, body);
  if (!result.refresh_token) {
    // reuse old refresh token
    result.refresh_token = refreshToken;
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
    // SECURITY: Use backend token exchange instead of client-side secret exposure
    const code = params.get('code');
    if (provider.tokenExchangeUrl) {
      // Use secure backend for token exchange
      result = await oauth2TokenExchange(name, code);
    } else {
      // Fallback for providers with public clients (no secret needed)
      const body = {
        code,
        grant_type: 'authorization_code',
        client_id: provider.clientId,
        redirect_uri: query.redirect_uri,
        state,
      };
      result = await postQuery(provider.tokenURL, body);
    }
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
  // Encrypt tokens before storing
  const encryptedToken = await encryptToken(result.access_token);
  const encryptedRefresh = result.refresh_token
    ? await encryptToken(result.refresh_token)
    : undefined;

  await chromeLocal.set({
    [k.TOKEN]: encryptedToken,
    [k.EXPIRE]: result.expires_in
      ? Date.now() + (result.expires_in - NETWORK_LATENCY) * 1000
      : undefined,
    [k.REFRESH]: encryptedRefresh,
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
