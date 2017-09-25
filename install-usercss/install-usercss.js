/* global CodeMirror semverCompare makeLink closeCurrentTab */

'use strict';

(function () {
  const params = getParams();

  const port = chrome.tabs.connect(
    Number(params.tabId),
    {name: 'usercss-install', frameId: 0}
  );
  port.postMessage({method: 'getSourceCode'});
  port.onMessage.addListener(msg => {
    switch (msg.method) {
      case 'getSourceCodeResponse':
        if (msg.error) {
          alert(msg.error);
        } else {
          initSourceCode(msg.sourceCode);
        }
        break;
    }
  });
  port.onDisconnect.addListener(closeCurrentTab);

  const cm = CodeMirror.fromTextArea($('.code textarea'), {readOnly: true});

  function runtimeSend(request) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        request,
        ({status, result}) => (status === 'error' ? reject : resolve)(result)
      );
    });
  }

  function install(style) {
    const request = Object.assign(style, {
      method: 'saveUsercss',
      reason: 'update'
    });
    return runtimeSend(request)
      .then(result => {
        $$('.warning')
          .forEach(el => el.remove());
        $('.install').textContent = 'Installed';
        $('.install').disabled = true;
        $('.install').classList.add('installed');
        $('.set-update-url input[type=checkbox]').disabled = true;
        $('.set-update-url').title = result.updateUrl ?
          t('installUpdateFrom', result.updateUrl) : '';
        window.dispatchEvent(new CustomEvent('installed', {detail: result}));
      })
      .catch(err => {
        alert(chrome.i18n.getMessage('styleInstallFailed', String(err)));
      });
  }

  function initSourceCode(sourceCode) {
    cm.setValue(sourceCode);
    runtimeSend({
      method: 'buildUsercss',
      sourceCode,
      checkDup: true
    }).then(init, initError);
  }

  function initError(err) {
    $('.main').insertBefore(buildWarning(err), $('.main').childNodes[0]);
  }

  function buildWarning(err) {
    return $element({className: 'warning', appendChild: [
      t('parseUsercssError'),
      $element({tag: 'pre', textContent: String(err)})
    ]});
  }

  function init({style, dup}) {
    const data = style.usercssData;
    const dupData = dup && dup.usercssData;
    const versionTest = dup && semverCompare(data.version, dupData.version);

    // update UI
    if (versionTest < 0) {
      $('.actions').parentNode.insertBefore(
        $element({className: 'warning', textContent: t('versionInvalidOlder')}),
        $('.actions')
      );
    }
    $('button.install').onclick = () => {
      if (dup) {
        if (confirm(chrome.i18n.getMessage('styleInstallOverwrite', [
          data.name, dupData.version, data.version
        ]))) {
          install(style);
        }
      } else if (confirm(chrome.i18n.getMessage('styleInstall', [data.name]))) {
        install(style);
      }
    };

    // set updateUrl
    const setUpdate = $('.set-update-url input[type=checkbox]');
    const updateUrl = new URL(params.updateUrl);
    $('.set-update-url > span').textContent = t('installUpdateFromLabel', updateUrl.href);
    if (dup && dup.updateUrl === updateUrl.href) {
      setUpdate.checked = true;
      // there is no way to "unset" updateUrl, you can only overwrite it.
      setUpdate.disabled = true;
    } else if (!dup && updateUrl.protocol !== 'file:') {
      setUpdate.checked = true;
      style.updateUrl = updateUrl.href;
    }
    setUpdate.onchange = e => {
      if (e.target.checked) {
        style.updateUrl = updateUrl.href;
      } else {
        delete style.updateUrl;
      }
    };

    // update editor
    cm.setPreprocessor(data.preprocessor);

    // update metas
    document.title = `${installButtonLabel()} ${data.name}`;

    $('.install').textContent = installButtonLabel();
    $('.set-update-url').title = dup && dup.updateUrl && t('installUpdateFrom', dup.updateUrl) || '';
    $('.meta-name').textContent = data.name;
    $('.meta-version').textContent = data.version;
    $('.meta-description').textContent = data.description;

    if (data.author) {
      $('.meta-author').textContent = data.author;
    } else {
      $('.meta-author').parentNode.remove();
    }
    if (data.license) {
      $('.meta-license').textContent = data.license;
    } else {
      $('.meta-license').parentNode.remove();
    }

    getAppliesTo(style).forEach(pattern =>
      $('.applies-to').appendChild($element({tag: 'li', textContent: pattern}))
    );

    const externalLink = makeExternalLink();
    if (externalLink) {
      $('.external-link').appendChild(externalLink);
    }

    function makeExternalLink() {
      const urls = [];
      if (data.homepageURL) {
        urls.push([data.homepageURL, t('externalHomepage')]);
      }
      if (data.supportURL) {
        urls.push([data.supportURL, t('externalSupport')]);
      }
      if (urls.length) {
        return $element({appendChild: [
          $element({tag: 'h3', textContent: t('externalLink')}),
          $element({tag: 'ul', appendChild: urls.map(args =>
            $element({tag: 'li', appendChild: makeLink(...args)})
          )})
        ]});
      }
    }

    function installButtonLabel() {
      return t(!dup ? 'installButton' :
        versionTest > 0 ? 'installButtonUpdate' : 'installButtonReinstall');
    }
  }

  function getParams() {
    // URL.searchParams needs chrome 51+
    const {search} = location;
    const result = {};
    for (const param of search.slice(1).split('&')) {
      let key, value;
      if (param.includes('=')) {
        [key, value] = param.split('=').map(decodeURIComponent);
      } else {
        key = decodeURIComponent(param);
        value = true;
      }
      result[key] = value;
    }
    return result;
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
})();
