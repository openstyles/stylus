/* exported promisify */
'use strict';
/*
Convert chrome APIs into promises. Example:

  const storageSyncGet = promisify(chrome.storage.sync.get.bind(chrome.storage.sync));
  storageSyncGet(['key']).then(result => {...});

*/
function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      fn(...args, (...result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(
          result.length === 0 ? undefined :
          result.length === 1 ? result[0] : result
        );
      });
    });
}
