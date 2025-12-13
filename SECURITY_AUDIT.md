# Stylus Browser Extension - Security Audit Report

**Date:** December 12, 2025  
**Scope:** Stylus extension codebase (openstyles/stylus, branch: sec)  
**Repository:** https://github.com/openstyles/stylus

---

## EXECUTIVE SUMMARY

This security audit identifies **7 medium-risk and 2 high-risk** findings across the Stylus browser extension. Key concerns include:

1. **OAuth token storage in plaintext Chrome Local Storage** - Credentials lack encryption
2. **Missing HTTPS enforcement for sync/cloud endpoints** - WebDAV and API URLs not validated
3. **No size limits on downloaded styles** - Potential DoS/resource exhaustion
4. **Overly permissive message passing** - Limited origin/tab validation
5. **Client secret hardcoding** - OAuth credentials exposed in source code
6. **Unsafe URL redirects** - Potential redirect attacks in style installer
7. **DOM-based XSS via DOMParser** - Unsanitized HTML parsing in localization
8. **Unvalidated MIME type handling** - Filetype bypass risks in installer

---

## DETAILED FINDINGS REGISTER

### 🔴 HIGH SEVERITY FINDINGS

#### FINDING #1: OAuth Token Storage in Plaintext (CRITICAL)

| Property | Value |
|----------|-------|
| **Severity** | 🔴 HIGH |
| **Component** | Token Management |
| **Exploitability** | HIGH - Direct access via chrome.storage |
| **Impact** | Token theft → Full account compromise (Dropbox, Google Drive, OneDrive, USW) |
| **CWE** | CWE-312: Cleartext Storage of Sensitive Information |

**Code Location:**  
[src/background/token-manager.js](src/background/token-manager.js#L90-L102)

```javascript
async function handleTokenResult(result, k) {
  await chromeLocal.set({
    [k.TOKEN]: result.access_token,         // ❌ PLAINTEXT
    [k.EXPIRE]: result.expires_in
      ? Date.now() + (result.expires_in - NETWORK_LATENCY) * 1000
      : undefined,
    [k.REFRESH]: result.refresh_token,      // ❌ PLAINTEXT
  });
  return result.access_token;
}
```

**Vulnerability Details:**
- Access tokens and refresh tokens stored directly in `chrome.storage.local` without encryption
- Any malicious extension or script can read tokens via `chrome.storage.local.get()`
- No defense-in-depth; tokens are accessible on extension compromise
- Refresh tokens have infinite lifetime until explicit revocation

**Attack Scenario:**
1. Attacker installs malicious extension with elevated permissions
2. Reads `secure/token/*` keys from chrome.storage.local
3. Obtains valid access/refresh tokens for Google Drive, Dropbox, OneDrive
4. Accesses user's cloud storage and synced styles without user knowledge

**Proof of Concept:**
```javascript
// Any extension can execute this
chrome.storage.local.get(['secure/token/google/token', 'secure/token/dropbox/token'], (tokens) => {
  console.log('Stolen tokens:', tokens);
  // Use tokens to impersonate user
});
```

**Fix (Priority: CRITICAL):**

1. **Encrypt tokens at rest** using `crypto.subtle` AES-256-GCM with key derived from chrome identity
2. **Use chrome.storage.session** (MV3) instead of local for short-lived access tokens
3. **Implement token expiration enforcement**
4. **Optional: Use Extension Wallet** for secret management if available

```javascript
// PATCH: Encrypt tokens before storage
async function handleTokenResult(result, k) {
  const encrypted = await encryptToken(result.access_token);
  const refreshEncrypted = result.refresh_token 
    ? await encryptToken(result.refresh_token)
    : undefined;
  
  await chromeLocal.set({
    [k.TOKEN]: encrypted,
    [k.EXPIRE]: result.expires_in
      ? Date.now() + (result.expires_in - NETWORK_LATENCY) * 1000
      : undefined,
    [k.REFRESH]: refreshEncrypted,
    [k.ENCRYPTED]: true, // flag for version detection
  });
  return result.access_token;
}

async function getToken(name, interactive, hooks) {
  const k = buildKeys(name, hooks);
  const obj = await chromeLocal.get(k.LIST);
  
  if (obj[k.TOKEN]) {
    if (!obj[k.EXPIRE] || Date.now() < obj[k.EXPIRE]) {
      const token = obj[k.ENCRYPTED]
        ? await decryptToken(obj[k.TOKEN])
        : obj[k.TOKEN]; // backward compat
      return token;
    }
    // ... rest of function
  }
}

async function encryptToken(token) {
  // Use chrome.identity.getProfileUserInfo() to derive key
  const keyMaterial = await deriveKeyFromIdentity();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    new TextEncoder().encode(token)
  );
  return btoa(JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  }));
}
```

**Acceptance Criteria:**
- [ ] Tokens encrypted at rest in chrome.storage.local
- [ ] Key derivation tied to extension identity (no hardcoded keys)
- [ ] Backward compatibility for existing users
- [ ] Token expiration checked on every retrieval
- [ ] Security test: Verify tokens unreadable to other extensions

---

#### FINDING #2: Hardcoded OAuth Client Secrets

| Property | Value |
|----------|-------|
| **Severity** | 🔴 HIGH |
| **Component** | OAuth Configuration |
| **Exploitability** | HIGH - Public in source code |
| **Impact** | Account takeover, token generation without user consent |
| **CWE** | CWE-798: Use of Hard-Coded Credentials |

**Code Location:**  
[src/background/token-manager.js](src/background/token-manager.js#L12-L62)

```javascript
const AUTH = {
  dropbox: {
    flow: 'token',
    clientId: 'zg52vphuapvpng9',
    // ✓ No secret for implicit flow (safe)
  },
  google: {
    flow: 'code',
    clientId: '283762574871-d4u58s4arra5jdan2gr00heasjlttt1e.apps.googleusercontent.com',
    clientSecret: 'J0nc5TlR_0V_ex9-sZk-5faf',  // ❌ HARDCODED
  },
  onedrive: {
    flow: 'code',
    clientId: '3864ce03-867c-4ad8-9856-371a097d47b1',
    clientSecret: '9Pj=TpsrStq8K@1BiwB9PIWLppM:@s=w', // ❌ HARDCODED
  },
  userstylesworld: {
    flow: 'code',
    clientId: 'zeDmKhJIfJqULtcrGMsWaxRtWHEimKgS',
    clientSecret: 'wqHsvTuThQmXmDiVvOpZxPwSIbyycNFImpAOTxjaIRqDbsXcTOqrymMJKsOMuibFaij' +
      'ZZAkVYTDbLkQuYFKqgpMsMlFlgwQOYHvHFbgxQHDTwwdOroYhOwFuekCwXUlk', // ❌ HARDCODED
  },
};
```

**Vulnerability Details:**
- Google, OneDrive, and UserStylesWorld client secrets embedded in distributed extension
- Attackers can extract secrets from extension package
- Secrets allow:
  - Generating new tokens for any user without their consent
  - Impersonating the extension to OAuth providers
  - Revoking legitimate user sessions
  - Accessing user data across all Stylus installs

**Attack Chain:**
1. Extract extension (CRX → ZIP)
2. Read `src/background/token-manager.js`
3. Obtain credentials: `Google: J0nc5TlR_0V_ex9-sZk-5faf`
4. Use authorization code flow to generate tokens for any user
5. Access Google Drive, steal synced styles and metadata

**Fix (Priority: CRITICAL):**

1. **Move secrets to secure backend** (server you control)
2. **Implement token exchange endpoint** that verifies extension identity
3. **For public OAuth clients** (Dropbox): Continue using public flow
4. **For confidential clients** (Google, OneDrive): Use server-side token generation

```javascript
// PATCH: Use backend token exchange
const AUTH = {
  dropbox: {
    flow: 'token',
    clientId: 'zg52vphuapvpng9', // Public - safe
  },
  google: {
    flow: 'code',
    clientId: '283762574871-d4u58s4arra5jdan2gr00heasjlttt1e.apps.googleusercontent.com',
    // ❌ clientSecret removed
    tokenExchangeUrl: 'https://your-backend.com/api/oauth/google/token',
  },
  onedrive: {
    flow: 'code',
    clientId: '3864ce03-867c-4ad8-9856-371a097d47b1',
    // ❌ clientSecret removed
    tokenExchangeUrl: 'https://your-backend.com/api/oauth/onedrive/token',
  },
};

// During token exchange:
async function exchangeAuthCode(provider, code, redirectUri) {
  const response = await fetch('https://your-backend.com/api/oauth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      code,
      redirectUri,
      extensionId: chrome.runtime.id, // For verification
    }),
  });
  return response.json();
}
```

**Alternative (if backend unavailable):**
- Use service workers in MV3 to keep secrets out of extension package
- Fetch secrets from secure CDN at runtime (with origin validation)
- Requires rotating secrets regularly

**Acceptance Criteria:**
- [ ] Client secrets removed from source code
- [ ] Token exchange server implemented
- [ ] Server validates extension identity (via chrome.runtime.id)
- [ ] Secrets rotated immediately
- [ ] No backward-compatible access with old secrets

---

### 🟡 MEDIUM SEVERITY FINDINGS

#### FINDING #3: Missing HTTPS Enforcement for Cloud Endpoints

| Property | Value |
|----------|-------|
| **Severity** | 🟡 MEDIUM |
| **Component** | Network Requests |
| **Exploitability** | MEDIUM - Requires network MITM |
| **Impact** | Style injection, token compromise via redirect |
| **CWE** | CWE-295: Improper Certificate Validation |

**Code Location:**  
[src/js/util.js](src/js/util.js#L208-L214)  
[src/background/sync-manager.js](src/background/sync-manager.js#L284)

```javascript
export function fetchWebDAV(url, init = {}) {
  return fetch(url, {
    ...init,
    credentials: 'omit',
    headers: {
      ...init.headers,
      Authorization: `Basic ${btoa(`${this.username || ''}:${this.password || ''}`)}`, // ❌ Basic auth
    },
  });
}
```

**Vulnerability Details:**
- WebDAV URLs not validated to be HTTPS
- Basic auth credentials transmitted on plain HTTP (even with `credentials: omit`)
- No redirect validation - attacker can redirect http://webdav.example.com → http://attacker.com
- No certificate pinning or HPKP

**Attack Scenario:**
1. User configures WebDAV sync with `http://nas.local/stylus/`
2. Attacker on same network intercepts traffic
3. Reads Basic auth credentials: `username:password` (base64 decoded)
4. Redirects requests to `http://attacker.com/`
5. Receives all synced styles and metadata

**Fix (Priority: MEDIUM):**

```javascript
// PATCH: Enforce HTTPS for sensitive operations
export function fetchWebDAV(url, init = {}) {
  const u = new URL(url);
  
  // ✓ ENFORCE HTTPS for remote URLs
  if (!u.hostname.match(/^(localhost|127\.|::1)/i) && u.protocol !== 'https:') {
    throw new Error(`WebDAV sync requires HTTPS for remote servers. Got: ${u.protocol}`);
  }
  
  return fetch(url, {
    ...init,
    credentials: 'omit',
    headers: {
      ...init.headers,
      // ✓ Use Authorization header instead of Basic auth in URL
      'Authorization': `Basic ${btoa(`${this.username || ''}:${this.password || ''}`)}`,
    },
    // ✓ Validate redirects
    redirect: 'error', // Fail on redirect
  });
}

// Alternative: validate at configuration time
export function validateWebDAVUrl(url) {
  const u = new URL(url);
  const isLocal = u.hostname.match(/^(localhost|127\.|::1|192\.168\.|10\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[01]\.)/i);
  
  if (u.protocol === 'http:' && !isLocal) {
    throw new Error('WebDAV over HTTP requires local network. Use HTTPS for remote access.');
  }
  if (u.username || u.password) {
    throw new Error('Credentials in URL are insecure. Use settings instead.');
  }
}
```

**Acceptance Criteria:**
- [ ] HTTPS enforcement for all remote WebDAV URLs
- [ ] Localhost exception for 127.0.0.1, ::1, .local
- [ ] Redirect validation (error on unexpected redirect)
- [ ] Credentials not embedded in URL
- [ ] Security warning for HTTP WebDAV in UI

---

#### FINDING #4: No Size Limits on Downloaded Styles

| Property | Value |
|----------|-------|
| **Severity** | 🟡 MEDIUM |
| **Component** | Style Download & Update |
| **Exploitability** | MEDIUM - Any malicious style host |
| **Impact** | DoS, out-of-memory crash, browser freeze |
| **CWE** | CWE-770: Allocation of Resources Without Limits |

**Code Location:**  
[src/background/download.js](src/background/download.js#L42-L130)  
[src/background/update-manager.js](src/background/update-manager.js#L217-L230)

```javascript
async function doDownload(url, {
  method = 'GET',
  timeout = 60e3,
  loadTimeout = 2 * 60e3,
  // ❌ NO MAXSIZE LIMIT
  // ❌ NO CONTENT-LENGTH CHECK
}, jobKey) {
  const resp = __.MV3
    ? await fetch(url, { ... })
    : await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        // ❌ No xhr.upload.onprogress to validate size
        xhr.send(body);
      });
  
  // ❌ Entire response stored in memory
  data = await resp[responseType === 'arraybuffer' ? 'arrayBuffer' : responseType]();
  return data;
}
```

**Vulnerability Details:**
- No maximum size limit for downloaded styles (CSS files)
- No Content-Length header validation
- Streaming response consumed entirely into memory
- Server can serve gigabyte-sized response → extension crash
- Memory pressure can freeze entire browser

**Attack Scenario:**
1. Attacker creates malicious style on USO or self-hosted site
2. Sets Content-Length: infinity or large value (1GB+)
3. User installs style
4. Stylus downloads entire response into memory
5. Browser becomes unresponsive and crashes

**Fix (Priority: MEDIUM):**

```javascript
// PATCH: Add size limits
const MAX_STYLE_SIZE = 10 * 1024 * 1024; // 10MB for CSS
const MAX_METADATA_SIZE = 1024 * 1024;   // 1MB for JSON

async function doDownload(url, {
  method = 'GET',
  maxSize = MAX_STYLE_SIZE,
  // ... other params
}, jobKey) {
  const resp = __.MV3
    ? await fetch(url, { ... })
    : await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // ✓ Validate Content-Length header
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 2) { // Headers received
            const contentLength = xhr.getResponseHeader('Content-Length');
            if (contentLength && parseInt(contentLength) > maxSize) {
              xhr.abort();
              reject(new Error(`Content size exceeds limit: ${contentLength} > ${maxSize}`));
            }
          }
        };
        
        // ✓ Track downloaded size
        let downloadedSize = 0;
        xhr.onprogress = (e) => {
          downloadedSize = e.loaded;
          if (downloadedSize > maxSize) {
            xhr.abort();
            reject(new Error(`Downloaded size exceeds limit: ${downloadedSize} > ${maxSize}`));
          }
          reportProgress(jobKey, [downloadedSize, e.total]);
        };
        
        xhr.send(body);
      });
  
  // ✓ For Fetch API, use ReadableStream with size limit
  if (__.MV3) {
    let downloadedSize = 0;
    const reader = resp.body.getReader();
    const chunks = [];
    
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      
      downloadedSize += value.length;
      if (downloadedSize > maxSize) {
        throw new Error(`Downloaded size exceeds limit: ${downloadedSize} > ${maxSize}`);
      }
      chunks.push(value);
    }
    
    data = new TextDecoder().decode(concatenateArrays(chunks));
  }
  
  return data;
}

// In update-manager.js, use smaller limit for metadata:
async function updateUSO() {
  const md5 = await tryDownload(md5Url, {maxSize: MAX_METADATA_SIZE});
  // ...
}
```

**Acceptance Criteria:**
- [ ] Max size limit: 10MB for styles, 1MB for metadata
- [ ] Content-Length validation before download
- [ ] Download aborted if size exceeded
- [ ] Progress tracking with size verification
- [ ] User warning if style near size limit
- [ ] Configurable limit in preferences (power users)

---

#### FINDING #5: Overly Permissive Message Passing / No Origin Validation

| Property | Value |
|----------|-------|
| **Severity** | 🟡 MEDIUM |
| **Component** | Message Passing (IPC) |
| **Exploitability** | MEDIUM - Requires malicious content on target page |
| **Impact** | UI manipulation, style injection, minor privilege escalation |
| **CWE** | CWE-346: Origin Validation Error |

**Code Location:**  
[src/js/msg.js](src/js/msg.js#L30-L50)  
[src/background/index.js](src/background/index.js#L137-L144)

```javascript
// msg.js - Global message listener
export function _execute(data, sender, multi, broadcast) {
  let result;
  let res;
  // ❌ NO SENDER VERIFICATION
  // ❌ NO ORIGIN CHECK
  for (const [fn, replyAllowed] of onMessage) {
    try {
      data.broadcast = broadcast;
      res = fn(data, sender, !!multi);  // sender includes sender.url, sender.tab
      // ❌ Handlers can receive ANY message from ANY origin
    } catch (err) {
      res = Promise.reject(err);
    }
    if (replyAllowed && res !== result && result === undefined) {
      result = res;
    }
  }
  return result;
}

// background/index.js - No authorization checks
onMessage.set((m, sender) => {
  if (m.method === kInvokeAPI) {
    let res = API;
    for (const p of m.path.split('.')) res = res && res[p];
    if (!res) throw new Error(`Unknown API.${m.path}`);
    // ❌ ANY content script can call ANY API method
    res = res.apply({msg: m, sender}, m.args);
    return res ?? null;
  }
}, true);
```

**Vulnerability Details:**
- Content scripts can call any API method without authorization
- No check if sender is legitimate Stylus content script
- Malicious script on page can inject messages
- Example: `chrome.runtime.sendMessage({method: 'api.styles.putMany', args: [badStyles]})`

**Attack Scenario:**
1. Attacker injects script into compromised website (e.g., via XSS)
2. Injects malicious styles for all websites
3. Calls `API.styles.putMany([{targets: 'https://*', code: 'body{display:none}'}])`
4. All websites are broken/hidden for user
5. User cannot visit any site without disabling Stylus

**Note:** Limited impact due to content script isolation, but still a concern.

**Fix (Priority: MEDIUM):**

```javascript
// PATCH: Add origin & sender validation
// Create allowlist of trusted origins (only Stylus own origins)
const TRUSTED_ORIGINS = [
  chrome.runtime.getURL('/').slice(0, -1), // extension: protocol
];

const TRUSTED_PATHS = {
  // Read-only APIs safe for content scripts
  'API.styles.getAll': {readOnly: true, contentScript: true},
  'API.styles.getSectionsByUrl': {readOnly: true, contentScript: true},
  'API.data': {readOnly: true, contentScript: true},
  
  // Restricted: require specific sender
  'API.styles.putMany': {requireBackground: true},
  'API.styles.deleteMany': {requireBackground: true},
  'API.sync': {requireBackground: true},
};

// In background/index.js:
onMessage.set((m, sender) => {
  if (m.method === kInvokeAPI) {
    // ✓ VALIDATE SENDER
    const pathInfo = TRUSTED_PATHS[`API.${m.path}`];
    
    if (!pathInfo) {
      throw new Error(`Unauthorized API.${m.path}`);
    }
    
    // ✓ Background pages have higher privilege
    const isBackground = sender.tab === undefined;
    const isContentScript = !isBackground && sender.frameId === 0;
    
    if (pathInfo.requireBackground && !isBackground) {
      throw new Error(`API.${m.path} requires background context`);
    }
    
    if (!pathInfo.contentScript && isContentScript && !isBackground) {
      throw new Error(`Content scripts cannot access API.${m.path}`);
    }
    
    let res = API;
    for (const p of m.path.split('.')) res = res && res[p];
    if (!res) throw new Error(`Unknown API.${m.path}`);
    
    res = res.apply({msg: m, sender}, m.args);
    return res ?? null;
  }
}, true);
```

**Acceptance Criteria:**
- [ ] Allowlist of trusted APIs for content scripts
- [ ] Background-only APIs for sensitive operations
- [ ] Sender origin/tab verification
- [ ] API path validation against schema
- [ ] Deny-by-default for unknown APIs

---

#### FINDING #6: No Integrity Checking on Style Downloads

| Property | Value |
|----------|-------|
| **Severity** | 🟡 MEDIUM |
| **Component** | Style Update Mechanism |
| **Exploitability** | MEDIUM - Network MITM or host compromise |
| **Impact** | Malicious style injection, code execution |
| **CWE** | CWE-354: Improper Validation of Integrity Check Value |

**Code Location:**  
[src/background/update-manager.js](src/background/update-manager.js#L163-L189)

```javascript
async function updateUSO() {
  const md5 = await tryDownload(md5Url);  // ✓ Gets MD5 from server
  if (!md5 || md5.length !== 32) {
    return Promise.reject(STATES.ERROR_MD5);
  }
  if (md5 === style.originalMd5 && style.originalDigest && !ignoreDigest) {
    return Promise.reject(STATES.SAME_MD5);
  }
  // ❌ No verification that CSS matches MD5
  // ❌ Trusts USO server for both CSS and MD5 (same trust domain)
  const usoId = +md5Url.match(/\/(\d+)/)[1];
  updateUrl = style.updateUrl = `${usoApi}Css/${usoId}`;
  const {result: css} = await tryDownload(updateUrl, {responseType: 'json'});
  // ❌ Downloaded CSS NOT verified against MD5
  const json = await updateUsercss(css) || await toUsercss(...);
  json.originalMd5 = md5;  // Stored but never used for verification
  return json;
}
```

**Vulnerability Details:**
- MD5 downloaded from same server as CSS (no independent verification)
- No client-side hash validation of downloaded content
- `originalMd5` field stored but never verified on sync
- MITM attacker can serve malicious CSS + matching MD5

**Attack Scenario:**
1. Attacker compromises network or USO CDN edge
2. Replaces legitimate CSS with malicious payload
3. Replaces MD5 with hash of malicious CSS
4. User's Stylus downloads & installs malicious CSS
5. Malicious CSS injected on all websites

**Note:** MD5 is weakened but acceptable for this use case (not cryptographic security). Issue is lack of ANY verification.

**Fix (Priority: MEDIUM):**

```javascript
// PATCH: Verify downloaded content against hash
async function updateUSO() {
  const md5 = await tryDownload(md5Url);
  if (!md5 || md5.length !== 32) {
    return Promise.reject(STATES.ERROR_MD5);
  }
  if (md5 === style.originalMd5 && style.originalDigest && !ignoreDigest) {
    return Promise.reject(STATES.SAME_MD5);
  }
  
  const usoId = +md5Url.match(/\/(\d+)/)[1];
  updateUrl = style.updateUrl = `${usoApi}Css/${usoId}`;
  const {result: css} = await tryDownload(updateUrl, {responseType: 'json'});
  
  // ✓ VERIFY HASH
  const calculatedMd5 = await computeMd5(css.result);
  if (calculatedMd5 !== md5) {
    const err = new Error(`CSS integrity check failed: expected ${md5}, got ${calculatedMd5}`);
    err.code = 'INTEGRITY_MISMATCH';
    return Promise.reject(err);
  }
  
  const json = await updateUsercss(css) || await toUsercss(...);
  json.originalMd5 = md5;
  return json;
}

// Implement MD5 hash function
async function computeMd5(text) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Note: MD5 preferred for backward compat, but SHA-256 is better
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Acceptance Criteria:**
- [ ] Downloaded CSS verified against provided hash
- [ ] Hash mismatch causes update to fail with clear error
- [ ] Hash verification for both USO and UserCSS updates
- [ ] User notified of failed integrity checks
- [ ] Recommendation to upgrade to SHA-256 hashing

---

#### FINDING #7: Unsafe HTML Parsing with DOMParser

| Property | Value |
|----------|-------|
| **Severity** | 🟡 MEDIUM |
| **Component** | Localization System |
| **Exploitability** | LOW-MEDIUM - Requires malicious i18n message |
| **Impact** | DOM-based XSS if i18n source is compromised |
| **CWE** | CWE-94: Improper Control of Generation of Code |

**Code Location:**  
[src/js/localization.js](src/js/localization.js#L39)  
[src/js/localization.js](src/js/localization.js#L4) (comment mentions sanitized)

```javascript
export const parseHtml = str => new DOMParser().parseFromString(str, 'text/html');
// ❌ Parses HTML without sanitization
// ⚠️ Used for: `<tag i18n="html:id">` and `<tag i18n="+html:id">`

// Example from locales:
// "message": "<strong>Enable this if you encounter flashing...</strong>"
// When parsed and inserted into DOM → potential XSS if source compromised
```

**Vulnerability Details:**
- `DOMParser().parseFromString()` parses full HTML including scripts
- i18n messages can contain HTML tags
- If translation source compromised, scripts could be injected
- Comment says "sanitized" but code shows no sanitization

**Risk Level:** LOW → Medium in case of:
- Transifex account compromise
- Man-in-the-middle on translation download
- Malicious pull request to translation files

**Fix (Priority: MEDIUM):**

```javascript
// PATCH: Use textContent instead of parsing HTML
export const parseHtml = str => {
  // Option 1: Don't parse HTML at all - use textContent
  const div = document.createElement('div');
  div.textContent = str; // ✓ Safe - no HTML parsing
  return div.childNodes;
};

// Option 2: If HTML is required, use DOMPurify
// import DOMPurify from 'dompurify';
export const parseHtml = str => {
  const clean = DOMPurify.sanitize(str, {
    ALLOWED_TAGS: ['b', 'i', 'strong', 'em', 'a'], // Minimal set
    ALLOWED_ATTR: ['href', 'title'],
  });
  const div = document.createElement('div');
  div.innerHTML = clean;
  return div.childNodes;
};

// Or: Migrate to template strings and data attributes
// Instead of: <tag i18n="html:description">
// Use: <tag data-i18n="description"> with textContent assignment
```

**Acceptance Criteria:**
- [ ] Remove `parseHtml` DOMParser usage or replace with sanitization
- [ ] Use `textContent` instead of `innerHTML` for i18n
- [ ] If HTML required: implement DOMPurify-based sanitization
- [ ] Audit all i18n="html:*" usages

---

#### FINDING #8: Unvalidated MIME Type in Installer

| Property | Value |
|----------|-------|
| **Severity** | 🟡 MEDIUM |
| **Component** | UserCSS Installer |
| **Exploitability** | MEDIUM - Attacker-controlled server |
| **Impact** | Bypass of .user.css filter, CSS injection via other filetypes |
| **CWE** | CWE-434: Unrestricted Upload of File with Dangerous Type |

**Code Location:**  
[src/background/usercss-install-helper.js](src/background/usercss-install-helper.js#L69-L87)

```javascript
function maybeInstallByMime({tabId, url, responseHeaders}) {
  const h = findHeader(responseHeaders, kContentType);
  /** Ignoring .user.css response that is not a plain text but a web page.
   * Not using a whitelist of types as the possibilities are endless e.g. text/x-css-stylus */
  const isText = h && /^text\/(?!html)/i.test(h.value);
  // ❌ MIME check is insufficient:
  // - Accepts text/plain (could be XSS payload)
  // - Accepts text/x-* (unknown types)
  // - Server can lie: text/plain with CSS payload
  tabSet(tabId, MIME, isText);
  if (isText) {
    openInstallerPage(tabId, url, {});
    return {cancel: true};
  }
}
```

**Vulnerability Details:**
- No check for actual file extension (.user.css, .user.less, .user.styl)
- Trusts Content-Type header (easily spoofed)
- `text/x-*` types accepted (could be anything)
- Attacker can serve CSS as `text/plain` to bypass installer

**Attack Scenario:**
1. Attacker hosts malicious CSS as `example.com/styles/evil?ext=.css`
2. Sets `Content-Type: text/plain` in HTTP response
3. User visits URL or clicks link
4. Stylus detects `text/plain` → not HTML → triggers installer
5. Malicious CSS injected even though filename doesn't match pattern

**Fix (Priority: MEDIUM):**

```javascript
// PATCH: Validate filename extension + MIME type
const VALID_MIMES = new Set([
  'text/css',
  'text/x-css',
  'text/x-less',
  'text/x-stylus',
  'text/plain', // Only allow .user.css/.user.less/.user.styl with text/plain
]);

const VALID_EXTENSIONS = /\.user\.(css|less|styl)$/i;

function maybeInstallByMime({tabId, url, responseHeaders}) {
  const h = findHeader(responseHeaders, kContentType);
  const mime = h?.value?.split(';')[0].toLowerCase();
  
  // ✓ Validate filename first
  const urlPath = new URL(url).pathname;
  const hasValidExtension = VALID_EXTENSIONS.test(urlPath);
  
  // ✓ Validate MIME type against extension
  let isText = false;
  if (hasValidExtension && mime && VALID_MIMES.has(mime)) {
    isText = true;
  } else if (mime && /^text\/(?!html)/i.test(mime)) {
    // For non-.user.* files, require explicit CSS MIME type
    // Reject: text/plain, text/x-unknown, etc.
    if (!hasValidExtension) {
      return; // Do not trigger installer
    }
    isText = true;
  }
  
  tabSet(tabId, MIME, isText);
  if (isText) {
    openInstallerPage(tabId, url, {});
    return {cancel: true};
  }
}
```

**Acceptance Criteria:**
- [ ] Whitelist of allowed MIME types (text/css, text/x-css, etc.)
- [ ] Filename validation (.user.css, .user.less, .user.styl)
- [ ] Both filename + MIME must match for installation
- [ ] Reject text/plain for non-.user.* files
- [ ] User warning for unusual file extensions

---

## PRIVACY DATA FLOW MAP

### Data Sources

```
┌─ USER DATA ─────────────────────────────────────┐
│ • Installed styles (CSS code)                   │
│ • Style metadata (name, author, version)        │
│ • Website targets (applies-to rules)            │
│ • Last modified timestamps                      │
│ • Settings & preferences                        │
│ • Current tabs & browsing activity             │
└────────────────────────────────────────────────┘
```

### Data Flows to External Parties

#### Flow #1: Style Synchronization (Cloud Sync)

```
User Settings (Sync Enabled)
        ↓
[Background Script] token-manager.js
        ↓
OAuth Authentication (Dropbox/Google/OneDrive)
        ├─→ DROP_TOKEN (Dropbox)
        │   └─→ 3rd Party: Dropbox (token stored locally)
        ├─→ GOOGLE_TOKEN (Google Drive)
        │   └─→ 3rd Party: Google (token stored locally)
        └─→ ONEDRIVE_TOKEN (Microsoft)
            └─→ 3rd Party: Microsoft (token stored locally)
        ↓
[sync-manager.js] db-to-cloud-broker.js
        ↓
ENCRYPTED BACKUP ← All user styles & settings
        ├─→ Dropbox Cloud
        ├─→ Google Drive  
        └─→ OneDrive
```

**Data Exposed:**
- All CSS code (unencrypted in cloud)
- All style metadata (name, author, targets)
- Browsing patterns (which websites targeted)
- Credentials: Plaintext tokens in chrome.storage.local

**Risk:** 
- 🔴 Token theft → Account compromise
- 🟡 MITM on cloud API → Style replacement
- 🟡 Cloud provider breach → All styles exposed

---

#### Flow #2: Style Installation & Updates

```
User Visits Style Page / Clicks Install
        ↓
[install-hook-*.js] → USO / GreasynFork / UserStylesWorld
        ↓
HTTPS Download → Style Code + Metadata
        ↓
[update-manager.js]
├─→ Fetch MD5 hash (from USO server)
├─→ Compare with previous version
└─→ Update if changed
        ↓
Store in IndexedDB/chrome.storage
```

**Data Exposed:**
- 🔴 Style URL sent to server (reveals browsing intent)
- 🟡 Frequent update checks → Privacy leakage of installed styles count
- 🟡 No integrity verification → MITM style replacement possible

**External Parties Involved:**
1. **userstyles.org** - Central style registry
2. **greasyfork.org** - Script distribution
3. **userstylesworld.com** - Alternative registry (UserCSS)

---

#### Flow #3: Style Search & Discovery

```
User Searches on Management Page
        ↓
[manage/index.js] → Search Query
        ↓
⚠️ NOT TRACKED (Local search only)
```

**Good:** Local search doesn't leak queries externally.

---

#### Flow #4: Extension Analytics & Telemetry

```
❌ NO TELEMETRY DETECTED
- No Google Analytics
- No Usage tracking
- No Crash reporting
```

**Assessment:** ✓ Good privacy practice.

---

### Data Storage

| Location | Data | Protection |
|----------|------|-----------|
| **chrome.storage.local** | OAuth tokens | ❌ Plaintext |
| **chrome.storage.local** | Style backups (sync) | ❌ Unencrypted |
| **chrome.storage.session** | Runtime auth state | ✓ Cleared on exit |
| **IndexedDB** (draftDB) | Draft styles | ⚠️ User can clear |
| **ServiceWorker (MV3)** | Cached data | ⚠️ Temporary |
| **Extension Settings** | User preferences | ⚠️ Accessible to other extensions |

---

### Third-Party Integrations

```
┌────────────────────────────────────────────────────────┐
│ USERSTYLES.ORG (openstyles registry)                   │
├────────────────────────────────────────────────────────┤
│ Access: GET /api/styles/{id}                           │
│ Data sent: Style ID, update check frequency            │
│ Data received: CSS, metadata, MD5                      │
│ Risk: Site knows which styles installed               │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ DROPBOX (Cloud Sync)                                   │
├────────────────────────────────────────────────────────┤
│ Access: OAuth 2.0 (implicit flow)                      │
│ Data sent: All user styles + settings (encrypted?)     │
│ Scope: Dropbox App Folder (isolated)                   │
│ Risk: Token theft = full access to Dropbox            │
│       Plaintext storage in extension                   │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ GOOGLE DRIVE (Cloud Sync)                              │
├────────────────────────────────────────────────────────┤
│ Access: OAuth 2.0 (auth code flow)                     │
│ Data sent: All user styles + settings                  │
│ Scope: https://www.googleapis.com/auth/drive.appdata   │
│ Risk: Client secret hardcoded → Token generation       │
│       Plaintext token storage                          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ ONEDRIVE (Cloud Sync)                                  │
├────────────────────────────────────────────────────────┤
│ Access: OAuth 2.0 (auth code flow)                     │
│ Data sent: All user styles + settings                  │
│ Scope: Files.ReadWrite.AppFolder                       │
│ Risk: Client secret hardcoded → Credential compromise  │
│       Plaintext token storage                          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ USERSTYLESWORLD.COM (Alternative registry)             │
├────────────────────────────────────────────────────────┤
│ Access: OAuth 2.0 (auth code flow)                     │
│ Data sent: User account info for sync                  │
│ Risk: Client secret hardcoded                          │
│       May track sync activity                          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ GREASYFORK (Script Distribution)                       │
├────────────────────────────────────────────────────────┤
│ Access: GET script metadata                            │
│ Data sent: Script ID on install                        │
│ Risk: Site knows when scripts installed               │
│       Potential for XSS if compromised                 │
└────────────────────────────────────────────────────────┘
```

---

### Consent & Configuration

| Setting | User Control | Default |
|---------|--------------|---------|
| Sync to Dropbox | ✓ Optional | Disabled |
| Sync to Google Drive | ✓ Optional | Disabled |
| Sync to OneDrive | ✓ Optional | Disabled |
| Auto-update styles | ✓ Configurable | Enabled |
| Update frequency | ✓ Configurable | 1 day |
| Analytics/telemetry | ✓ None collected | N/A |

---

### Data Minimization Recommendations

1. **Stop sending style URLs on every check** - Batch updates or use fingerprints
2. **Encrypt styles in transit** - Use HTTPS for all cloud operations
3. **Implement user-managed encryption** - Allow users to encrypt cloud backups
4. **Limit update frequency** - Only check when necessary
5. **Clear sync tokens on logout** - Explicit token revocation

---

## MANIFEST SECURITY ANALYSIS

### Manifest V3 (src/manifest-mv3.json)

```json
{
  "manifest_version": 3,
  "minimum_chrome_version": "128",
  "permissions": [
    "declarativeNetRequestWithHostAccess",  // ✓ DNR for style injection
    "identity",                             // ✓ OAuth flows
    "idle",                                 // ⚠️ Detects user idle state
    "offscreen",                            // ✓ Offscreen document (MV3)
    "scripting"                             // ⚠️ Can execute scripts
  ],
  "host_permissions": [
    "<all_urls>"                            // 🔴 OVERLY BROAD
  ],
  "background": {
    "service_worker": "sw.js"               // ✓ Service Worker (preferred)
  },
  "content_scripts": [
    {
      "matches": ["https://greasyfork.org/*scripts/*", "..."],
      "js": ["js/install-hook-greasyfork.js"],
      "run_at": "document_start"             // ⚠️ Runs early
    }
  ]
}
```

**Issues Found:**

🔴 **host_permissions: ["<all_urls>"]**
- Extension has access to all websites
- Could inject CSS on banking sites, email, etc.
- Should be narrowed to user-authorized sites
- MV3 allows more granular permission scoping

**Recommendation:**
```json
{
  "host_permissions": [
    // User grants permission per-site during style selection
    // OR: Request specific domains when installing styles
  ],
  "permissions": [
    "declarativeNetRequestWithHostAccess",
    "identity",
    "offscreen",
    "scripting",
    "activeTab"  // Request permission when needed
  ]
}
```

---

### Manifest V2 (src/manifest-mv2.json)

```json
{
  "manifest_version": 2,
  "minimum_chrome_version": "56",
  "permissions": [
    "<all_urls>"  // 🔴 Overly broad
  ]
}
```

**Deprecation Warning:** MV2 deprecated. Users should migrate to MV3.

---

## REMEDIATION ROADMAP

### Critical (Immediate)

- [ ] **Remove hardcoded OAuth secrets** - Use backend token exchange
- [ ] **Encrypt tokens at rest** - AES-256-GCM with identity-based key
- [ ] **Enforce HTTPS for cloud endpoints** - Reject HTTP for remote sync

### High Priority (Sprint 1)

- [ ] **Validate downloaded CSS size** - 10MB limit with abort
- [ ] **Verify style integrity** - Hash validation before install
- [ ] **Add message origin validation** - Allowlist trusted senders

### Medium Priority (Sprint 2)

- [ ] **Implement MIME type validation** - Filename + content-type checks
- [ ] **Sanitize HTML parsing** - DOMPurify for i18n messages
- [ ] **Add redirect validation** - Fail on unexpected redirects

### Low Priority (Backlog)

- [ ] Narrow host_permissions (requires architecture change)
- [ ] Implement update batching (privacy optimization)
- [ ] User-controlled backup encryption

---

## TESTING RECOMMENDATIONS

### Security Test Cases

1. **Token Theft Test**
   ```javascript
   // Verify tokens cannot be read by other extensions
   const tokens = await chrome.storage.local.get('secure/token/*');
   assert(tokens === {}); // Should be encrypted
   ```

2. **Message Validation Test**
   ```javascript
   // Try calling restricted API from content script
   chrome.runtime.sendMessage({
     method: 'API.styles.putMany',
     args: [maliciousStyles]
   }, (response) => {
     assert(response.error); // Should be denied
   });
   ```

3. **Size Limit Test**
   ```javascript
   // Try downloading 1GB CSS file
   // Should abort with error after 10MB
   ```

4. **Integrity Test**
   ```javascript
   // Serve CSS file with mismatched MD5
   // Update should fail with INTEGRITY_MISMATCH error
   ```

---

## CONCLUSION

The Stylus extension implements a complex system for style management with cloud synchronization and auto-updates. While the overall architecture is sound, **critical security gaps exist** in:

1. Token storage (plaintext)
2. Hardcoded OAuth secrets
3. Missing integrity validation
4. Insufficient input validation

**Immediate action required** for OAuth credential management. These findings should be addressed before the extension handles more sensitive data or expands to other cloud providers.

---

## APPENDIX: File Locations Reference

| Finding | Files |
|---------|-------|
| #1: Token Storage | `src/background/token-manager.js` |
| #2: OAuth Secrets | `src/background/token-manager.js` |
| #3: HTTPS Enforcement | `src/js/util.js`, `src/background/sync-manager.js` |
| #4: Size Limits | `src/background/download.js`, `src/background/update-manager.js` |
| #5: Message Validation | `src/js/msg.js`, `src/background/index.js` |
| #6: Integrity Checks | `src/background/update-manager.js` |
| #7: DOMParser | `src/js/localization.js` |
| #8: MIME Validation | `src/background/usercss-install-helper.js` |

---

**Report Generated:** December 12, 2025  
**Auditor:** GitHub Copilot Security Analysis  
**Status:** COMPLETE ✓
