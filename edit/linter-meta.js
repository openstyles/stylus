/* global linter editorWorker */
/* exported createMetaCompiler */
'use strict';

/**
 * @param {CodeMirror} cm
 * @param {function(meta:Object)} onUpdated
 */
function createMetaCompiler(cm, onUpdated) {
  let meta = null;
  let metaIndex = null;
  let cache = [];

  linter.register((text, options, _cm) => {
    if (_cm !== cm) {
      return;
    }
    const match = text.match(/\/\*!?\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i);
    if (!match) {
      return [];
    }
    if (match[0] === meta && match.index === metaIndex) {
      return cache;
    }
    return editorWorker.metalint(match[0])
      .then(({metadata, errors}) => {
        if (errors.every(err => err.code === 'unknownMeta')) {
          onUpdated(metadata);
        }
        cache = errors.map(err =>
          ({
            from: cm.posFromIndex((err.index || 0) + match.index),
            to: cm.posFromIndex((err.index || 0) + match.index),
            message: err.code && chrome.i18n.getMessage(`meta_${err.code}`, err.args) || err.message,
            severity: err.code === 'unknownMeta' ? 'warning' : 'error',
            rule: err.code
          })
        );
        meta = match[0];
        metaIndex = match.index;
        return cache;
      });
  });
}
