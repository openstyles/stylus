/* global semverCompare */

'use strict';

let pendingResource;

function install(style) {
  const request = Object.assign(style, {
    method: 'saveUsercss',
    reason: 'install',
    updateUrl: location.href
  });
  return communicate(request)
    .then(result => {
      $$('.warning')
        .forEach(el => el.remove());
      $('button.install').textContent = 'Installed';
      $('button.install').disabled = true;
      window.dispatchEvent(new CustomEvent('installed', {detail: result}));
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

function initInstallPage({style, dup}, sourceLoader) {
  return pendingResource.then(() => {
    const versionTest = dup && semverCompare(style.version, dup.version);
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
        <div class="main">
          <div class="code"></div>
        </div>
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

    if (location.protocol === 'file:') {
      initLiveReload(sourceLoader);
    }
  });
}

function initLiveReload(sourceLoader) {
  let installed;
  const watcher = sourceLoader.watch(source => {
    $('.code').textContent = source;
    return communicate({
      method: 'saveUsercss',
      id: installed.id,
      source: source
    }).then(() => {
      $$('.main .warning').forEach(e => e.remove());
    }).catch(err => {
      const oldWarning = $('.main .warning');
      // FIXME: i18n
      const warning = tHTML(`
        <div class="warning">
          Stylus failed to parse usercss:
          <pre>${err}</pre>
        </div>
      `);
      if (oldWarning) {
        oldWarning.replaceWith(warning);
      } else {
        $('.main').prepend(warning);
      }
    });
  });
  window.addEventListener('installed', ({detail: {style}}) => {
    installed = style;
    if ($('.live-reload-checkbox').checked) {
      watcher.start();
    }
  });
  // FIXME: i18n
  $('.actions').append(tHTML(`
    <label class="live-reload">
      <input type="checkbox" class="live-reload-checkbox">
      <span>Live reload</span>
    </label>
  `));
  $('.live-reload-checkbox').onchange = e => {
    if (!installed) {
      return;
    }
    if (e.target.checked) {
      watcher.start();
    } else {
      watcher.stop();
    }
  };
}

function initErrorPage(err, source) {
  return pendingResource.then(() => {
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

function createSourceLoader() {
  let source;

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

  function load() {
    return fetchText(location.href)
      .then(_source => {
        source = _source;
        return source;
      });
  }

  function watch(cb) {
    let timer;
    const DELAY = 1000;

    function start() {
      if (timer) {
        return;
      }
      timer = setTimeout(check, DELAY);
    }

    function stop() {
      clearTimeout(timer);
      timer = null;
    }

    function check() {
      fetchText(location.href)
        .then(_source => {
          if (source !== _source) {
            source = _source;
            return cb(source);
          }
        })
        .catch(console.log)
        .then(() => {
          timer = setTimeout(check, DELAY);
        });
    }

    return {start, stop};
  }

  return {load, watch, source: () => source};
}

function initUsercssInstall() {
  pendingResource = communicate({
    method: 'injectResource',
    resources: [
      '/js/dom.js',
      '/js/localization.js',
      '/js/usercss.js',
      '/vendor/node-semver/semver.js',
      '/content/install-user-css.css'
    ]
  });

  const sourceLoader = createSourceLoader();
  sourceLoader.load()
    .then(() =>
      communicate({
        method: 'filterUsercss',
        source: sourceLoader.source(),
        checkDup: true
      })
    )
    .then(result => initInstallPage(result, sourceLoader))
    .catch(err => initErrorPage(err, sourceLoader.source()));
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
