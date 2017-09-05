/* global usercss */

'use strict';

let pendingResource;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    // you can't use fetch in Chrome under 'file:' protocol
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.addEventListener('load', () => resolve(xhr.responseText));
    xhr.addEventListener('error', () => reject(xhr));
    xhr.send();
  });
}

function install(style) {
  const request = Object.assign(style, {
    method: 'saveUsercss',
    reason: 'install',
    url: location.href,
    updateUrl: location.href
  });
  return communicate(request)
    .then(() => {
      $$('.warning')
        .forEach(el => el.remove());
      $('button.install').textContent = 'Installed';
      $('button.install').disabled = true;
    })
    .catch(err => {
      alert(chrome.i18n.getMessage('styleInstallFailed', String(err)));
    });
}

function communicate(request) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, result => {
      if (result.status === 'error') {
        reject(result.error);
      } else {
        resolve(result);
      }
    });
  });
}

function getAppliesTo(style) {
  function *_gen() {
    for (const section of style.sections) {
      for (const type of ['urls', 'urlPrefixes', 'domains', 'regexps']) {
        if (section[type]) {
          yield *section[type];
        }
      }
    }
  }
  const result = [..._gen()];
  if (!result.length) {
    result.push('All URLs');
  }
  return result;
}

function initInstallPage({style, dup}) {
  pendingResource.then(() => {
    const versionTest = dup && usercss.semverTest(style.version, dup.version);
    document.body.innerHTML = '';
    // FIXME: i18n
    document.body.appendChild(tHTML(`
      <div class="container">
        <div class="header">
          <h1>${style.name} <small class="meta-version">v${style.version}</small></h1>
          <p>${style.description}</p>
          <h3>Author</h3>
          ${style.author}
          <h3>License</h3>
          ${style.license}
          <h3>Applies to</h3>
          <ul>
            ${getAppliesTo(style).map(s => `<li>${s}</li>`)}
          </ul>
          <div class="actions">
            <button class="install">${!dup ? 'Install' : versionTest > 0 ? 'Update' : 'Reinstall'}</button>
          </div>
          <div class="external">
            <a href="${style.url}" target="_blank">Homepage</a>
            <a href="${style.supportURL}" target="_blank">Support</a>
          </div>
        </div>
        <div class="code"></div>
      </div>
    `));
    if (versionTest < 0) {
      // FIXME: i18n
      $('.actions').before(tHTML(`
        <div class="warning">
          The version is older then installed style.
        </div>
      `));
    }
    $('.code').textContent = style.source;
    $('button.install').onclick = () => {
      if (dup) {
        if (confirm(chrome.i18n.getMessage('styleInstallOverwrite', [style.name, dup.version, style.version]))) {
          install(style);
        }
      } else if (confirm(chrome.i18n.getMessage('styleInstall', [style.name]))) {
        install(style);
      }
    };
  });
}

function initErrorPage(err, source) {
  pendingResource.then(() => {
    document.body.innerHTML = '';
    // FIXME: i18n
    document.body.appendChild(tHTML(`
      <div class="warning">
        Stylus failed to parse usercss:
        <pre>${err}</pre>
      </div>
      <div class="code"></div>
    `));
    $('.code').textContent = source;
  });
}

function initUsercssInstall() {
  let source;
  pendingResource = communicate({
    method: 'injectResource',
    resources: [
      '/js/dom.js',
      '/js/localization.js',
      '/js/usercss.js',
      '/content/install-user-css.css'
    ]
  });
  fetchText(location.href)
    .then(_source => {
      source = _source;
      return communicate({
        method: 'filterUsercss',
        source,
        checkDup: true
      });
    })
    .then(initInstallPage)
    .catch(err => initErrorPage(err, source));
}

function isUsercss() {
  if (!/\.user\.(css|styl|less|scss|sass)$/i.test(location.pathname)) {
    return false;
  }
  if (!/text\/(css|plain)/.test(document.contentType)) {
    return false;
  }
  if (!/==userstyle==/i.test(document.body.textContent)) {
    return false;
  }
  return true;
}

if (isUsercss()) {
  initUsercssInstall();
}
