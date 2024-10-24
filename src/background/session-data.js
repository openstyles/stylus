import {chromeSession} from '/js/storage-util';
import {debounce, deepEqual, deepMerge, isEmptyObj, isObject} from '/js/util';

let sessionDataSaved;
let sessionDataToWrite;
export let sessionData = process.env.MV3 && (async () => {
  sessionData = new Proxy(await chrome.storage.session.get(), {
    set(target, key, val) {
      const obj = isObject(val);
      if (obj ? !deepEqual(val, target[key]) : val !== target[key]) {
        target[key] = val;
        if (obj ? !deepEqual(val, sessionDataSaved[key]) : val !== sessionDataSaved[key]) {
          (sessionDataToWrite ??= {})[key] = val;
          debounce(updateSessionStorage);
        } else if (sessionDataToWrite) {
          delete sessionDataToWrite[key];
        }
      }
      return true;
    },
  });
  sessionDataSaved = deepMerge(sessionData);
})();

function updateSessionStorage() {
  if (sessionDataToWrite && !isEmptyObj(sessionDataToWrite)) {
    chromeSession.set(sessionDataToWrite);
    deepMerge(sessionDataToWrite, sessionDataSaved);
  }
  sessionDataToWrite = null;
}
