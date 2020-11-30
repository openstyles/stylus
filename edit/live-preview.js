'use strict';

define(require => {
  const {$, messageBoxProxy} = require('/js/dom');
  const prefs = require('/js/prefs');
  const editor = require('./editor');

  let data;
  let port;
  let preprocess;
  let enabled = prefs.get('editor.livePreview');

  prefs.subscribe('editor.livePreview', (key, value) => {
    if (!value) {
      disconnectPreviewer();
    } else if (data && data.id && (data.enabled || editor.dirty.has('enabled'))) {
      createPreviewer();
      updatePreviewer(data);
    }
    enabled = value;
  });

  const livePreview = {

    /**
     * @param {Function} [fn] - preprocessor
     * @param {boolean} [show]
     */
    init(fn, show) {
      preprocess = fn;
      if (show != null) {
        livePreview.show(show);
      }
    },

    show(state) {
      $('#preview-label').classList.toggle('hidden', !state);
    },

    update(newData) {
      data = newData;
      if (!port) {
        if (!data.id || !data.enabled || !enabled) {
          return;
        }
        createPreviewer();
      }
      updatePreviewer(data);
    },
  };

  function createPreviewer() {
    port = chrome.runtime.connect({name: 'livePreview'});
    port.onDisconnect.addListener(throwError);
  }

  function disconnectPreviewer() {
    if (port) {
      port.disconnect();
      port = null;
    }
  }

  function throwError(err) {
    throw err;
  }

  async function updatePreviewer(data) {
    const errorContainer = $('#preview-errors');
    try {
      port.postMessage(preprocess ? await preprocess(data) : data);
      errorContainer.classList.add('hidden');
    } catch (err) {
      if (Array.isArray(err)) {
        err = err.join('\n');
      } else if (err && err.index != null) {
        // FIXME: this would fail if editors[0].getValue() !== data.sourceCode
        const pos = editor.getEditors()[0].posFromIndex(err.index);
        err.message = `${pos.line}:${pos.ch} ${err.message || err}`;
      }
      errorContainer.classList.remove('hidden');
      errorContainer.onclick = () => {
        messageBoxProxy.alert(err.message || `${err}`, 'pre');
      };
    }
  }

  return livePreview;
});
