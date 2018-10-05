/* eslint no-eq-null: 0, eqeqeq: [2, "smart"] */
/* global createCache db calcStyleDigest normalizeStyleSections db promisify
    getStyleWithNoCode */
'use strict';

const styleManager = (() => {
  const preparing = prepare();
  const styles = new Map();
  const cachedStyleForUrl = createCache();
  const compiledRe = createCache();
  const compiledExclusion = createCache();
  const BAD_MATCHER = {test: () => false};
  const tabQuery = promisify(chrome.tabs.query.bind(chrome.tabs));
  const tabSendMessage = promisify(chrome.tabs.sendMessage.bind(chrome.tabs));
  const runtimeSendMessage = promisify(chrome.runtime.sendMessage.bind(chrome.runtime));

  // FIXME: do we have to prepare `styles` map for all methods?
  return ensurePrepared({
    // styles,
    // cachedStyleForUrl,
    getStylesInfo,
    getSectionsByUrl,
    installStyle,
    deleteStyle,
    setStyleExclusions,
    editSave,
    toggleStyle,
    getAllStyles, // used by import-export
    getStylesInfoForUrl, // used by popup
    countStyles,
    // TODO: get all styles API?
    // TODO: get style by ID?
  });

  function countStyles(filter) {
    if (!filter) {
      return styles.size;
    }
    // TODO
  }

  function getAllStyles() {
    return [...styles.values()].map(s => s.data);
  }

  function toggleStyle(id, enabled) {
    const style = styles.get(id);
    const newData = Object.assign({}, style.data, {enabled});
    return saveStyle(newData)
      .then(newData => {
        style.data = newData;
        return emitChanges({
          method: 'styleUpdated',
          codeIsUpdated: false,
          style: {id, enabled}
        }, style.appliesTo);
      })
      .then(() => id);
  }

  function emitChanges(message, appliesTo) {
    const pending = runtimeSendMessage(message);
    if (appliesTo && [...appliesTo].every(isExtensionUrl)) {
      return pending;
    }
    // FIXME: does `discared` work in old browsers?
    // TODO: send to activated tabs first?
    const pendingTabs = tabQuery({discared: false})
      .then(tabs => tabs
        .filter(t =>
          URLS.supported(t.url) &&
          !isExtensionUrl(t.url) &&
          (!appliesTo || appliesTo.has(t.url))
        )
        .map(t => tabSendMessage(t.id, message))
      );
    return Promise.all([pending, pendingTabs]);
  }

  function isExtensionUrl(url) {
    return /^\w+?-extension:\/\//.test(url);
  }

  function getStylesInfo(filter) {
    if (filter && filter.id) {
      return [getStyleWithNoCode(styles.get(filter.id).data)];
    }
    return [...styles.values()]
      .filter(s => !filter || filterMatchStyle(filter, s.data))
      .map(s => getStyleWithNoCode(s.data));
  }

  function filterMatchStyle(filter, style) {
    for (const key of Object.keys(filter)) {
      if (filter[key] !== style[key]) {
        return false;
      }
    }
    return true;
  }

  function editSave() {}

  function setStyleExclusions() {}

  function ensurePrepared(methods) {
    for (const [name, fn] in Object.entries(methods)) {
      methods[name] = (...args) =>
        preparing.then(() => fn(...args));
    }
    return methods;
  }

  function deleteStyle(id) {
    const style = styles.get(id);
    return db.exec('delete', id)
      .then(() => {
        for (const url of style.appliesTo) {
          const cache = cachedStyleForUrl.get(url);
          delete cache[id];
        }
        styles.delete(id);
        return emitChanges({
          method: 'styleDeleted',
          data: {id}
        });
      })
      .then(() => id);
  }

  function installStyle(style) {
    return calcStyleDigest(style)
      .then(digest => {
        style.originalDigest = digest;
        return saveStyle(style);
      })
      .then(style => {
        // FIXME: do we really need to clear the entire cache?
        cachedStyleForUrl.clear();
        // FIXME: invalid signature
        notifyAllTabs();
        return style;
      });
  }

  function importStyle(style) {
    // FIXME: move this to importer
    // style.originalDigest = style.originalDigest || style.styleDigest; // TODO: remove in the future
    // delete style.styleDigest; // TODO: remove in the future
    // if (typeof style.originalDigest !== 'string' || style.originalDigest.length !== 40) {
      // delete style.originalDigest;
    // }
  }

  function saveStyle(style) {
    return (style.id == null ? getNewStyle() : getOldStyle())
      .then(oldStyle => {
        // FIXME: update installDate?
        style = Object.assign(oldStyle, style);
        // FIXME: why we always run `normalizeStyleSections` at each `saveStyle`?
        style.sections = normalizeStyleSections(style);
        return db.exec('put', style);
      })
      .then(event => {
        if (style.id == null) {
          style.id = event.target.result;
        }
        return style;
      });

    function getOldStyle() {
      return db.exec('get', style.id)
        .then((event, store) => {
          if (!event.target.result) {
            throw new Error(`Unknown style id: ${style.id}`);
          }
          return event.target.result;
        });
    }

    // FIXME: don't overwrite style name when the name is empty

    function getNewStyle() {
      return Promise.resolve({
        enabled: true,
        updateUrl: null,
        md5Url: null,
        url: null,
        originalMd5: null,
        installDate: Date.now()
      });
    }
  }

  function getStylesInfoForUrl(url) {

  }

  function getSectionsByUrl(url, filterId) {
    let result = cachedStyleForUrl.get(url);
    if (!result) {
      result = {};
      for (const {appliesTo, data} of styles.values()) {
        if (!urlMatchStyle(url, data)) {
          continue;
        }
        let code = '';
        // result[id] = '';
        for (const section of data.sections) {
          if (urlMatchSection(url, section)) {
            code += section.code;
          }
        }
        if (code) {
          result[data.id] = code;
          appliesTo.add(url);
        }
      }
      cachedStyleForUrl.set(url, result);
    }
    if (filterId) {
      return {[filterId]: result[filterId]};
    }
    return result;
  }

  function prepare() {
    return db.exec('getAll').then(event => {
      const styleList = event.target.result;
      if (!styleList) {
        return;
      }
      for (const style of styleList) {
        styles.set(style.id, {
          appliesTo: new Set(),
          data: style
        });
        if (!style.name) {
          style.name = 'ID: ' + style.id;
        }
      }
    });
  }

  function urlMatchStyle(url, style) {
    if (style.exclusions && style.exclusions.some(e => compileExclusion(e).test(url))) {
      return false;
    }
    return true;
  }

  function urlMatchSection(url, section) {
    // FIXME: match sub domains?
    if (section.domains && section.domains.includes(getDomain(url))) {
      return true;
    }
    if (section.urlPrefixes && section.urlPrefixes.some(p => url.startsWith(p))) {
      return true;
    }
    if (section.urls && section.urls.includes(getUrlNoHash(url))) {
      return true;
    }
    if (section.regexps && section.regexps.some(r => compileRe(r).test(url))) {
      return true;
    }
    return false;
  }

  function compileRe(text) {
    let re = compiledRe.get(text);
    if (!re) {
      // FIXME: it should be `$({text})$` but we don't use the standard for compatibility
      re = tryRegExp(`^${text}$`);
      if (!re) {
        re = BAD_MATCHER;
      }
      compiledRe.set(text, re);
    }
    return re;
  }

  function compileExclusion(text) {
    let re = compiledExclusion.get(text);
    if (!re) {
      re = tryRegExp(buildGlob(text));
      if (!re) {
        re = BAD_MATCHER;
      }
      compiledExclusion.set(text, re);
    }
    return re;
  }

  function buildGlob(text) {
    const prefix = text[0] === '^' ? '' : '\\b';
    const suffix = text[text.length - 1] === '$' ? '' : '\\b';
    return `${prefix}${escape(text)}${suffix}`;

    function escape(text) {
      // FIXME: using .* everywhere is slow
      return text.replace(/[.*]/g, m => m === '.' ? '\\.' : '.*');
    }
  }

  function getDomain(url) {
    // FIXME: use a naive regexp
    return url.match(/\w+:\/\//);
  }

  function getUrlNoHash(url) {
    return url.split('#')[0];
  }

  // function cleanData(method, data) {
    // if (
      // (method === 'styleUpdated' || method === 'styleAdded') &&
      // (data.sections || data.sourceCode)
    // ) {
      // apply/popup/manage use only meta for these two methods,
      // editor may need the full code but can fetch it directly,
      // so we send just the meta to avoid spamming lots of tabs with huge styles
      // return getStyleWithNoCode(data);
    // }
    // return data;
  // }

  function isExtensionStyle(id) {
    // TODO
    // const style = styles.get(id);
    // if (!style)
    return false;
  }

  // function emitChanges(method, data) {
    // const pendingPrivilage = runtimeSendMessage({method, cleanData(method, data)});
    // const affectsAll = !msg.affects || msg.affects.all;
    // const affectsOwnOriginOnly =
    // !affectsAll && (msg.affects.editor || msg.affects.manager);
    // const affectsTabs = affectsAll || affectsOwnOriginOnly;
    // const affectsIcon = affectsAll || msg.affects.icon;
    // const affectsPopup = affectsAll || msg.affects.popup;
    // const affectsSelf = affectsPopup || msg.prefs;
    // notify all open extension pages and popups
    // if (affectsSelf) {
      // msg.tabId = undefined;
      // sendMessage(msg, ignoreChromeError);
    // }
    // notify tabs
    // if (affectsTabs || affectsIcon) {
      // const notifyTab = tab => {
        // if (!styleUpdated
        // && (affectsTabs || URLS.optionsUI.includes(tab.url))
        // own pages are already notified via sendMessage
        // && !(affectsSelf && tab.url.startsWith(URLS.ownOrigin))
        // skip lazy-loaded aka unloaded tabs that seem to start loading on message in FF
        // && (!FIREFOX || tab.width)) {
          // msg.tabId = tab.id;
          // sendMessage(msg, ignoreChromeError);
        // }
        // if (affectsIcon) {
          // eslint-disable-next-line no-use-before-define
          // debounce(API.updateIcon, 0, {tab});
        // }
      // };
      // list all tabs including chrome-extension:// which can be ours
      // Promise.all([
        // queryTabs(isExtensionStyle(data.id) ? {url: URLS.ownOrigin + '*'} : {}),
        // getActiveTab(),
      // ]).then(([tabs, activeTab]) => {
        // const activeTabId = activeTab && activeTab.id;
        // for (const tab of tabs) {
          // invokeOrPostpone(tab.id === activeTabId, notifyTab, tab);
        // }
      // });
    // }
    // notify self: the message no longer is sent to the origin in new Chrome
    // if (typeof onRuntimeMessage !== 'undefined') {
      // onRuntimeMessage(originalMessage);
    // }
    // notify apply.js on own pages
    // if (typeof applyOnMessage !== 'undefined') {
      // applyOnMessage(originalMessage);
    // }
    // propagate saved style state/code efficiently
    // if (styleUpdated) {
      // msg.refreshOwnTabs = false;
      // API.refreshAllTabs(msg);
    // }
  // }
})();

function notifyAllTabs() {}
