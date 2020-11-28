/* global API */
/* exported usercss */
'use strict';

const usercss = (() => {
  const GLOBAL_METAS = {
    author: undefined,
    description: undefined,
    homepageURL: 'url',
    updateURL: 'updateUrl',
    name: undefined,
  };
  const RX_META = /\/\*!?\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i;
  const ERR_ARGS_IS_LIST = new Set(['missingMandatory', 'missingChar']);

  return {

    RX_META,

    // Methods are sorted alphabetically

    async assignVars(style, oldStyle) {
      const vars = style.usercssData.vars;
      const oldVars = oldStyle.usercssData.vars;
      if (vars && oldVars) {
        // The type of var might be changed during the update. Set value to null if the value is invalid.
        for (const [key, v] of Object.entries(vars)) {
          const old = oldVars[key] && oldVars[key].value;
          if (old) v.value = old;
        }
        style.usercssData.vars = await API.worker.nullifyInvalidVars(vars);
      }
    },

    async buildCode(style) {
      const {sourceCode: code, usercssData: {vars, preprocessor}} = style;
      const match = code.match(RX_META);
      const codeNoMeta = code.slice(0, match.index) + code.slice(match.index + match[0].length);
      const {sections, errors} = API.worker.compileUsercss(preprocessor, codeNoMeta, vars);
      const recoverable = errors.every(e => e.recoverable);
      if (!sections.length || !recoverable) {
        throw !recoverable ? errors : 'Style does not contain any actual CSS to apply.';
      }
      style.sections = sections;
      return style;
    },

    async buildMeta(sourceCode) {
      sourceCode = sourceCode.replace(/\r\n?/g, '\n');
      const style = {
        enabled: true,
        sections: [],
        sourceCode,
      };
      const match = sourceCode.match(RX_META);
      if (!match) {
        return Promise.reject(new Error('Could not find metadata.'));
      }
      try {
        const {metadata} = await API.worker.parseUsercssMeta(match[0], match.index);
        style.usercssData = metadata;
        // https://github.com/openstyles/stylus/issues/560#issuecomment-440561196
        for (const [key, value] of Object.entries(GLOBAL_METAS)) {
          if (metadata[key] !== undefined) {
            style[value || key] = metadata[key];
          }
        }
        return style;
      } catch (err) {
        if (err.code) {
          const args = ERR_ARGS_IS_LIST.has(err.code)
            ? err.args.map(e => e.length === 1 ? JSON.stringify(e) : e).join(', ')
            : err.args;
          const msg = chrome.i18n.getMessage(`meta_${err.code}`, args);
          if (msg) err.message = msg;
        }
        return Promise.reject(err);
      }
    },
  };
})();
