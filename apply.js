// Not using some slow features of ES6, see http://kpdecker.github.io/six-speed/
// like destructring, classes, defaults, spread, calculated key names
/* eslint no-var: 0 */
'use strict';

var disableAll = false;
var styleElements = new Map();
var retiredStyleIds = [];
var iframeObserver;

initObserver();
requestStyles();
chrome.runtime.onMessage.addListener(applyOnMessage);


function requestStyles(options) {
  // If this is a Stylish page (Edit Style or Manage Styles),
  // we'll request the styles directly to minimize delay and flicker,
  // unless Chrome still starts up and the background page isn't fully loaded.
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
  // Also handle special request just for the pop-up
  switch (request.method == 'updatePopup' ? request.reason : request.method) {

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
        requestStyles({id: request.style.id}, applyStyles);
      }
      break;

    case 'styleApply':
      applyStyles(request.styles);
      break;

    case 'styleReplaceAll':
      replaceAll(request.styles, document);
      break;

    case 'styleDisableAll':
      doDisableAll(request.disableAll);
      break;

    case 'ping':
      sendResponse(true);
      break;
  }
}


function doDisableAll(disable) {
  if (!disable === !disableAll) {
    return;
  }
  disableAll = disable;
  if (disableAll) {
    iframeObserver.disconnect();
  }

  disableSheets(disableAll, document);

  if (!disableAll && document.readyState != 'loading') {
    iframeObserver.start();
  }

  function disableSheets(disable, doc) {
    Array.prototype.forEach.call(doc.styleSheets, stylesheet => {
      if (stylesheet.ownerNode.classList.contains('stylus')
      && stylesheet.disabled != disable) {
        stylesheet.disabled = disable;
      }
    });
    for (const iframe of getDynamicIFrames(doc)) {
      if (!disable) {
        // update the IFRAME if it was created while the observer was disconnected
        addDocumentStylesToIFrame(iframe);
      }
      disableSheets(disable, iframe.contentDocument);
    }
  }
}


function applyStyleState(id, enabled, doc) {
  const el = doc.getElementById('stylus-' + id);
  if (el) {
    el.sheet.disabled = !enabled;
    processDynamicIFrames(doc, applyStyleState, id, enabled);
  } else if (enabled) {
    requestStyles({id});
  }
}


function removeStyle(id, doc) {
  styleElements.delete('stylus-' + id);
  const el = doc.getElementById('stylus-' + id);
  if (el) {
    el.remove();
  }
  if (doc == document && !styleElements.size) {
    iframeObserver.disconnect();
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
    if (document.readyState != 'loading') {
      onDOMContentLoaded();
    } else {
      document.addEventListener('DOMContentLoaded', onDOMContentLoaded);
    }
  }

  if (retiredStyleIds.length) {
    setTimeout(function() {
      while (retiredStyleIds.length) {
        removeStyle(retiredStyleIds.shift(), document);
      }
    }, 0);
  }
}


function onDOMContentLoaded() {
  addDocumentStylesToAllIFrames();
  iframeObserver.start();
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
}


function addDocumentStylesToAllIFrames() {
  getDynamicIFrames(document).forEach(addDocumentStylesToIFrame);
}

// Only dynamic iframes get the parent document's styles. Other ones should get styles based on their own URLs.
function getDynamicIFrames(doc) {
  return [...doc.getElementsByTagName('iframe')].filter(iframeIsDynamic);
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
  for (const iframe of [...doc.getElementsByTagName('iframe')]) {
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
  const oldStyles = [...doc.querySelectorAll('STYLE.stylus')];
  oldStyles.forEach(style => (style.id += '-ghost'));
  processDynamicIFrames(doc, replaceAll, newStyles);
  if (doc == document) {
    styleElements.clear();
    applyStyles(newStyles);
    replaceAllpass2(newStyles, doc);
  }
}


function replaceAllpass2(newStyles, doc) {
  const oldStyles = [...doc.querySelectorAll('STYLE.stylus[id$="-ghost"]')];
  processDynamicIFrames(doc, replaceAllpass2, newStyles);
  oldStyles.forEach(style => style.remove());
}


// Observe dynamic IFRAMEs being added
function initObserver() {
  let orphanCheckTimer;
  const iframesCollection = document.getElementsByTagName('iframe');

  iframeObserver = new MutationObserver(function(mutations) {
    // MutationObserver runs as a microtask so the timer won't fire
    // until all queued mutations are fired
    clearTimeout(orphanCheckTimer);
    orphanCheckTimer = setTimeout(orphanCheck, 0);
    // autoupdated HTMLCollection is superfast
    if (!iframesCollection[0]) {
      return;
    }
    // use a much faster method for very complex pages with lots of mutations
    // (observer usually receives 1k-10k mutations per call)
    if (mutations.length > 1000) {
      addDocumentStylesToAllIFrames();
      return;
    }
    // move the check out of current execution context
    // because some same-domain (!) iframes fail to load when their 'contentDocument' is accessed (!)
    // namely gmail's old chat iframe talkgadget.google.com
    setTimeout(process, 0, mutations);
  });

  function process(mutations) {
    /* eslint-disable no-var # var is slightly faster and MutationObserver may run a lot */
    for (var m = 0, mutation; (mutation = mutations[m++]);) {
      var added = mutation.addedNodes;
      for (var n = 0, node; (node = added[n++]);) {
        // process only ELEMENT_NODE
        if (node.nodeType == 1) {
          var iframes = node.localName === 'iframe' ? [node] :
            node.children.length && node.getElementsByTagName('iframe');
          for (var i = 0, iframe; (iframe = iframes[i++]);) {
            if (iframeIsDynamic(iframe)) {
              addDocumentStylesToIFrame(iframe);
            }
          }
        }
      }
    }
    /* eslint-enable no-var */
  }

  iframeObserver.start = () => {
    // subsequent calls are ignored if already started observing
    iframeObserver.observe(document, {childList: true, subtree: true});
  };

  function orphanCheck() {
    orphanCheckTimer = 0;
    const port = chrome.runtime.connect();
    if (port) {
      port.disconnect();
      return;
    }

    // we're orphaned due to an extension update
    // we can detach the mutation observer
    iframeObserver.takeRecords();
    iframeObserver.disconnect();
    iframeObserver = null;
    // we can detach event listeners
    document.removeEventListener('DOMContentLoaded', onDOMContentLoaded);
    // we can't detach chrome.runtime.onMessage because it's no longer connected internally

    // we can destroy global functions in this context to free up memory
    [
      'addDocumentStylesToAllIFrames',
      'addDocumentStylesToIFrame',
      'addStyleElement',
      'addStyleToIFrameSrcDoc',
      'applyOnMessage',
      'applySections',
      'applyStyles',
      'doDisableAll',
      'getDynamicIFrames',
      'processDynamicIFrames',
      'iframeIsDynamic',
      'iframeIsLoadingSrcDoc',
      'initObserver',
      'removeStyle',
      'replaceAll',
      'replaceAllpass2',
      'requestStyles',
      'retireStyle'
    ].forEach(fn => (window[fn] = null));

    // we can destroy global variables
    styleElements = iframeObserver = retiredStyleIds = null;
  }
}
