/*
global messageBox resolveWith
gloabl editor showHelp getSectionsHashes
global popupExclusions
*/
'use strict';

const exclusions = (() => {

  // `\S*\*\S*` => `foo*`, `*bar`, `f*bar`
  // `\S+\.\S+` => `foo.bar`, `f.b`
  // see https://regex101.com/r/NUuwiu/2
  const validExclusionRegex = /^(\S*\*\S*|\S+\.\S+)$/;
  // ms to wait before validating user input
  const saveDelay = 250;

  // get exclusions from a select element
  function get() {
    const list = {};
    $$('#excluded-wrap input').forEach(input => {
      const url = input.value;
      if (url && validExclusionRegex.test(url)) {
        list[url] = createRegExp(url);
      }
    });
    exclusions.list = Object.keys(list).sort().reduce((acc, ex) => {
      acc[ex] = list[ex];
      return acc;
    }, {});
    return exclusions.list;
  }

  function createRegExp(url) {
    // Include boundaries to prevent `e.c` from matching `google.com`
    const prefix = url.startsWith('^') ? '' : '\\b';
    const suffix = url.endsWith('$') ? '' : '\\b';
    // Only escape `.`; alter `*`; all other regex allowed
    return `${prefix}${url.replace(/\./g, '\\.').replace(/\*/g, '.*?')}${suffix}`;
  }

  function addExclusionEntry({container, value, insertAfter}) {
    const item = template.exclusionEntry.cloneNode(true);
    const input = $('input', item);
    const regex = validExclusionRegex.toString();
    input.value = value;
    input.setAttribute('pattern', regex.substring(1, regex.length - 1));
    if (insertAfter) {
      insertAfter.insertAdjacentElement('afterend', item);
    } else {
      container.appendChild(item);
    }
    input.focus();
  }

  function populateList() {
    // List should never be empty - need to add an empty input
    const list = exclusions.list.length ? exclusions.list : [''];
    const block = $('#excluded-wrap');
    block.textContent = '';
    const container = document.createDocumentFragment();
    list.sort().forEach(value => {
      addExclusionEntry({container, value});
    });
    block.appendChild(container);
  }

  function validateEntry(input) {
    const lists = Object.keys(get());
    const url = input.value;
    const index = $$('.exclusion-entry input:valid').indexOf(input);
    // Generic URL globs; e.g. "https://test.com/*" & "*.test.com"
    return !(lists.includes(url) && lists.indexOf(url) !== index) &&
      validExclusionRegex.test(url);
  }

  function updateList() {
    const list = get();
    const keys = Object.keys(list);
    if (exclusions.savedValue !== keys.join(',')) {
      exclusions.saveValue = keys.join(',');
      exclusions.list = list;
    }
    debounce(save, 100, {});
    updateStats();
  }

  function deleteExclusions(entry) {
    if ($('#excluded-wrap').children.length === 1) {
      const input = $('.exclusion-input', entry);
      input.value = '';
      input.focus();
    } else {
      const nextFocus = entry.previousElementSibling || entry.nextElementSibling;
      entry.parentNode.removeChild(entry);
      if (nextFocus) {
        $('input', nextFocus).focus();
      }
    }
    updateList();
  }

  function excludeAction(event) {
    event.preventDefault();
    const target = event.target;
    const entry = target.closest('.exclusion-entry');
    if (target.classList.contains('exclusion-add')) {
      addExclusionEntry({
        container: $('#excluded-wrap'),
        value: '',
        insertAfter: entry
      });
    } else if (target.classList.contains('exclusion-delete')) {
      deleteExclusions(entry);
    }
  }

  function excludeValidate(event) {
    const target = event.target;
    target.setCustomValidity('');
    target.title = '';
    if (target.matches(':valid')) {
      if (!validateEntry(target)) {
        target.setCustomValidity(t('exclusionsvalidateEntry'));
        target.title = t('exclusionsvalidateEntry');
      } else {
        updateList();
      }
    }
  }

  function updateStats() {
    const total = Object.keys(exclusions.list).length;
    $('#excluded-stats').textContent = total ? t('exclusionsStatus', [total]) : '';
  }

  function showExclusionHelp(event) {
    event.preventDefault();
    showHelp(t('exclusionsHelpTitle'), t('exclusionsHelp').replace(/\n/g, '<br>'), 'info');
  }

  function onRuntimeMessage(msg) {
    if (msg.method === 'exclusionsUpdated' && msg.style && msg.style.exclusions) {
      update({list: Object.keys(msg.style.exclusions), isUpdating: true});
      // update popup, if loaded
      if (typeof popupExclusions !== 'undefined') {
        popupExclusions.selectExclusions(msg.style.exclusions);
      }
    }
  }

  function update({list = exclusions.list, isUpdating}) {
    if (!isUpdating) {
      exclusions.list = list;
      populateList();
    }
    updateStats();
  }

  function save({id, exclusionList = get()}) {
    // get last saved version
    API.getStyles({id: id || exclusions.id}).then(([style]) => {
      style.exclusions = exclusionList;
      style.reason = 'exclusionsUpdated';
      API.saveStyle(style);
      notifyAllTabs({method: 'exclusionsUpdated', style, id});
    });
  }

  function init(style) {
    const block = $('#exclusions');
    const list = Object.keys(style.exclusions || {});
    const size = list.length;
    exclusions.id = style.id;
    exclusions.savedValue = list.join(',');
    exclusions.list = list;
    if (size) {
      block.setAttribute('open', true);
    } else {
      block.removeAttribute('open');
    }
    update({});

    $('#excluded-wrap').onclick = excludeAction;
    $('#excluded-wrap').oninput = event => debounce(excludeValidate, saveDelay, event);
    $('#excluded-list-help').onclick = showExclusionHelp;
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  }

  return {init, get, update, save, createRegExp};
})();
