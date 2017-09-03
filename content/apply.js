// Not using some slow features of ES6, see http://kpdecker.github.io/six-speed/
// like destructring, classes, defaults, spread, calculated key names
/* eslint no-var: 0 */
'use strict';

var ID_PREFIX = 'stylus-';
var ROOT = document.documentElement;
var isOwnPage = location.href.startsWith('chrome-extension:');
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
  if (typeof getStylesSafe !== 'undefined') {
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
    if (stylesheet.ownerNode.matches(`STYLE.stylus[id^="${ID_PREFIX}"]`)
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
      inDoc.remove();
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
  if (document.head
  && document.head.firstChild
  && document.head.firstChild.id === 'xml-viewer-style') {
    // when site response is application/xml Chrome displays our style elements
    // under document.documentElement as plain text so we need to move them into HEAD
    // which is already autogenerated at this moment
    ROOT = document.head;
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
  for (const id in styles) {
    applySections(id, styles[id].map(section => section.code).join('\n'));
  }
  initDocRewriteObserver();
  initDocRootObserver();
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
    id: ID_PREFIX + styleId,
    className: 'stylus',
    type: 'text/css',
    textContent: code,
  });
  addStyleElement(el);
  styleElements.set(el.id, el);
  disabledElements.delete(Number(styleId));
  return el;
}


function addStyleElement(el) {
  if (ROOT && !document.getElementById(el.id)) {
    ROOT.appendChild(el);
    if (disableAll) {
      el.disabled = true;
    }
  }
}


function replaceAll(newStyles) {
  const oldStyles = Array.prototype.slice.call(
    document.querySelectorAll(`STYLE.stylus[id^="${ID_PREFIX}"]`));
  oldStyles.forEach(el => (el.id += '-ghost'));
  styleElements.clear();
  disabledElements.clear();
  [...retiredStyleTimers.values()].forEach(clearTimeout);
  retiredStyleTimers.clear();
  applyStyles(newStyles);
  oldStyles.forEach(el => el.remove());
}


function initDocRewriteObserver() {
  if (isOwnPage || docRewriteObserver || !styleElements.size) {
    return;
  }
  // re-add styles if we detect documentElement being recreated
  const reinjectStyles = () => {
    if (!styleElements) {
      return orphanCheck && orphanCheck();
    }
    ROOT = document.documentElement;
    for (const el of styleElements.values()) {
      el.textContent += ' '; // invalidate CSSOM cache
      addStyleElement(document.importNode(el, true));
    }
  };
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
}


function initDocRootObserver() {
  if (!styleElements.size || document.body || docRootObserver) {
    return;
  }
  // wait for BODY and move all style elements after it
  docRootObserver = new MutationObserver(() => {
    let expectedPrevSibling = document.body || document.head;
    if (!expectedPrevSibling) {
      return;
    }
    docRootObserver.disconnect();
    for (const el of styleElements.values()) {
      if (el.previousElementSibling !== expectedPrevSibling) {
        ROOT.insertBefore(el, expectedPrevSibling.nextSibling);
        if (el.disabled !== disableAll) {
          // moving an element resets its 'disabled' state
          el.disabled = disableAll;
        }
      }
      expectedPrevSibling = el;
    }
    if (document.body) {
      docRootObserver = null;
    } else {
      docRootObserver.connect();
    }
  });
  docRootObserver.connect = () => {
    docRootObserver.observe(ROOT, {childList: true});
  };
  docRootObserver.connect();
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
