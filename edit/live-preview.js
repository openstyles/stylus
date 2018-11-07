/* global messageBox editor $ prefs */
/* exported createLivePreview */
'use strict';

function createLivePreview(preprocess) {
  let data;
  let previewer;
  let enabled = prefs.get('editor.livePreview');
  const label = $('#preview-label');
  const errorContainer = $('#preview-errors');

  prefs.subscribe(['editor.livePreview'], (key, value) => {
    if (value && data && data.id && data.enabled) {
      previewer = createPreviewer();
      previewer.update(data);
    }
    if (!value && previewer) {
      previewer.disconnect();
      previewer = null;
    }
    enabled = value;
  });
  return {update, show};

  function show(state) {
    label.classList.toggle('hidden', !state);
  }

  function update(_data) {
    data = _data;
    if (!previewer) {
      if (!data.id || !data.enabled || !enabled) {
        return;
      }
      previewer = createPreviewer();
    }
    previewer.update(data);
  }

  function createPreviewer() {
    const port = chrome.runtime.connect({
      name: 'livePreview'
    });
    port.onDisconnect.addListener(err => {
      throw err;
    });
    return {update, disconnect};

    function update(data) {
      Promise.resolve()
        .then(() => preprocess ? preprocess(data) : data)
        .then(data => port.postMessage(data))
        .then(
          () => errorContainer.classList.add('hidden'),
          err => {
            if (Array.isArray(err)) {
              err = err.join('\n');
            } else if (err && err.index !== undefined) {
              // FIXME: this would fail if editors[0].getValue() !== data.sourceCode
              const pos = editor.getEditors()[0].posFromIndex(err.index);
              err.message = `${pos.line}:${pos.ch} ${err.message || String(err)}`;
            }
            errorContainer.classList.remove('hidden');
            errorContainer.onclick = () => messageBox.alert(err.message || String(err), 'pre');
          }
        );
    }

    function disconnect() {
      port.disconnect();
    }
  }
}
