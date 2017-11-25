/* eslint no-var: 0 */
'use strict';

var ID_PREFIX = 'stylus-';
var ROOT = document.documentElement;
var isOwnPage = location.protocol.endsWith('-extension:');
var disableAll = false;
var exposeIframes = false;
var styleElements = new Map();
var disabledElements = new Map();
var retiredStyleTimers = new Map();
var docRewriteObserver;
var docRootObserver;

requestStyles();
chrome.runtime.onMessage.addListener(applyOnMessage);

if (!isOwnPage) {
  window.dispatchEvent(new CustomEvent(chrome.runtime.id));
  window.addEventListener(chrome.runtime.id, orphanCheck, true);
}

function requestStyles(options, callback = applyStyles) {
  if (!chrome.app && document instanceof XMLDocument) {
    chrome.runtime.sendMessage({method: 'styleViaAPI', action: 'styleApply'});
    return;
  }
  var matchUrl = location.href;
  if (!matchUrl.match(/^(http|file|chrome|ftp)/)) {
    // dynamic about: and javascript: iframes don't have an URL yet
    // so we'll try the parent frame which is guaranteed to have a real URL
    try {
      if (window !== parent) {
        matchUrl = parent.location.href;
      }
    } catch (e) {}
  }
  const request = Object.assign({
    method: 'getStyles',
    matchUrl,
    enabled: true,
    asHash: true,
  }, options);
  // On own pages we request the styles directly to minimize delay and flicker
  if (typeof getStylesSafe === 'function') {
    getStylesSafe(request).then(callback);
  } else {
    chrome.runtime.sendMessage(request, callback);
  }
}


function applyOnMessage(request, sender, sendResponse) {
  if (request.styles === 'DIY') {
    // Do-It-Yourself tells our built-in pages to fetch the styles directly
    // which is faster because IPC messaging JSON-ifies everything internally
    requestStyles({}, styles => {
      request.styles = styles;
      applyOnMessage(request);
    });
    return;
  }

  if (!chrome.app && document instanceof XMLDocument && request.method !== 'ping') {
    request.action = request.method;
    request.method = 'styleViaAPI';
    request.styles = null;
    if (request.style) {
      request.style.sections = null;
    }
    chrome.runtime.sendMessage(request);
    return;
  }

  switch (request.method) {
    case 'styleDeleted':
      removeStyle(request);
      break;

    case 'styleUpdated':
      if (request.codeIsUpdated === false) {
        applyStyleState(request.style);
        break;
      }
      if (request.style.enabled) {
        removeStyle({id: request.style.id, retire: true});
        requestStyles({id: request.style.id});
      } else {
        removeStyle(request.style);
      }
      break;

    case 'styleAdded':
      if (request.style.enabled) {
        requestStyles({id: request.style.id});
      }
      break;

    case 'styleApply':
      applyStyles(request.styles);
      break;

    case 'styleReplaceAll':
      replaceAll(request.styles);
      break;

    case 'prefChanged':
      if ('disableAll' in request.prefs) {
        doDisableAll(request.prefs.disableAll);
      }
      if ('exposeIframes' in request.prefs) {
        doExposeIframes(request.prefs.exposeIframes);
      }
      break;

    case 'ping':
      sendResponse(true);
      break;
  }
}


function doDisableAll(disable = disableAll) {
  if (!disable === !disableAll) {
    return;
  }
  disableAll = disable;
  Array.prototype.forEach.call(document.styleSheets, stylesheet => {
    if (stylesheet.ownerNode.matches(`style.stylus[id^="${ID_PREFIX}"]`)
    && stylesheet.disabled !== disable) {
      stylesheet.disabled = disable;
    }
  });
}


function doExposeIframes(state = exposeIframes) {
  if (state === exposeIframes || window === parent) {
    return;
  }
  exposeIframes = state;
  const attr = document.documentElement.getAttribute('stylus-iframe');
  if (state && attr !== '') {
    document.documentElement.setAttribute('stylus-iframe', '');
  } else if (!state && attr === '') {
    document.documentElement.removeAttribute('stylus-iframe');
  }
}


function applyStyleState({id, enabled}) {
  const inCache = disabledElements.get(id) || styleElements.get(id);
  const inDoc = document.getElementById(ID_PREFIX + id);
  if (enabled) {
    if (inDoc) {
      return;
    } else if (inCache) {
      addStyleElement(inCache);
      disabledElements.delete(id);
    } else {
      requestStyles({id});
    }
  } else {
    if (inDoc) {
      disabledElements.set(id, inDoc);
      docRootObserver.stop();
      inDoc.remove();
      docRootObserver.start();
    }
  }
}


function removeStyle({id, retire = false}) {
  const el = document.getElementById(ID_PREFIX + id);
  if (el) {
    if (retire) {
      // to avoid page flicker when the style is updated
      // instead of removing it immediately we rename its ID and queue it
      // to be deleted in applyStyles after a new version is fetched and applied
      const deadID = 'ghost-' + id;
      el.id = ID_PREFIX + deadID;
      // in case something went wrong and new style was never applied
      retiredStyleTimers.set(deadID, setTimeout(removeStyle, 1000, {id: deadID}));
    } else {
      el.remove();
    }
  }
  styleElements.delete(ID_PREFIX + id);
  disabledElements.delete(id);
  retiredStyleTimers.delete(id);
}


function applyStyles(styles) {
  if (!styles) {
    // Chrome is starting up
    requestStyles();
    return;
  }
  if ('disableAll' in styles) {
    doDisableAll(styles.disableAll);
    delete styles.disableAll;
  }
  if ('exposeIframes' in styles) {
    doExposeIframes(styles.exposeIframes);
    delete styles.exposeIframes;
  }

  const gotNewStyles = Object.keys(styles).length || styles.needTransitionPatch;
  if (gotNewStyles) {
    if (docRootObserver) {
      docRootObserver.stop();
    } else {
      initDocRootObserver();
    }
  }

  if (styles.needTransitionPatch) {
    // CSS transition bug workaround: since we insert styles asynchronously,
    // the browsers, especially Firefox, may apply all transitions on page load
    delete styles.needTransitionPatch;
    const className = chrome.runtime.id + '-transition-bug-fix';
    const docId = document.documentElement.id ? '#' + document.documentElement.id : '';
    document.documentElement.classList.add(className);
    applySections(0, `
      ${docId}.${className}:root * {
        transition: none !important;
      }
    `);
    setTimeout(() => {
      removeStyle({id: 0});
      document.documentElement.classList.remove(className);
    });
  }

  if (gotNewStyles) {
    for (const id in styles) {
      applySections(id, styles[id].map(section => section.code).join('\n'));
    }
    docRootObserver.start({sort: true});
  }

  if (!isOwnPage && !docRewriteObserver && styleElements.size) {
    initDocRewriteObserver();
  }

  if (retiredStyleTimers.size) {
    setTimeout(() => {
      for (const [id, timer] of retiredStyleTimers.entries()) {
        removeStyle({id});
        clearTimeout(timer);
      }
    });
  }
}


function applySections(styleId, code) {
  let el = document.getElementById(ID_PREFIX + styleId);
  if (el) {
    return;
  }
  if (document.documentElement instanceof SVGSVGElement) {
    // SVG document style
    el = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  } else if (document instanceof XMLDocument) {
    // XML document style
    el = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
  } else {
    // HTML document style; also works on HTML-embedded SVG
    el = document.createElement('style');
  }
  Object.assign(el, {
    styleId,
    id: ID_PREFIX + styleId,
    type: 'text/css',
    textContent: code,
  });
  // SVG className is not a string, but an instance of SVGAnimatedString
  el.classList.add('stylus');
  addStyleElement(el);
  styleElements.set(el.id, el);
  disabledElements.delete(Number(styleId));
  return el;
}


function addStyleElement(newElement) {
  if (!ROOT) {
    return;
  }
  let next;
  const newStyleId = getStyleId(newElement);
  for (const el of styleElements.values()) {
    if (el.parentNode && !el.id.endsWith('-ghost') && getStyleId(el) > newStyleId) {
      next = el.parentNode === ROOT ? el : null;
      break;
    }
  }
  if (next === newElement.nextElementSibling) {
    return;
  }
  docRootObserver.stop();
  ROOT.insertBefore(newElement, next || null);
  if (disableAll) {
    newElement.disabled = true;
  }
  docRootObserver.start();
}


function replaceAll(newStyles) {
  const oldStyles = Array.prototype.slice.call(
    document.querySelectorAll(`style.stylus[id^="${ID_PREFIX}"]`));
  oldStyles.forEach(el => (el.id += '-ghost'));
  styleElements.clear();
  disabledElements.clear();
  [...retiredStyleTimers.values()].forEach(clearTimeout);
  retiredStyleTimers.clear();
  applyStyles(newStyles);
  oldStyles.forEach(el => el.remove());
}


function initDocRewriteObserver() {
  // detect documentElement being rewritten from inside the script
  docRewriteObserver = new MutationObserver(mutations => {
    for (let m = mutations.length; --m >= 0;) {
      const added = mutations[m].addedNodes;
      for (let n = added.length; --n >= 0;) {
        if (added[n].localName === 'html') {
          reinjectStyles();
          return;
        }
      }
    }
  });
  docRewriteObserver.observe(document, {childList: true});
  // detect dynamic iframes rewritten after creation by the embedder i.e. externally
  setTimeout(() => {
    if (document.documentElement !== ROOT) {
      reinjectStyles();
    }
  });
  // re-add styles if we detect documentElement being recreated
  function reinjectStyles() {
    if (!styleElements) {
      if (orphanCheck) {
        orphanCheck();
      }
      return;
    }
    ROOT = document.documentElement;
    docRootObserver.stop();
    const imported = [];
    for (const [id, el] of styleElements.entries()) {
      const copy = document.importNode(el, true);
      el.textContent += ' '; // invalidate CSSOM cache
      imported.push([id, copy]);
      addStyleElement(copy);
    }
    docRootObserver.start();
    styleElements = new Map(imported);
  }
}


function initDocRootObserver() {
  let lastRestorationTime = 0;
  let restorationCounter = 0;
  let observing = false;

  docRootObserver = Object.assign(new MutationObserver(sortStyleElements), {
    start({sort = false} = {}) {
      if (sort && sortStyleMap()) {
        sortStyleElements();
      }
      if (!observing) {
        this.observe(ROOT, {childList: true});
        observing = true;
      }
    },
    stop() {
      if (observing) {
        this.disconnect();
        observing = false;
      }
    },
  });
  return;

  function sortStyleMap() {
    const list = [];
    let prevStyleId = 0;
    let needsSorting = false;
    for (const entry of styleElements.entries()) {
      list.push(entry);
      const el = entry[1];
      const styleId = getStyleId(el);
      el.styleId = styleId;
      needsSorting |= styleId < prevStyleId;
      prevStyleId = styleId;
    }
    if (needsSorting) {
      styleElements = new Map(list.sort((a, b) => a[1].styleId - b[1].styleId));
      return true;
    }
  }

  function sortStyleElements() {
    let prev = document.body || document.head;
    if (!prev) {
      return;
    }
    let appliedChanges = false;
    for (const [idStr, el] of styleElements.entries()) {
      if (!el.parentNode && disabledElements.has(getStyleId(idStr))) {
        continue;
      }
      if (el.previousElementSibling === prev) {
        prev = el;
        continue;
      }
      if (!appliedChanges) {
        if (restorationLimitExceeded()) {
          return;
        }
        appliedChanges = true;
        docRootObserver.stop();
      }
      prev.insertAdjacentElement('afterend', el);
      if (el.disabled !== disableAll) {
        // moving an element resets its 'disabled' state
        el.disabled = disableAll;
      }
      prev = el;
    }
    if (appliedChanges) {
      docRootObserver.start();
    }
  }

  function restorationLimitExceeded() {
    const t = performance.now();
    if (t - lastRestorationTime > 1000) {
      restorationCounter = 0;
    }
    lastRestorationTime = t;
    if (++restorationCounter > 100) {
      console.error('Stylus stopped restoring userstyle elements after 100 failed attempts.\n' +
        'Please report on https://github.com/openstyles/stylus/issues');
      return true;
    }
  }
}


function getStyleId(el) {
  return parseInt((el.id || el).substr(ID_PREFIX.length));
}


function orphanCheck() {
  const port = chrome.runtime.connect();
  if (port) {
    port.disconnect();
    return;
  }

  // we're orphaned due to an extension update
  // we can detach the mutation observer
  [docRewriteObserver, docRootObserver].forEach(ob => ob && ob.disconnect());
  // we can detach event listeners
  window.removeEventListener(chrome.runtime.id, orphanCheck, true);
  // we can't detach chrome.runtime.onMessage because it's no longer connected internally
  // we can destroy our globals in this context to free up memory
  [ // functions
    'addStyleElement',
    'applyOnMessage',
    'applySections',
    'applyStyles',
    'applyStyleState',
    'doDisableAll',
    'initDocRewriteObserver',
    'initDocRootObserver',
    'orphanCheck',
    'removeStyle',
    'replaceAll',
    'requestStyles',
    // variables
    'ROOT',
    'disabledElements',
    'retiredStyleTimers',
    'styleElements',
    'docRewriteObserver',
    'docRootObserver',
  ].forEach(fn => (window[fn] = null));
}
