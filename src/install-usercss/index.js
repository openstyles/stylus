import '/js/dom-init';
import {CodeMirror, loadCmTheme, THEME_KEY} from '/cm';
import compareVersion from '/js/cmpver';
import {UCD} from '/js/consts';
import {$, $$, $$remove, $create, $createLink} from '/js/dom';
import {configDialog, messageBox, showSpinner} from '/js/dom-util';
import {fetchTemplate, t, tBody} from '/js/localization';
import {API} from '/js/msg';
import * as prefs from '/js/prefs';
import {styleCodeEmpty} from '/js/sections-util';
import {isLocalhost} from '/js/urls';
import {clipString, deepEqual, sessionStore, tryURL} from '/js/util';
import {closeCurrentTab} from '/js/util-webext';
import DirectDownloader from './direct-downloader';
import PortDownloader from './port-downloader';
import './install-usercss.css';

const CFG_SEL = '#message-box.config-dialog';
let cfgShown = true;

let cm;
/** @type function(?options):Promise<?string> */
let getData;
let initialUrl;
let installed;
let installedDup;
let liveReload;
let sectionsPromise;
let tabId;
let vars;

// "History back" in Firefox (for now) restores the old DOM including the messagebox,
// which stays after installing since we don't want to wait for the fadeout animation before resolving.
document.on('visibilitychange', () => {
  $$remove('#message-box:not(.config-dialog)');
  if (installed) liveReload.onToggled();
});
tBody();
setTimeout(() => !cm && showSpinner($('#header')), 200);

(async function init() {
  if (location.hash) {
    history.replaceState(null, '',
      location.pathname + '?updateUrl=' + encodeURIComponent(location.hash.slice(1)));
  }
  /** @type {FileSystemFileHandle} */
  const fsh = window.fsh;
  const params = new URLSearchParams(location.search);
  tabId = params.has('tabId') ? Number(params.get('tabId')) : -1;
  initialUrl = fsh ? fsh._url : params.get('updateUrl');

  /** @type {Promise<?string>} */
  let firstGet;
  if (fsh) {
    let oldCode = null;
    getData = async () => {
      const code = await (await fsh.getFile()).text();
      if (oldCode !== code) return (oldCode = code);
    };
    firstGet = getData();
  } else if (!initialUrl) {
    if (history.length > 1) history.back();
    else closeCurrentTab();
  } else if (tabId < 0) {
    getData = DirectDownloader(initialUrl);
    firstGet = API.usercss.getInstallCode(initialUrl)
      .then(code => code || getData())
      .catch(getData);
  } else if (!process.env.MV3) {
    getData = PortDownloader();
    firstGet = getData({force: true});
  }

  const hasFileAccessP = browser.extension.isAllowedFileSchemeAccess();
  const tplP = fetchTemplate('/edit.html', 'styleSettings');
  tplP.then(el => {
    el.firstChild.remove(); // update URL
    el.lastChild.remove(); // buttons
    $('#styleSettings').append(el);
  });

  let dup, style, error, sourceCode;
  try {
    sourceCode = await firstGet;
    ({dup, style} = await API.usercss.build({sourceCode, checkDup: true, metaOnly: true}));
    sectionsPromise = API.usercss.buildCode(style);
  } catch (e) {
    error = e;
  }
  liveReload = initLiveReload();
  const [hasFileAccess] = await Promise.all([
    hasFileAccessP,
    prefs.ready,
  ]);
  if (!style && sourceCode == null) {
    messageBox.alert(isNaN(error) ? `${error}` : 'HTTP Error ' + error, 'pre');
    return;
  }
  const theme = prefs.get(THEME_KEY);
  loadCmTheme(theme);
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
  const data = style[UCD];
  const dupData = dup && dup[UCD];
  const versionTest = dup && compareVersion(data.version, dupData.version);

  updateMeta(style, dup);
  if (dup) {
    ($(`[name="ss-scheme"][value="${dup.preferScheme}"]`) || {}).checked = true;
  }
  for (let type of ['in', 'ex']) {
    const el = $('#ss-' + (type += 'clusions'));
    const list = dup && dup[type] || [];
    el.value = list.join('\n') + (list[0] ? '\n' : '');
    el.rows = list.length + 2;
    el.onchange = () => {
      style[type] = el.value.split(/\n/).map(s => s.trim()).filter(Boolean);
    };
  }

  // update UI
  if (versionTest < 0) {
    $('h1').after($create('.warning', t('versionInvalidOlder')));
  }
  $('button.install').onclick = () => {
    shouldShowConfig();
    (!dup ?
        Promise.resolve(true) :
        messageBox.confirm($create('span', t('styleInstallOverwrite', [
          data.name + (dup.customName ? ` (${dup.customName})` : ''),
          dupData.version,
          data.version,
        ])))
    ).then(ok => ok &&
      API.usercss.install(style)
        .then(install)
        .catch(err => messageBox.alert(t('styleInstallFailed', err.message || err), 'pre'))
    );
  };

  // set updateUrl
  const checker = $('.set-update-url input[type=checkbox]');
  const updateUrl = tryURL(style.updateUrl || initialUrl || dup && dup.updateUrl);
  if (!updateUrl) {
    checker.disabled = true;
  } else if (dup && dup.updateUrl === updateUrl.href) {
    checker.checked = true;
    // there is no way to "unset" updateUrl, you can only overwrite it.
    checker.disabled = true;
  } else if (updateUrl.protocol !== 'file:' || hasFileAccess) {
    checker.checked = true;
    style.updateUrl = updateUrl.href;
  }
  checker.onchange = () => {
    style.updateUrl = checker.checked ? updateUrl.href : null;
  };
  checker.onchange();
  $('.set-update-url p').textContent = clipString(updateUrl.href || '', 300);

  // set prefer scheme
  $('#ss-scheme').onchange = e => {
    style.preferScheme = e.target.value;
  };

  if (!initialUrl || isLocalhost(initialUrl)) {
    $('.live-reload input').onchange = liveReload.onToggled;
  } else {
    $('.live-reload').remove();
  }
})();

function updateMeta(style, dup = installedDup) {
  installedDup = dup;
  const data = style[UCD];
  const dupData = dup && dup[UCD];
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
  if (dup && dup.updateUrl) {
    $('.set-update-url').title = t('installUpdateFrom', dup.updateUrl).replace(/\S+$/, '\n$&');
  }
  $('.meta-name').textContent = data.name;
  $('.meta-version').textContent = data.version;
  $('.meta-description').textContent = data.description;
  $$('#ss-scheme input').forEach(el => {
    el.checked = el.value === (style.preferScheme || 'none');
  });

  replaceChildren($('.meta-author'), makeAuthor(data.author), true);
  replaceChildren($('.meta-license'), data.license, true);
  replaceChildren($('.external-link'), makeExternalLink());
  getAppliesTo(style).then(list =>
    replaceChildren($('.applies-to'), list.map(s => $create('li', s))));

  Object.assign($('.configure-usercss'), {
    hidden: !data.vars,
    onclick: openConfigDialog,
  });
  if (!data.vars) {
    cfgShown = false;
    $$remove(CFG_SEL);
  } else if (!deepEqual(data.vars, vars)) {
    vars = data.vars;
    // Use the user-customized vars from the installed style
    for (const [dk, dv] of Object.entries(dup && dupData.vars || {})) {
      const v = vars[dk];
      if (v && v.type === dv.type) {
        v.value = dv.value;
      }
    }
  }
  if (shouldShowConfig()) {
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
    const match = text && text.match(/^(.+?)(?:\s+<(.+?)>)?(?:\s+\((.+?)\))?$/);
    if (!match) {
      return text;
    }
    const [, name, email, url] = match;
    const elems = [];
    if (email) {
      elems.push($createLink(`mailto:${email}`, name));
    } else {
      elems.push($create('span', name));
    }
    if (url) {
      elems.push($createLink(url, $create('i.i-external')));
    }
    return elems;
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
    configDialog(style);
  }
}

function showError(err) {
  $('.warnings').textContent = '';
  $('.warnings').classList.toggle('visible', Boolean(err));
  document.body.classList.toggle('has-warnings', Boolean(err));
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
  $('#live-reload-install-hint').hidden = !liveReload.enabled;
  $('.set-update-url').title = style.updateUrl ?
    t('installUpdateFrom', style.updateUrl) : '';
  $$('.install-disable input').forEach(el => (el.disabled = true));
  document.body.classList.add('installed');
  enablePostActions();
  updateMeta(style);
}

function enablePostActions() {
  const {id} = installed || installedDup;
  sessionStore.justEditedStyleId = id;
  $('#edit').search = `?id=${id}`;
  $('#delete').onclick = async () => {
    if (await messageBox.confirm(t('deleteStyleConfirm'), 'danger center', t('confirmDelete'))) {
      await API.styles.remove(id);
      if (tabId < 0 && history.length > 1) {
        history.back();
      } else {
        closeCurrentTab();
      }
    }
  };
}

async function getAppliesTo(style) {
  if (sectionsPromise) {
    try {
      style.sections = (await sectionsPromise).sections;
    } catch (error) {
      showBuildError(error);
      return [];
    } finally {
      sectionsPromise = null;
    }
  }
  let numGlobals = 0;
  const res = [];
  const TARGETS = ['urls', 'urlPrefixes', 'domains', 'regexps'];
  for (const section of style.sections) {
    const targets = [].concat(...TARGETS.map(_ => section[_]).filter(Boolean));
    res.push(...targets);
    numGlobals += !targets.length && !styleCodeEmpty(section);
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
  let sequence = Promise.resolve();
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

function shouldShowConfig() {
  // TODO: rewrite message-box to support multiple instances or find an existing tiny library
  const prev = cfgShown;
  cfgShown = $(CFG_SEL) != null;
  return prev && !cfgShown;
}

function replaceChildren(el, children, toggleParent) {
  if (el.firstChild) el.textContent = '';
  if (children) el.append(...Array.isArray(children) ? children : [children]);
  if (toggleParent) el.parentNode.hidden = !el.firstChild;
}
