/* global msg */
/* global prefs */
'use strict';

window.onMessageExternal = function ({data, target}, sender, sendResponse) {
  // Check origin
  if (!sender.id || sender.id !== chrome.runtime.id
    && !prefs.get('externals.allowedExtensionIds').includes(sender.id)
  ) {
    return;
  }

  const allowedAPI =
    ['openEditor', 'openManage', 'styles', 'sync', 'updater', 'usercss', 'usw'];
  // Check content
  if (target === 'extension' && data && data.method === 'invokeAPI'
    && data.path && allowedAPI.includes(data.path[0])
  ) {
    msg._onRuntimeMessage({data, target}, sender, sendResponse);
  }
};
