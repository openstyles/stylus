/* global $ $create $createLink $$remove showSpinner */// dom.js
/* global API */// msg.js
/* global closeCurrentTab deepEqual */// toolbox.js
/* global messageBox */
/* global prefs */
/* global preinit */
/* global t */// localization.js
'use strict';

let cm;
let initialUrl;
let installed;
let installedDup;
let liveReload;
let tabId;
let vars;

// "History back" in Firefox (for now) restores the old DOM including the messagebox,
// which stays after installing since we don't want to wait for the fadeout animation before resolving.
document.on('visibilitychange', () => {
  $$remove('#message-box:not(.config-dialog)');
  if (installed) liveReload.onToggled();
});

setTimeout(() => !cm && showSpinner($('#header')), 200);

/*
 * Preinit starts to download as early as possible,
 * then the critical rendering path scripts are loaded in html,
 * then the meta of the downloaded code is parsed in the background worker,
 * then CodeMirror scripts/css are added so they can load while the worker runs in parallel,
 * then the meta response arrives from API and is immediately displayed in CodeMirror,
 * then the sections of code are parsed in the background worker and displayed.
 */
(async function init() {
  const theme = prefs.get('editor.theme');
  if (theme !== 'default') {
    require([`/vendor/codemirror/theme/${theme}.css`]); // not awaiting as it may be absent
  }
  const scriptsReady = require([
    '/vendor/codemirror/lib/codemirror', /* global CodeMirror */
  ]).then(() => require([
    '/vendor/codemirror/keymap/sublime',
    '/vendor/codemirror/keymap/emacs',
    '/vendor/codemirror/keymap/vim', // TODO: load conditionally
    '/vendor/codemirror/mode/css/css',
    '/vendor/codemirror/addon/search/searchcursor',
    '/vendor/codemirror/addon/fold/foldcode',
    '/vendor/codemirror/addon/fold/foldgutter',
    '/vendor/codemirror/addon/fold/brace-fold',
    '/vendor/codemirror/addon/fold/indent-fold',
    '/vendor/codemirror/addon/selection/active-line',
    '/vendor/codemirror/lib/codemirror.css',
    '/vendor/codemirror/addon/fold/foldgutter.css',
    '/js/cmpver', /* global compareVersion */
    '/js/sections-util', /* global styleCodeEmpty */
    '/js/color/color-converter',
    '/edit/codemirror-default.css',
  ])).then(() => require([
    '/edit/codemirror-default',
    '/js/color/color-view',
  ]));

  ({tabId, initialUrl} = await preinit);
  liveReload = initLiveReload();

  const {dup, style, error, sourceCode} = await preinit.ready;
  if (!style && sourceCode == null) {
    messageBox.alert(isNaN(error) ? error : 'HTTP Error ' + error, 'pre');
    return;
  }
  await scriptsReady;
  cm = CodeMirror($('.main'), {
    value: sourceCode || style.sourceCode,
    readOnly: true,
    colorpicker: true,
    theme,
  });
  window.on('resize', adjustCodeHeight);
  if (error) {
    showBuildError(error);
  }
  if (!style) {
    return;
  }
  const data = style.usercssData;
  const dupData = dup && dup.usercssData;
  const versionTest = dup && compareVersion(data.version, dupData.version);

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
        data.name + (dup.customName ? ` (${dup.customName})` : ''),
        dupData.version,
        data.version,
      ]))
    ).then(ok => ok &&
      API.usercss.install(style)
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
})();

function updateMeta(style, dup = installedDup) {
  installedDup = dup;
  const data = style.usercssData;
  const dupData = dup && dup.usercssData;
  const versionTest = dup && compareVersion(data.version, dupData.version);

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
  getAppliesTo(style).then(list =>
    $('.applies-to').append(...list.map(s => $create('li', s))));

  $('.external-link').textContent = '';
  const externalLink = makeExternalLink();
  if (externalLink) {
    $('.external-link').appendChild(externalLink);
  }

  Object.assign($('.configure-usercss'), {
    hidden: !data.vars,
    onclick: openConfigDialog,
  });
  if (!data.vars) {
    $$remove('#message-box.config-dialog');
  } else if (!deepEqual(data.vars, vars)) {
    vars = data.vars;
    // Use the user-customized vars from the installed style
    for (const [dk, dv] of Object.entries(dup && dupData.vars || {})) {
      const v = vars[dk];
      if (v && v.type === dv.type) {
        v.value = dv.value;
      }
    }
    openConfigDialog();
  }

  $('#header').dataset.arrivedFast = performance.now() < 500;
  $('#header').classList.add('meta-init');
  $('#header').classList.remove('meta-init-error');

  setTimeout(() => $$remove('.lds-spinner'), 1000);
  showError('');
  requestAnimationFrame(adjustCodeHeight);
  if (dup) enablePostActions();

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
            d: 'M4,4h5v2H6v8h8v-3h2v5H4V4z M11,3h6v6l-2-2l-4,4L9,9l4-4L11,3z',
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
        )),
      ]));
  }

  async function openConfigDialog() {
    await require(['/js/dlg/config-dialog']); /* global configDialog */
    configDialog(style);
  }
}

function showError(err) {
  $('.warnings').textContent = '';
  $('.warnings').classList.toggle('visible', Boolean(err));
  $('.container').classList.toggle('has-warnings', Boolean(err));
  err = Array.isArray(err) ? err : [err];
  if (err[0]) {
    let i;
    if ((i = err[0].index) >= 0 ||
        (i = err[0].offset) >= 0) {
      cm.jumpToPos(cm.posFromIndex(i));
      cm.setSelections(err.map(e => {
        const pos = e.index >= 0 && cm.posFromIndex(e.index) || // usercss meta parser
          e.offset >= 0 && {line: e.line - 1, ch: e.col - 1}; // csslint code parser
        return pos && {anchor: pos, head: pos};
      }).filter(Boolean));
      cm.focus();
    }
    $('.warnings').appendChild(
      $create('.warning', [
        t('parseUsercssError'),
        '\n',
        ...err.map(e => e.message ? $create('pre', e.message) : e || 'Unknown error'),
      ]));
  }
  adjustCodeHeight();
}

function showBuildError(error) {
  $('#header').classList.add('meta-init-error');
  console.error(error);
  showError(error);
}

function install(style) {
  installed = style;

  $$remove('.warning');
  $('button.install').disabled = true;
  $('button.install').classList.add('installed');
  $('#live-reload-install-hint').classList.toggle('hidden', !liveReload.enabled);
  $('h2.installed').classList.add('active');
  $('.set-update-url input[type=checkbox]').disabled = true;
  $('.set-update-url').title = style.updateUrl ?
    t('installUpdateFrom', style.updateUrl) : '';
  enablePostActions();
  updateMeta(style);
}

function enablePostActions() {
  const {id} = installed || installedDup;
  sessionStorage.justEditedStyleId = id;
  $('h2.installed').hidden = !installed;
  $('.installed-actions').hidden = false;
  $('.installed-actions a[href*="edit.html"]').search = `?id=${id}`;
  $('#delete').onclick = async () => {
    if (await messageBox.confirm(t('deleteStyleConfirm'), 'danger center', t('confirmDelete'))) {
      await API.styles.delete(id);
      if (tabId < 0 && history.length > 1) {
        history.back();
      } else {
        closeCurrentTab();
      }
    }
  };
}

async function getAppliesTo(style) {
  if (style.sectionsPromise) {
    try {
      style.sections = await style.sectionsPromise;
    } catch (error) {
      showBuildError(error);
      return [];
    } finally {
      delete style.sectionsPromise;
    }
  }
  let numGlobals = 0;
  const res = [];
  const TARGETS = ['urls', 'urlPrefixes', 'domains', 'regexps'];
  for (const section of style.sections) {
    const targets = [].concat(...TARGETS.map(t => section[t]).filter(Boolean));
    res.push(...targets);
    numGlobals += !targets.length && !styleCodeEmpty(section.code);
  }
  res.sort();
  if (!res.length || numGlobals) {
    res.push(t('appliesToEverything'));
  }
  return [...new Set(res)];
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
  const getData = preinit.getData;
  let sequence = preinit.ready;
  return {
    get enabled() {
      return isEnabled;
    },
    onToggled(e) {
      if (e) isEnabled = e.target.checked;
      if (installed || installedDup) {
        if (isEnabled) {
          check({force: true});
        } else {
          stop();
        }
        $('.install').disabled = isEnabled;
        Object.assign($('#live-reload-install-hint'), {
          hidden: !isEnabled,
          textContent: t(`liveReloadInstallHint${tabId >= 0 ? 'FF' : ''}`),
        });
      }
    },
  };
  function check(opts) {
    getData(opts)
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
      return API.usercss.install({id, sourceCode: code})
        .then(updateMeta)
        .catch(showError);
    });
  }
}
