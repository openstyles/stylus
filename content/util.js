'use strict';

function runtimeSend(request) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      request,
      ({status, result}) => (status === 'error' ? reject : resolve)(result)
    );
  });
}
