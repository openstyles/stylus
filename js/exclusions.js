/*
global messageBox resolveWith
gloabl editor showHelp onChange
*/
'use strict';

const exclusions = (() => {

  // get exclusions from a select element
  function get(options = {}) {
    const lists = {};
    const excluded = options.exclusions || getMultiOptions(options);
    excluded.forEach(list => {
      lists[list] = createRegExp(list);
    });
    return lists;
  }

  function createRegExp(url) {
    // returning a regex string; Object.assign is used on style & doesn't save RegExp
    return url.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/[*]/g, '.+?');
  }

  function getMultiOptions({select, selectedOnly, elements} = {}) {
    return [...(select || exclusions.select).children].reduce((acc, opt) => {
      if (selectedOnly && opt.selected) {
        acc.push(elements ? opt : opt.value);
      } else if (!selectedOnly) {
        acc.push(elements ? opt : opt.value);
      }
      return acc;
    }, []);
  }

  function populateSelect(options = []) {
    exclusions.select.textContent = '';
    const option = $create('option');
    options.forEach(value => {
      const opt = option.cloneNode();
      opt.value = value;
      opt.textContent = value;
      opt.title = value;
      exclusions.select.appendChild(opt);
    });
    exclusions.lastValue = exclusions.select.textContent;
  }

  function openInputDialog({title, callback, value = ''}) {
    messageBox({
      title,
      className: 'center',
      contents: [
        $create('div', {id: 'excludedError', textContent: '\xa0\xa0'}),
        $create('input', {type: 'text', id: 'excluded-input', value})
      ],
      buttons: [t('confirmOK'), t('confirmCancel')]
    });
    setTimeout(() => {
      const btn = $('#message-box-buttons button', messageBox.element);
      // not using onkeyup here because pressing enter to activate add/edit
      // button fires onkeyup here when user releases the key
      $('#excluded-input').onkeydown = event => {
        if (event.which === 13) {
          event.preventDefault();
          callback.apply(btn);
        }
      };
      btn.onclick = callback;
    }, 1);
  }

  function validateURL(url) {
    const lists = getMultiOptions();
    // Generic URL globs; e.g. "https://test.com/*" & "*.test.com"
    return !lists.includes(url) && /^(?:https?:\/\/)?([\w*]+\.)+[\w*./-]+/.test(url);
  }

  function addExclusion() {
    openInputDialog({
      title: t('exclusionsAddTitle'),
      callback: function () {
        const value = $('#excluded-input').value;
        if (value && validateURL(value)) {
          exclusions.select.appendChild($create('option', {value, innerText: value}));
          done();
          messageBox.listeners.button.apply(this);
        } else {
          const errorBox = $('#excludedError', messageBox.element);
          errorBox.textContent = t('exclusionsInvalidUrl');
          setTimeout(() => {
            errorBox.textContent = '';
          }, 5000);
        }
      }
    });
  }

  function editExclusion() {
    const value = exclusions.select.value;
    if (value) {
      openInputDialog({
        title: t('exclusionsAddTitle'),
        value,
        callback: function () {
          const newValue = $('#excluded-input').value;
          // only edit the first selected option
          const option = getMultiOptions({selectedOnly: true, elements: true})[0];
          if (newValue && validateURL(newValue) && option) {
            option.value = newValue;
            option.textContent = newValue;
            option.title = newValue;
            if (newValue !== value) {
              // make it dirty!
              exclusions.select.savedValue = '';
            }
            done();
            messageBox.listeners.button.apply(this);
          } else {
            const errorBox = $('#excludedError', messageBox.element);
            errorBox.textContent = t('exclusionsInvalidUrl');
            setTimeout(() => {
              errorBox.textContent = '';
            }, 5000);
          }
        }
      });
    }
  }

  function deleteExclusions() {
    const entries = getMultiOptions({selectedOnly: true, elements: true});
    if (entries.length) {
      messageBox
        .confirm(t('exclusionsDeleteConfirmation', [entries.length]))
        .then(ok => {
          if (ok) {
            entries.forEach(el => exclusions.select.removeChild(el));
            done();
          }
        });
    }
  }

  function excludeAction(event) {
    const target = event.target;
    if (target.id && target.id.startsWith('excluded-list-')) {
      // class "excluded-list-(add/edit/delete)" -> ['excluded', 'list', 'add']
      const type = target.id.split('-').pop();
      switch (type) {
        case 'add':
          addExclusion();
          break;
        case 'edit':
          editExclusion();
          break;
        case 'delete':
          deleteExclusions();
          break;
      }
    }
  }

  function done() {
    if (editor) {
      // make usercss dirty
      exclusions.select.onchange();
    } else {
      // make regular userstyle dirty
      onChange({target: exclusions.select});
    }
    updateStats();
  }

  function updateStats() {
    if (exclusions.select) {
      const excludedTotal = exclusions.select.children.length;
      const state = excludedTotal === 0;
      exclusions.select.setAttribute('size', excludedTotal || 1);
      $('#excluded-stats').textContent = state ? '' : t('exclusionsStatus', [excludedTotal]);
      toggleButtons(state);
    }
  }

  function toggleButtons(state = false) {
    const noSelection = exclusions.select.value === '';
    $('#excluded-list-edit').disabled = noSelection || state;
    $('#excluded-list-delete').disabled = noSelection || state;
  }

  function showExclusionHelp(event) {
    event.preventDefault();
    showHelp(t('exclusionsHelpTitle'), t('exclusionsHelp').replace(/\n/g, '<br>'), 'info');
  }

  function onRuntimeMessage(msg) {
    if (msg.method === 'styleUpdated' && msg.style && msg.style.exclusions && exclusions.select) {
      update(Object.keys(msg.style.exclusions));
    }
  }

  function update(list = exclusions.list) {
    populateSelect(list);
    updateStats();
  }

  function onchange(dirty) {
    exclusions.select.onchange = function () {
      dirty.modify('exclusions', exclusions.lastValue, exclusions.select.textContent);
    };
  }

  function save(style, dirty) {
    style.reason = 'exclusionsUpdate';
    API.saveStyle(style);
    if (dirty) {
      dirty.clear('exclusions');
    }
  }

  function init(style) {
    const list = Object.keys(style.exclusions || {});
    const size = list.length;
    exclusions.select = $('#excluded-list');
    exclusions.select.savedValue = String(size);
    exclusions.list = list;
    update();

    $('#excluded-wrap').onclick = excludeAction;
    $('#excluded-list-help').onclick = showExclusionHelp;
    // Disable Edit & Delete buttons if nothing selected
    exclusions.select.onclick = () => toggleButtons();
    document.head.appendChild($create('style', `
      #excluded-list:empty:after {
        content: "${t('exclusionsEmpty')}";
      }
    `));
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  }

  return {init, get, update, onchange, save, createRegExp, getMultiOptions};
})();
