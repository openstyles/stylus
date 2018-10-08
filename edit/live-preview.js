'use strict';

function createLivePreview() {
  let data;
  let previewer;
  let hidden;
  let node;
  document.addEventListener('DOMContentLoaded', () => {
    node = $('#preview-label');
    if (hidden !== undefined) {
      node.classList.toggle('hidden', hidden);
    }
  }, {once: true});
  prefs.subscribe(['editor.livePreview'], (key, value) => {
    if (value && data && data.id && data.enabled) {
      previewer = createPreviewer;
      previewer.update(data);
    }
    if (!value && previewer) {
      previewer.disconnect();
      previewer = null;
    }
  });
  return {update, show};

  function show(state) {
    if (hidden === !state) {
      return;
    }
    hidden = !state;
    if (node) {
      node.classList.toggle('hidden', hidden);
    }
  }

  function update(_data) {
    data = _data;
    if (!previewer) {
      if (!data.id || !data.enabled) {
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
    port.onDisconnet.addListener(err => {
      throw err;
    });
    return {update, disconnect};

    function update(data) {
      port.postMessage(data);
    }

    function disconnect() {
      port.disconnect();
    }
  }
}
