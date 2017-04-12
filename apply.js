// Not using some slow features of ES6, see http://kpdecker.github.io/six-speed/
// like destructring, classes, defaults, spread, calculated key names
/* eslint no-var: 0 */
'use strict';

var isOwnPage = location.href.startsWith('chrome-extension:');
var disableAll = false;
var styleElements = new Map();
var disabledElements = new Map();
var retiredStyleIds = [];

requestStyles();
chrome.runtime.onMessage.addListener(applyOnMessage);

if (!isOwnPage) {
  window.dispatchEvent(new CustomEvent(chrome.runtime.id));
  window.addEventListener(chrome.runtime.id, orphanCheck, true);
}

function requestStyles(options) {
  // If this is a Stylish page (Edit Style or Manage Styles),
  // we'll request the styles directly to minimize delay and flicker,
  // unless Chrome is still starting up and the background page isn't fully loaded.
  // (Note: in this case the function may be invoked again from applyStyles.)
  const request = Object.assign({
    method: 'getStyles',
    matchUrl: location.href,
    enabled: true,
    asHash: true,
  }, options);
  if (typeof getStylesSafe !== 'undefined') {
    getStylesSafe(request).then(applyStyles);
  } else {
    chrome.runtime.sendMessage(request, applyStyles);
  }
}


function applyOnMessage(request, sender, sendResponse) {
  // Do-It-Yourself tells our built-in pages to fetch the styles directly
  // which is faster because IPC messaging JSON-ifies everything internally
  if (request.styles == 'DIY') {
    getStylesSafe({
      matchUrl: location.href,
      enabled: true,
      asHash: true,
    }).then(styles =>
      applyOnMessage(Object.assign(request, {styles})));
    return;
  }
  switch (request.method) {

    case 'styleDeleted':
      removeStyle(request.id, document);
      break;

    case 'styleUpdated':
      if (request.codeIsUpdated === false) {
        applyStyleState(request.style.id, request.style.enabled, document);
        break;
      }
      if (!request.style.enabled) {
        removeStyle(request.style.id, document);
        break;
      }
      retireStyle(request.style.id);
     // fallthrough to 'styleAdded'

    case 'styleAdded':
      if (request.style.enabled) {
        requestStyles({id: request.style.id});
      }
      break;

    case 'styleApply':
      applyStyles(request.styles);
      break;

    case 'styleReplaceAll':
      replaceAll(request.styles, document);
      break;

    case 'prefChanged':
      if ('disableAll' in request.prefs) {
        doDisableAll(request.prefs.disableAll);
      }
      break;

    case 'ping':
      sendResponse(true);
      break;
  }
}


function doDisableAll(disable, doc = document) {
  if (doc == document && !disable === !disableAll) {
    return;
  }
  disableAll = disable;
  if (disable && doc.iframeObserver) {
    doc.iframeObserver.stop();
  }
  Array.prototype.forEach.call(doc.styleSheets, stylesheet => {
    if (stylesheet.ownerNode.matches('stylus[id^="stylus-"]')
    && stylesheet.disabled != disable) {
      stylesheet.disabled = disable;
    }
  });
  for (const iframe of getDynamicIFrames(doc)) {
    if (!disable) {
      // update the IFRAME if it was created while the observer was disconnected
      addDocumentStylesToIFrame(iframe);
    }
    doDisableAll(disable, iframe.contentDocument);
  }
  if (!disable && doc.readyState != 'loading' && doc.iframeObserver) {
    doc.iframeObserver.start();
  }
}


function applyStyleState(id, enabled, doc) {
  const inCache = disabledElements.get(id);
  const inDoc = doc.getElementById('stylus-' + id);
  if (enabled && inDoc || !enabled && !inDoc) {
    return;
  }
  if (enabled && !inDoc && !inCache) {
    requestStyles({id});
    return;
  }
  if (enabled && inCache) {
    const el = inCache.cloneNode(true);
    doc.documentElement.appendChild(el);
    el.sheet.disabled = disableAll;
    processDynamicIFrames(doc, applyStyleState, id, enabled);
    disabledElements.delete(id);
    return;
  }
  if (!enabled && inDoc) {
    if (!inCache) {
      disabledElements.set(id, inDoc);
    }
    inDoc.remove();
    if (doc.location.href == 'about:srcdoc') {
      const original = doc.getElementById('stylus-' + id);
      if (original) {
        original.remove();
      }
    }
    processDynamicIFrames(doc, applyStyleState, id, enabled);
    return;
  }
}


function removeStyle(id, doc) {
  [doc.getElementById('stylus-' + id)].forEach(e => e && e.remove());
  if (doc == document) {
    styleElements.delete('stylus-' + id);
    disabledElements.delete(id);
    if (!styleElements.size) {
      doc.iframeObserver.disconnect();
    }
  }
  processDynamicIFrames(doc, removeStyle, id);
}


// to avoid page flicker when the style is updated
// instead of removing it immediately we rename its ID and queue it
// to be deleted in applyStyles after a new version is fetched and applied
function retireStyle(id, doc) {
  const deadID = 'ghost-' + id;
  if (!doc) {
    doc = document;
    retiredStyleIds.push(deadID);
    styleElements.delete('stylus-' + id);
    disabledElements.delete(id);
    // in case something went wrong and new style was never applied
    setTimeout(removeStyle, 1000, deadID, doc);
  }
  const el = doc.getElementById('stylus-' + id);
  if (el) {
    el.id = 'stylus-' + deadID;
  }
  processDynamicIFrames(doc, retireStyle, id);
}


function applyStyles(styleHash) {
  if (!styleHash) { // Chrome is starting up
    requestStyles();
    return;
  }
  if ('disableAll' in styleHash) {
    doDisableAll(styleHash.disableAll);
    delete styleHash.disableAll;
  }

  for (const styleId in styleHash) {
    applySections(styleId, styleHash[styleId]);
  }

  if (styleElements.size) {
    // when site response is application/xml Chrome displays our style elements
    // under document.documentElement as plain text so we need to move them into HEAD
    // which is already autogenerated at this moment
    if (document.head && document.head.firstChild && document.head.firstChild.id == 'xml-viewer-style') {
      for (const id of styleElements.keys()) {
        document.head.appendChild(document.getElementById(id));
      }
    }
    initObservers();
  }

  if (retiredStyleIds.length) {
    setTimeout(function() {
      while (retiredStyleIds.length) {
        removeStyle(retiredStyleIds.shift(), document);
      }
    }, 0);
  }
}


function applySections(styleId, sections) {
  let el = document.getElementById('stylus-' + styleId);
  // Already there.
  if (el) {
    return;
  }
  if (document.documentElement instanceof SVGSVGElement) {
    // SVG document, make an SVG style element.
    el = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  } else if (document instanceof XMLDocument) {
    el = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
  } else {
    // This will make an HTML style element. If there's SVG embedded in an HTML document, this works on the SVG too.
    el = document.createElement('style');
  }
  el.setAttribute('id', 'stylus-' + styleId);
  el.setAttribute('class', 'stylus');
  el.setAttribute('type', 'text/css');
  el.appendChild(document.createTextNode(sections.map(section => section.code).join('\n')));
  addStyleElement(el, document);
  styleElements.set(el.id, el);
  disabledElements.delete(styleId);
}


function addStyleElement(el, doc) {
  if (!doc.documentElement || doc.getElementById(el.id)) {
    return;
  }
  doc.documentElement.appendChild(doc.importNode(el, true))
    .disabled = disableAll;
  for (const iframe of getDynamicIFrames(doc)) {
    if (iframeIsLoadingSrcDoc(iframe)) {
      addStyleToIFrameSrcDoc(iframe, el);
    } else {
      addStyleElement(el, iframe.contentDocument);
    }
  }
}


function addDocumentStylesToIFrame(iframe) {
  const doc = iframe.contentDocument;
  const srcDocIsLoading = iframeIsLoadingSrcDoc(iframe);
  for (const el of styleElements.values()) {
    if (srcDocIsLoading) {
      addStyleToIFrameSrcDoc(iframe, el);
    } else {
      addStyleElement(el, doc);
    }
  }
  initObservers(doc);
}


function addDocumentStylesToAllIFrames(doc = document) {
  getDynamicIFrames(doc).forEach(addDocumentStylesToIFrame);
}


// Only dynamic iframes get the parent document's styles. Other ones should get styles based on their own URLs.
function getDynamicIFrames(doc) {
  return Array.prototype.filter.call(doc.getElementsByTagName('iframe'), iframeIsDynamic);
}


function iframeIsDynamic(f) {
  let href;
  if (f.src && f.src.startsWith('http') && new URL(f.src).origin != location.origin) {
    return false;
  }
  try {
    href = f.contentDocument.location.href;
  } catch (ex) {
    // Cross-origin, so it's not a dynamic iframe
    return false;
  }
  return href == document.location.href || href.startsWith('about:');
}


function processDynamicIFrames(doc, fn, ...args) {
  var iframes = doc.getElementsByTagName('iframe');
  for (var i = 0, il = iframes.length; i < il; i++) {
    var iframe = iframes[i];
    if (iframeIsDynamic(iframe)) {
      fn(...args, iframe.contentDocument);
    }
  }
}


function iframeIsLoadingSrcDoc(f) {
  return f.srcdoc && f.contentDocument.all.length <= 3;
  // 3 nodes or less in total (html, head, body) == new empty iframe about to be overwritten by its 'srcdoc'
}


function addStyleToIFrameSrcDoc(iframe, el) {
  if (disableAll) {
    return;
  }
  iframe.srcdoc += el.outerHTML;
  // make sure the style is added in case srcdoc was malformed
  setTimeout(addStyleElement, 100, el, iframe.contentDocument);
}


function replaceAll(newStyles, doc) {
  Array.prototype.forEach.call(doc.querySelectorAll('STYLE.stylus[id^="stylus-"]'),
    e => (e.id += '-ghost'));
  processDynamicIFrames(doc, replaceAll, newStyles);
  if (doc == document) {
    styleElements.clear();
    disabledElements.clear();
    applyStyles(newStyles);
    replaceAllpass2(newStyles, doc);
  }
}


function replaceAllpass2(newStyles, doc) {
  const oldStyles = doc.querySelectorAll('STYLE.stylus[id$="-ghost"]');
  processDynamicIFrames(doc, replaceAllpass2, newStyles);
  Array.prototype.forEach.call(oldStyles,
    e => e.remove());
}


function onDOMContentLoaded({target = document} = {}) {
  addDocumentStylesToAllIFrames(target);
  if (target.iframeObserver) {
    target.iframeObserver.start();
  }
}


function initObservers(doc = document) {
  if (isOwnPage || doc.rewriteObserver) {
    return;
  }
  initIFrameObserver(doc);
  initDocRewriteObserver(doc);
  if (doc.readyState != 'loading') {
    onDOMContentLoaded({target: doc});
  } else {
    doc.addEventListener('DOMContentLoaded', onDOMContentLoaded);
  }
}


function initIFrameObserver(doc = document) {
  if (!initIFrameObserver.methods) {
    initIFrameObserver.methods = {
      start() {
        this.observe(this.doc, {childList: true, subtree: true});
      },
      stop() {
        this.disconnect();
        getDynamicIFrames(this.doc).forEach(iframe => {
          const observer = iframe.contentDocument.iframeObserver;
          if (observer) {
            observer.stop();
          }
        });
      },
    };
  }
  doc.iframeObserver = Object.assign(
    new MutationObserver(iframeObserver),
    initIFrameObserver.methods, {
      iframes: doc.getElementsByTagName('iframe'),
      doc,
    });
}


function iframeObserver(mutations, observer) {
  // autoupdated HTMLCollection is superfast
  if (!observer.iframes[0]) {
    return;
  }
  // use a much faster method for very complex pages with lots of mutations
  // (observer usually receives 1k-10k mutations per call)
  if (mutations.length > 1000) {
    addDocumentStylesToAllIFrames(observer.doc);
    return;
  }
  for (var m = 0, ml = mutations.length; m < ml; m++) {
    var added = mutations[m].addedNodes;
    for (var n = 0, nl = added.length; n < nl; n++) {
      var node = added[n];
      // process only ELEMENT_NODE
      if (node.nodeType != 1) {
        continue;
      }
      var iframes = node.localName === 'iframe' ? [node] :
        node.children.length && node.getElementsByTagName('iframe');
      if (iframes.length) {
        // move the check out of current execution context
        // because some same-domain (!) iframes fail to load when their 'contentDocument' is accessed (!)
        // namely gmail's old chat iframe talkgadget.google.com
        setTimeout(testIFrames, 0, iframes);
      }
    }
  }
}


function testIFrames(iframes) {
  for (const iframe of iframes) {
    if (iframeIsDynamic(iframe)) {
      addDocumentStylesToIFrame(iframe);
    }
  }
}


function initDocRewriteObserver(doc = document) {
  // re-add styles if we detect documentElement being recreated
  doc.rewriteObserver = new MutationObserver(docRewriteObserver);
  doc.rewriteObserver.observe(doc, {childList: true});
}


function docRewriteObserver(mutations) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.localName != 'html') {
        continue;
      }
      const doc = node.ownerDocument;
      for (const [id, el] of styleElements.entries()) {
        if (!doc.getElementById(id)) {
          doc.documentElement.appendChild(el);
        }
      }
      initObservers(doc);
      return;
    }
  }
}


function orphanCheck() {
  const port = chrome.runtime.connect();
  if (port) {
    port.disconnect();
    //console.debug('orphanCheck: still connected');
    return;
  }
  //console.debug('orphanCheck: disconnected');

  // we're orphaned due to an extension update
  // we can detach the mutation observer
  // we can detach event listeners
  (function unbind(doc) {
    if (doc.iframeObserver) {
      doc.iframeObserver.disconnect();
      delete doc.iframeObserver;
    }
    if (doc.rewriteObserver) {
      doc.rewriteObserver.disconnect();
      delete doc.rewriteObserver;
    }
    doc.removeEventListener('DOMContentLoaded', onDOMContentLoaded);
    getDynamicIFrames(doc).forEach(iframe => unbind(iframe.contentDocument));
  })(document);
  window.removeEventListener(chrome.runtime.id, orphanCheck, true);
  // we can't detach chrome.runtime.onMessage because it's no longer connected internally
  // we can destroy our globals in this context to free up memory
  [ // functions
    'addDocumentStylesToAllIFrames',
    'addDocumentStylesToIFrame',
    'addStyleElement',
    'addStyleToIFrameSrcDoc',
    'applyOnMessage',
    'applySections',
    'applyStyles',
    'doDisableAll',
    'getDynamicIFrames',
    'iframeIsDynamic',
    'iframeIsLoadingSrcDoc',
    'initDocRewriteObserver',
    'initIFrameObserver',
    'orphanCheck',
    'processDynamicIFrames',
    'removeStyle',
    'replaceAll',
    'replaceAllpass2',
    'requestStyles',
    'retireStyle',
    'styleObserver',
    // variables
    'docRewriteObserver',
    'iframeObserver',
    'retiredStyleIds',
    'styleElements',
  ].forEach(fn => (window[fn] = null));
}
