/* global linter */
'use strict';

function createMetaCompiler(cm) {
  const successCallbacks = [];
  let meta = null;
  let cache = [];

  linter.register((text, options, _cm) => {
    if (_cm !== cm) {
      return;
    }
    const match = text.match(/\/\*\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i);
    if (!match) {
      return [];
    }
    if (match[0] === meta) {
      return cache;
    }
    return parseMeta(match[0])
      .then(result => {
        for (const cb of successCallbacks) {
          cb(result);
        }
        meta = match[0];
        cache = [];
        return cache;
      }, err => {
        meta = match[0];
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
    onSuccess: cb => successCallbacks.push(cb)
  };

  function parseMeta(meta) {
    return API.parseUsercss({sourceCode: meta, metaOnly: true})
      .then(result => result.usercssData);
  }
}
