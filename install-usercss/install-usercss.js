/* global CodeMirror semverCompare closeCurrentTab messageBox download
  $ $$ $create $createLink t prefs API */
'use strict';

(() => {
  // TODO: remove .replace(/^\?/, '') when minimum_chrome_version >= 52 (https://crbug.com/601425)
  const params = new URLSearchParams(location.search.replace(/^\?/, ''));
  const tabId = params.has('tabId') ? Number(params.get('tabId')) : -1;
  const initialUrl = params.get('updateUrl');

  let installed = null;
  let installedDup = null;

  const liveReload = initLiveReload();
  liveReload.ready.then(initSourceCode, error => messageBox.alert(error, 'pre'));

  const theme = prefs.get('editor.theme');
  const cm = CodeMirror($('.main'), {
    readOnly: true,
    colorpicker: true,
    theme,
  });
  if (theme !== 'default') {
    document.head.appendChild($create('link', {
      rel: 'stylesheet',
      href: `vendor/codemirror/theme/${theme}.css`
    }));
  }
  window.addEventListener('resize', adjustCodeHeight);
  // "History back" in Firefox (for now) restores the old DOM including the messagebox,
  // which stays after installing since we don't want to wait for the fadeout animation before resolving.
  document.addEventListener('visibilitychange', () => {
    if (messageBox.element) messageBox.element.remove();
    if (installed) liveReload.onToggled();
  });

  setTimeout(() => {
    if (!installed) {
      $('#header').appendChild($create('.lds-spinner',
        new Array(12).fill($create('div')).map(e => e.cloneNode())));
    }
  }, 200);


  function updateMeta(style, dup = installedDup) {
    installedDup = dup;
    const data = style.usercssData;
    const dupData = dup && dup.usercssData;
    const versionTest = dup && semverCompare(data.version, dupData.version);

    cm.setPreprocessor(data.preprocessor);

    const installButtonLabel = t(
      installed ? 'installButtonInstalled' :
      !dup ? 'installButton' :
      versionTest > 0 ? 'installButtonUpdate' : 'installButtonReinstall'
    );
    document.title = `${installButtonLabel} ${data.name}`;

    $('.install').textContent = installButtonLabel;
    $('.install').classList.add(
      installed ? 'installed' :
      !dup ? 'install' :
      versionTest > 0 ? 'update' :
      'reinstall');
    $('.set-update-url').title = dup && dup.updateUrl && t('installUpdateFrom', dup.updateUrl) || '';
    $('.meta-name').textContent = data.name;
    $('.meta-version').textContent = data.version;
    $('.meta-description').textContent = data.description;

    if (data.author) {
      $('.meta-author').parentNode.style.display = '';
      $('.meta-author').textContent = '';
      $('.meta-author').appendChild(makeAuthor(data.author));
    } else {
      $('.meta-author').parentNode.style.display = 'none';
    }

    $('.meta-license').parentNode.style.display = data.license ? '' : 'none';
    $('.meta-license').textContent = data.license;

    $('.applies-to').textContent = '';
    getAppliesTo(style).forEach(pattern =>
      $('.applies-to').appendChild($create('li', pattern)));

    $('.external-link').textContent = '';
    const externalLink = makeExternalLink();
    if (externalLink) {
      $('.external-link').appendChild(externalLink);
    }

    $('#header').classList.add('meta-init');
    $('#header').classList.remove('meta-init-error');
    setTimeout(() => $.remove('.lds-spinner'), 1000);

    showError('');
    requestAnimationFrame(adjustCodeHeight);

    function makeAuthor(text) {
      const match = text.match(/^(.+?)(?:\s+<(.+?)>)?(?:\s+\((.+?)\))?$/);
      if (!match) {
        return document.createTextNode(text);
      }
      const [, name, email, url] = match;
      const frag = document.createDocumentFragment();
      if (email) {
        frag.appendChild($createLink(`mailto:${email}`, name));
      } else {
        frag.appendChild($create('span', name));
      }
      if (url) {
        frag.appendChild($createLink(url,
          $create('SVG:svg.svg-icon', {viewBox: '0 0 20 20'},
            $create('SVG:path', {
              d: 'M4,4h5v2H6v8h8v-3h2v5H4V4z M11,3h6v6l-2-2l-4,4L9,9l4-4L11,3z'
            }))
        ));
      }
      return frag;
    }

    function makeExternalLink() {
      const urls = [
        data.homepageURL && [data.homepageURL, t('externalHomepage')],
        data.supportURL && [data.supportURL, t('externalSupport')],
      ];
      return (data.homepageURL || data.supportURL) && (
        $create('div', [
          $create('h3', t('externalLink')),
          $create('ul', urls.map(args => args &&
            $create('li',
              $createLink(...args)
            )
          ))
        ]));
    }
  }

  function showError(err) {
    $('.warnings').textContent = '';
    if (err) {
      $('.warnings').appendChild(buildWarning(err));
    }
    $('.warnings').classList.toggle('visible', Boolean(err));
    $('.container').classList.toggle('has-warnings', Boolean(err));
    adjustCodeHeight();
  }

  function install(style) {
    installed = style;

    $$.remove('.warning');
    $('button.install').disabled = true;
    $('button.install').classList.add('installed');
    $('#live-reload-install-hint').classList.toggle('hidden', !liveReload.enabled);
    $('h2.installed').classList.add('active');
    $('.set-update-url input[type=checkbox]').disabled = true;
    $('.set-update-url').title = style.updateUrl ?
      t('installUpdateFrom', style.updateUrl) : '';

    updateMeta(style);

    if (!liveReload.enabled && !prefs.get('openEditInWindow')) {
      location.href = '/edit.html?id=' + style.id;
    } else {
      API.openEditor({id: style.id});
      if (!liveReload.enabled) {
        if (tabId < 0 && history.length > 1) {
          history.back();
        } else {
          closeCurrentTab();
        }
      }
    }
  }

  function initSourceCode(sourceCode) {
    cm.setValue(sourceCode);
    cm.refresh();
    API.buildUsercss({sourceCode, checkDup: true})
      .then(init)
      .catch(err => {
        $('#header').classList.add('meta-init-error');
        console.error(err);
        showError(err);
      });
  }

  function buildWarning(err) {
    const contents = Array.isArray(err) ?
      [$create('pre', err.join('\n'))] :
      [err && err.message && $create('pre', err.message) || err || 'Unknown error'];
    if (Number.isInteger(err.index) && typeof contents[0] === 'string') {
      const pos = cm.posFromIndex(err.index);
      contents[0] = `${pos.line + 1}:${pos.ch + 1} ` + contents[0];
      contents.push($create('pre', drawLinePointer(pos)));
      setTimeout(() => {
        cm.scrollIntoView({line: pos.line + 1, ch: pos.ch}, window.innerHeight / 4);
        cm.setCursor(pos.line, pos.ch + 1);
        cm.focus();
      });
    }
    return $create('.warning', [
      t('parseUsercssError'),
      '\n',
      ...contents,
    ]);
  }

  function drawLinePointer(pos) {
    const SIZE = 60;
    const line = cm.getLine(pos.line);
    const numTabs = pos.ch + 1 - line.slice(0, pos.ch + 1).replace(/\t/g, '').length;
    const pointer = ' '.repeat(pos.ch) + '^';
    const start = Math.max(Math.min(pos.ch - SIZE / 2, line.length - SIZE), 0);
    const end = Math.min(Math.max(pos.ch + SIZE / 2, SIZE), line.length);
    const leftPad = start !== 0 ? '...' : '';
    const rightPad = end !== line.length ? '...' : '';
    return (
      leftPad +
      line.slice(start, end).replace(/\t/g, ' '.repeat(cm.options.tabSize)) +
      rightPad +
      '\n' +
      ' '.repeat(leftPad.length + numTabs * cm.options.tabSize) +
      pointer.slice(start, end)
    );
  }

  function init({style, dup}) {
    const data = style.usercssData;
    const dupData = dup && dup.usercssData;
    const versionTest = dup && semverCompare(data.version, dupData.version);

    updateMeta(style, dup);

    // update UI
    if (versionTest < 0) {
      $('.actions').parentNode.insertBefore(
        $create('.warning', t('versionInvalidOlder')),
        $('.actions')
      );
    }
    $('button.install').onclick = () => {
      (!dup ?
        Promise.resolve(true) :
        messageBox.confirm(t('styleInstallOverwrite', [
          data.name,
          dupData.version,
          data.version,
        ]))
      ).then(ok => ok &&
        API.installUsercss(style)
          .then(install)
          .catch(err => messageBox.alert(t('styleInstallFailed', err), 'pre'))
      );
    };

    // set updateUrl
    const checker = $('.set-update-url input[type=checkbox]');
    const updateUrl = new URL(style.updateUrl || initialUrl);
    if (dup && dup.updateUrl === updateUrl.href) {
      checker.checked = true;
      // there is no way to "unset" updateUrl, you can only overwrite it.
      checker.disabled = true;
    } else if (updateUrl.protocol !== 'file:') {
      checker.checked = true;
      style.updateUrl = updateUrl.href;
    }
    checker.onchange = () => {
      style.updateUrl = checker.checked ? updateUrl.href : null;
    };
    checker.onchange();
    $('.set-update-url p').textContent = updateUrl.href.length < 300 ? updateUrl.href :
      updateUrl.href.slice(0, 300) + '...';

    if (initialUrl.startsWith('file:')) {
      $('.live-reload input').onchange = liveReload.onToggled;
    } else {
      $('.live-reload').remove();
    }
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

  function adjustCodeHeight() {
    // Chrome-only bug (apparently): it doesn't limit the scroller element height
    const scroller = cm.display.scroller;
    const prevWindowHeight = adjustCodeHeight.prevWindowHeight;
    if (scroller.scrollHeight === scroller.clientHeight ||
        prevWindowHeight && window.innerHeight !== prevWindowHeight) {
      adjustCodeHeight.prevWindowHeight = window.innerHeight;
      cm.setSize(null, $('.main').offsetHeight - $('.warnings').offsetHeight);
    }
  }

  function initLiveReload() {
    const DELAY = 500;
    let isEnabled = false;
    let timer = 0;
    /** @type function(?options):Promise<string|null> */
    let getData = null;
    /** @type Promise */
    let sequence = null;
    if (tabId < 0) {
      getData = DirectDownloader();
      sequence = API.getUsercssInstallCode(initialUrl).catch(getData);
    } else {
      getData = PortDownloader();
      sequence = getData({timer: false});
    }
    return {
      get enabled() {
        return isEnabled;
      },
      ready: sequence,
      onToggled(e) {
        if (e) isEnabled = e.target.checked;
        if (installed || installedDup) {
          (isEnabled ? start : stop)();
          $('.install').disabled = isEnabled;
          Object.assign($('#live-reload-install-hint'), {
            hidden: !isEnabled,
            textContent: t(`liveReloadInstallHint${tabId >= 0 ? 'FF' : ''}`),
          });
        }
      },
    };
    function check() {
      getData()
        .then(update, logError)
        .then(() => {
          timer = 0;
          start();
        });
    }
    function logError(error) {
      console.warn(t('liveReloadError', error));
    }
    function start() {
      timer = timer || setTimeout(check, DELAY);
    }
    function stop() {
      clearTimeout(timer);
      timer = 0;
    }
    function update(code) {
      if (code == null) return;
      sequence = sequence.catch(console.error).then(() => {
        const {id} = installed || installedDup;
        const scrollInfo = cm.getScrollInfo();
        const cursor = cm.getCursor();
        cm.setValue(code);
        cm.setCursor(cursor);
        cm.scrollTo(scrollInfo.left, scrollInfo.top);
        return API.installUsercss({id, sourceCode: code})
          .then(updateMeta)
          .catch(showError);
      });
    }
    function DirectDownloader() {
      let oldCode = null;
      const passChangedCode = code => {
        const isSame = code === oldCode;
        oldCode = code;
        return isSame ? null : code;
      };
      return () => download(initialUrl).then(passChangedCode);
    }
    function PortDownloader() {
      const resolvers = new Map();
      const port = chrome.tabs.connect(tabId, {name: 'downloadSelf'});
      port.onMessage.addListener(({id, code, error}) => {
        const r = resolvers.get(id);
        resolvers.delete(id);
        if (error) {
          r.reject(error);
        } else {
          r.resolve(code);
        }
      });
      port.onDisconnect.addListener(() => {
        chrome.tabs.get(tabId, tab => {
          if (chrome.runtime.lastError) {
            closeCurrentTab();
          } else if (tab.url === initialUrl) {
            location.reload();
          }
        });
      });
      return ({timer = true} = {}) => new Promise((resolve, reject) => {
        const id = performance.now();
        resolvers.set(id, {resolve, reject});
        port.postMessage({id, timer});
      });
    }
  }
})();
