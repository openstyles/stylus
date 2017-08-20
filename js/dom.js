'use strict';

if (!navigator.userAgent.includes('Windows')) {
  document.documentElement.classList.add('non-windows');
}

// polyfill for old browsers to enable [...results] and for-of
for (const type of [NodeList, NamedNodeMap, HTMLCollection, HTMLAllCollection]) {
  if (!type.prototype[Symbol.iterator]) {
    type.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
  }
}

{
  // display a full text tooltip on buttons with ellipsis overflow and no inherent title
  const addTooltipsToEllipsized = () => {
    for (const btn of document.getElementsByTagName('button')) {
      if (btn.title && !btn.titleIsForEllipsis ||
          btn.clientWidth === btn.preresizeClientWidth) {
        continue;
      }
      btn.preresizeClientWidth = btn.clientWidth;
      const padding = btn.offsetWidth - btn.clientWidth;
      const displayedWidth = btn.getBoundingClientRect().width - padding;
      if (btn.scrollWidth > displayedWidth) {
        btn.title = btn.textContent;
        btn.titleIsForEllipsis = true;
      } else if (btn.title) {
        btn.title = '';
      }
    }
  };
  // enqueue after DOMContentLoaded/load events
  setTimeout(addTooltipsToEllipsized);
  // throttle on continuous resizing
  window.addEventListener('resize', () => debounce(addTooltipsToEllipsized, 100));
}

// add favicon in Firefox
// eslint-disable-next-line no-unused-expressions
navigator.userAgent.includes('Firefox') && setTimeout(() => {
  dieOnDysfunction();
  const iconset = ['', 'light/'][prefs.get('iconset')] || '';
  for (const size of [38, 32, 19, 16]) {
    document.head.appendChild($element({
      tag: 'link',
      rel: 'icon',
      href: `/images/icon/${iconset}${size}.png`,
      sizes: size + 'x' + size,
    }));
  }
  // set hyphenation language
  document.documentElement.setAttribute('lang', chrome.i18n.getUILanguage());
});


function onDOMready() {
  if (document.readyState !== 'loading') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', function _() {
      document.removeEventListener('DOMContentLoaded', _);
      resolve();
    });
  });
}


function onDOMscripted(scripts) {
  if (scripts) {
    return new Promise(resolve => {
      addResolver(resolve);
      onDOMscripted.scriptQueue = scripts;
      loadNextScript();
    });
  }
  if (onDOMscripted.scriptQueue) {
    return new Promise(resolve => addResolver(resolve));
  }
  if (document.readyState !== 'loading') {
    if (onDOMscripted.resolveOnReady) {
      onDOMscripted.resolveOnReady.forEach(r => r());
      onDOMscripted.resolveOnReady = null;
    }
    return Promise.resolve();
  }
  return onDOMready().then(onDOMscripted);

  function loadNextScript() {
    const next = onDOMscripted.scriptQueue.shift();
    if (!next) {
      onDOMscripted.scriptQueue = null;
      onDOMscripted();
    } else if (typeof next === 'function') {
      Promise.resolve(next())
        .then(loadNextScript);
    } else {
      Promise.all(
        (next instanceof Array ? next : [next]).map(next =>
          typeof next === 'function'
            ? next()
            : injectScript({src: next, async: true})
        )
      ).then(loadNextScript);
    }
  }

  function addResolver(r) {
    if (!onDOMscripted.resolveOnReady) {
      onDOMscripted.resolveOnReady = [];
    }
    onDOMscripted.resolveOnReady.push(r);
  }
}


function injectScript(properties) {
  if (typeof properties === 'string') {
    properties = {src: properties};
  }
  if (!properties || !properties.src) {
    return;
  }
  const script = document.head.appendChild(document.createElement('script'));
  Object.assign(script, properties);
  if (!properties.onload) {
    return new Promise(resolve => {
      script.onload = () => {
        script.onload = null;
        resolve();
      };
    });
  }
}


function injectCSS(url) {
  if (!url) {
    return;
  }
  document.head.appendChild($element({
    tag: 'link',
    rel: 'stylesheet',
    href: url
  }));
}


function scrollElementIntoView(element) {
  // align to the top/bottom of the visible area if wasn't visible
  const bounds = element.getBoundingClientRect();
  if (bounds.top < 0 || bounds.top > innerHeight - bounds.height) {
    element.scrollIntoView(bounds.top < 0);
  }
}


function animateElement(
  element, {
    className = 'highlight',
    removeExtraClasses = [],
    remove = false,
  } = {}) {
  return element && new Promise(resolve => {
    element.addEventListener('animationend', function _() {
      element.removeEventListener('animationend', _);
      element.classList.remove(
        className,
        // In Firefox, `resolve()` might be called one frame later.
        // This is helpful to clean-up on the same frame
        ...removeExtraClasses
      );
      // TODO: investigate why animation restarts if the elements is removed in .then()
      if (remove) {
        element.remove();
      }
      resolve();
    });
    element.classList.add(className);
  });
}


function enforceInputRange(element) {
  const min = Number(element.min);
  const max = Number(element.max);
  const doNotify = () => element.dispatchEvent(new Event('change', {bubbles: true}));
  const onChange = ({type}) => {
    if (type === 'input' && element.checkValidity()) {
      doNotify();
    } else if (type === 'change' && !element.checkValidity()) {
      element.value = Math.max(min, Math.min(max, Number(element.value)));
      doNotify();
    }
  };
  element.addEventListener('change', onChange);
  element.addEventListener('input', onChange);
}


function $(selector, base = document) {
  // we have ids with . like #manage.onlyEnabled which looks like #id.class
  // so since getElementById is superfast we'll try it anyway
  const byId = selector.startsWith('#') && document.getElementById(selector.slice(1));
  return byId || base.querySelector(selector);
}


function $$(selector, base = document) {
  return [...base.querySelectorAll(selector)];
}


function $element(opt) {
  // tag:              string, default 'div', may include namespace like 'ns#tag'
  // appendChild:      element/string or an array of elements/strings
  // dataset:          object
  // any DOM property: assigned as is
  const [ns, tag] = opt.tag && opt.tag.includes('#')
    ? opt.tag.split('#')
    : [null, opt.tag];
  const element = ns
    ? document.createElementNS(ns === 'SVG' || ns === 'svg' ? 'http://www.w3.org/2000/svg' : ns, tag)
    : document.createElement(tag || 'div');
  const children = opt.appendChild instanceof Array ? opt.appendChild : [opt.appendChild];
  for (const child of children) {
    if (child) {
      element.appendChild(child instanceof Node ? child : document.createTextNode(child));
    }
  }
  delete opt.appendChild;
  delete opt.tag;
  if (opt.dataset) {
    Object.assign(element.dataset, opt.dataset);
    delete opt.dataset;
  }
  if (ns) {
    for (const attr in opt) {
      element.setAttributeNS(null, attr, opt[attr]);
    }
  } else {
    Object.assign(element, opt);
  }
  return element;
}


function dieOnDysfunction() {
  function die() {
    location.href = '/msgbox/dysfunctional.html';
    throw 0;
  }
  (() => {
    try {
      return indexedDB;
    } catch (e) {
      die();
    }
  })();
  Object.assign(indexedDB.open('test'), {
    onerror: die,
    onupgradeneeded: indexedDB.deleteDatabase('test'),
  });
  // TODO: fallback to sendMessage in FF since private windows can't get bg page
  chrome.windows.getCurrent(wnd => wnd.incognito && die());
  // check if privacy settings were fixed but the extension wasn't reloaded
  const bg = chrome.extension.getBackgroundPage();
  if (bg && !(bg.cachedStyles || {}).list) {
    chrome.runtime.reload();
  }
}
