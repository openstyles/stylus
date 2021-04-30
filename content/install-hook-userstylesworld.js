'use strict';

(() => {
  const allowedOrigin = 'https://userstyles.world';

  const onPageLoaded = event => {
    if (event.data
    && event.data.type === 'usw-remove-stylus-button'
    && allowedOrigin === event.origin
    ) {
      document.querySelector('a#stylus').remove();
    }
  };

  window.addEventListener('message', onPageLoaded);
})();
