/*
global messageBox
global exclusions
*/
'use strict';

const popupExclusions = (() => {

  // return matches on url ending to prevent duplicates in the exclusion list
  // e.g. http://test.com and http://test.com/* are equivalent
  // this function would return ['', '/*']
  function exclusionExists(array, value) {
    const match = [];
    ['', '*', '/', '/*'].forEach(ending => {
      if (array.includes(value + ending)) {
        match.push(ending);
      }
    });
    return match;
  }

  /* Modal in Popup.html */
  function processURL(url) {
    const results = [];
    const protocol = url.match(/\w+:\/\//);
    // remove ending '/', protocol, hash & search strings
    const parts = url.replace(/\/$/, '').replace(/(\w+:\/\/|[#?].*$)/g, '').split('/');
    const domain = parts[0].split('.');
    /*
    Domain: a.b.com
    Domain: b.com
    Prefix: https://a.b.com
    Prefix: https://a.b.com/current
    Prefix: https://a.b.com/current/page
    */
    while (parts.length > 1) {
      results.push([t('excludedPrefix'), protocol + parts.join('/')]);
      parts.pop();
    }
    while (domain.length > 1) {
      results.push([t('excludedDomain'), domain.join('.')]);
      domain.shift();
    }
    return results.reverse();
  }

  function shortenURL(text) {
    const len = text.length;
    let prefix = '\u2026';
    // account for URL that end with a '/'
    let index = (text.endsWith('/') ? text.substring(0, len - 1) : text).lastIndexOf('/');
    if (index < 0 || len - index < 2) {
      index = 0;
      prefix = '';
    }
    return prefix + text.substring(index, len);
  }

  function createOption(option) {
    // ["Domain/Prefix", "{url}"]
    return $create('option', {
      value: option[1],
      title: option[1],
      textContent: `${option[0]}: ${shortenURL(option[1])}`
    });
  }

  function getMultiOptions({select, selectedOnly} = {}) {
    return [...select.children].reduce((acc, opt) => {
      if (selectedOnly && opt.selected || !selectedOnly) {
        acc.push(opt.value);
      }
      return acc;
    }, []);
  }

  function updatePopupContent(url) {
    const options = processURL(url);
    const renderBin = document.createDocumentFragment();
    options.map(option => renderBin.appendChild(createOption(option)));
    $('#popup-exclusions').textContent = '';
    $('#popup-exclusions').appendChild(renderBin);
  }

  function getIframeURLs(style) {
    getActiveTab().then(tab => {
      if (tab && tab.status === 'complete') {
        chrome.webNavigation.getAllFrames({
          tabId: tab.id
        }, frames => {
          const urls = frames.reduce((acc, frame) => [...acc, ...processURL(frame.url)], []);
          updateSelections(style, urls);
        });
      }
    });
  }

  function selectExclusions(exclusions) {
    const select = $('#exclude select');
    const excludes = Object.keys(exclusions || {});
    [...select.children].forEach(option => {
      if (exclusionExists(excludes, option.value).length) {
        option.selected = true;
      }
    });
  }

  function updateSelections(style, newOptions = []) {
    const wrap = $('#exclude');
    const select = $('select', wrap);
    if (newOptions.length) {
      const currentOptions = [...select.children].map(opt => opt.value);
      newOptions.forEach(opt => {
        if (!currentOptions.includes(opt[1])) {
          select.appendChild(createOption(opt));
          // newOptions may have duplicates (e.g. multiple iframes from same source)
          currentOptions.push(opt[1]);
        }
      });
      select.size = select.children.length;
      // hide select, then calculate & adjust height
      select.style.height = '0';
      document.body.style.height = `${select.scrollHeight + wrap.offsetHeight}px`;
      select.style.height = '';
    }
    selectExclusions(style.exclusions);
  }

  function isExcluded(matchUrl, exclusions = {}) {
    const values = Object.values(exclusions);
    return values.length && values.some(exclude => tryRegExp(exclude).test(matchUrl));
  }

  function openPopupDialog(entry, tabURL) {
    const style = entry.styleMeta;
    updateSelections(style, updatePopupContent(tabURL));
    getIframeURLs(style);
    const box = $('#exclude');
    box.dataset.display = true;
    box.style.cssText = '';
    $('strong', box).textContent = style.name;
    $('[data-cmd="ok"]', box).focus();
    $('[data-cmd="ok"]', box).onclick = () => confirm(true);
    $('[data-cmd="cancel"]', box).onclick = () => confirm(false);
    window.onkeydown = event => {
      const keyCode = event.keyCode || event.which;
      if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
        && (keyCode === 13 || keyCode === 27)) {
        event.preventDefault();
        confirm(keyCode === 13);
      }
    };
    function confirm(ok) {
      window.onkeydown = null;
      animateElement(box, {
        className: 'lights-on',
        onComplete: () => (box.dataset.display = false),
      });
      document.body.style.height = '';
      if (ok) {
        handlePopupSave(style);
        entry.styleMeta = style;
        entry.classList.toggle('excluded', isExcluded(tabURL, style.exclusions));
      }
    }
    return Promise.resolve();
  }

  function handlePopupSave(style) {
    if (typeof style.exclusions === 'undefined') {
      style.exclusions = {};
    }
    const current = Object.keys(style.exclusions);
    const select = $('#popup-exclusions', messageBox.element);
    const all = getMultiOptions({select});
    const selected = getMultiOptions({select, selectedOnly: true});
    // Add exclusions
    selected.forEach(value => {
      let exists = exclusionExists(current, value);
      if (!exists.length) {
        style.exclusions[value] = exclusions.createRegExp(value);
        exists = [''];
      }
      exists.forEach(ending => {
        const index = all.indexOf(value + ending);
        if (index > -1) {
          all.splice(index, 1);
        }
      });
    });
    // Remove exclusions (unselected in popup modal)
    all.forEach(value => {
      exclusionExists(current, value).forEach(ending => {
        delete style.exclusions[value + ending];
      });
    });
    exclusions.save({
      id: style.id,
      exclusionList: style.exclusions
    });
  }

  return {openPopupDialog, selectExclusions, isExcluded};

})();
