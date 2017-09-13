/* global semverCompare makeLink */

'use strict';

let pendingResource;

function install(style) {
  const request = Object.assign(style, {
    method: 'saveUsercss',
    reason: 'install',
    updateUrl: location.href
  });
  return runtimeSend(request)
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

function runtimeSend(request) {
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
    result.push(chrome.i18n.getMessage('appliesToEverything'));
  }
  return result;
}

function initInstallPage({style, dup}, sourceLoader) {
  return pendingResource.then(() => {
    const versionTest = dup && semverCompare(style.version, dup.version);
    document.body.textContent = '';
    document.body.appendChild(buildPage());

    if (versionTest < 0) {
      $('.actions').parentNode.insertBefore(
        $element({className: 'warning', textContent: t('versionInvalidOlder')}),
        $('.actions')
      );
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

    function buildPage() {
      return $element({className: 'container', appendChild: [
        $element({className: 'header', appendChild: [
          $element({tag: 'h1', appendChild: [
            style.name,
            $element({tag: 'small', className: 'meta-version', textContent: style.version})
          ]}),
          $element({tag: 'p', textContent: style.description}),
          $element({tag: 'h3', textContent: t('author')}),
          style.author,
          $element({tag: 'h3', textContent: t('license')}),
          style.license,
          $element({tag: 'h3', textContent: t('appliesLabel')}),
          $element({tag: 'ul', appendChild: getAppliesTo(style).map(
            pattern => $element({tag: 'li', textContent: pattern})
          )}),
          $element({className: 'actions', appendChild: [
            $element({tag: 'button', className: 'install', textContent: installButtonLabel()})
          ]}),
          $element({className: 'external', appendChild: [
            style.url && makeLink(style.url, t('externalHomepage')),
            style.support && makeLink(style.support, t('externalSupport'))
          ]})
        ]}),
        $element({className: 'main', appendChild: [
          $element({className: 'code'})
        ]})
      ]});
    }

    function installButtonLabel() {
      return t(!dup ? 'installButton' :
        versionTest > 0 ? 'installButtonUpdate' : 'installButtonReinstall');
    }
  });
}

function initLiveReload(sourceLoader) {
  let installed;
  const watcher = sourceLoader.watch(source => {
    $('.code').textContent = source;
    return runtimeSend({
      method: 'saveUsercss',
      id: installed.id,
      source: source
    }).then(() => {
      $$('.main .warning').forEach(e => e.remove());
    }).catch(err => {
      const oldWarning = $('.main .warning');
      const warning = buildWarning(err);
      if (oldWarning) {
        oldWarning.replaceWith(warning);
      } else {
        $('.main').insertBefore(warning, $('.main').childNodes[0]);
      }
    });
  });
  window.addEventListener('installed', ({detail: {style}}) => {
    installed = style;
    if ($('.live-reload-checkbox').checked) {
      watcher.start();
    }
  });
  $('.actions').appendChild($element({tag: 'label', className: 'live-reload', appendChild: [
    $element({tag: 'input', type: 'checkbox', className: 'live-reload-checkbox'}),
    $element({tag: 'span', textContent: t('liveReloadLabel')})
  ]}));
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

function buildWarning(err) {
  return $element({className: 'warning', appendChild: [
    t('parseUsercssError'),
    $element({tag: 'pre', textContent: String(err)})
  ]});
}

function initErrorPage(err, source) {
  return pendingResource.then(() => {
    document.body.textContent = '';
    [
      buildWarning(err),
      $element({className: 'code'})
    ].forEach(e => document.body.appendChild(e));
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
  pendingResource = runtimeSend({
    method: 'injectContent',
    files: [
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
      runtimeSend({
        method: 'filterUsercss',
        source: sourceLoader.source(),
        checkDup: true
      })
    )
    .then(result => initInstallPage(result, sourceLoader))
    .catch(err => initErrorPage(err, sourceLoader.source()));
}

function isUsercss() {
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
