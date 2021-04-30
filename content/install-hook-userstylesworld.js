'use strict';

(() => {
  function watchForStylusButton() {
    // Use 1 function so we won't have duplicate code around.
    const stylusQuery = () => document.querySelector('a#stylus');

    if (!stylusQuery()) {
      const stylusButtonObserver = new MutationObserver(() => {
        if (stylusQuery()) {
          stylusButtonObserver.disconnect();
          stylusQuery().remove();
        }
      });
      stylusButtonObserver.observe(document.body, {childList: true, subtree: true});
    } else {
      stylusQuery().remove();
    }
  }

  // Some trickery to make sure that the DOM is ready(document.body/document.head).
  // And can possibly observe it for a stylus button.

  function isDOMReady() {
    return document.readyState === 'complete' || document.readyState === 'interactive';
  }

  if (!isDOMReady()) {
    const onReadyStateChange = () => {
      if (isDOMReady()) {
        document.removeEventListener('readystatechange', onReadyStateChange);
        watchForStylusButton();
      }
    };
    document.addEventListener('readystatechange', onReadyStateChange);
  } else {
    watchForStylusButton();
  }

})();
