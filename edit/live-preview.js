'use strict';

function createLivePreview() {
  let previewer;
  return {update};

  function update(data) {
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
    return {update};

    function update(data) {
      port.postMessage(data);
    }
  }
}
