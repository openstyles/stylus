'use strict';

function runtimeSend(request) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      request,
      ({success, result}) => (success ? resolve : reject)(result)
    );
  });
}
