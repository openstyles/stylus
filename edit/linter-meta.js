/* global linter */
'use strict';

function createMetaCompiler(cm) {
  const updateListeners = [];
  let meta = null;
  let metaIndex = null;
  let cache = [];

  linter.register((text, options, _cm) => {
    if (_cm !== cm) {
      return;
    }
    const match = text.match(/\/\*\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i);
    if (!match) {
      return [];
    }
    if (match[0] === meta && match.index === metaIndex) {
      return cache;
    }
    return API.parseUsercss({sourceCode: match[0], metaOnly: true})
      .then(result => result.usercssData)
      .then(result => {
        for (const cb of updateListeners) {
          cb(result);
        }
        meta = match[0];
        metaIndex = match.index;
        cache = [];
        return cache;
      }, err => {
        meta = match[0];
        metaIndex = match.index;
        cache = [{
          from: cm.posFromIndex((err.index || 0) + match.index),
          to: cm.posFromIndex((err.index || 0) + match.index),
          message: err.message,
          severity: 'error'
        }];
        return cache;
      });
  });

  return {
    onUpdated: cb => updateListeners.push(cb)
  };
}
