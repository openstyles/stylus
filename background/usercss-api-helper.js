'use strict';

define(require => {
  const {API} = require('/js/msg');
  const {deepCopy, download} = require('/js/toolbox');

  const GLOBAL_METAS = {
    author: undefined,
    description: undefined,
    homepageURL: 'url',
    updateURL: 'updateUrl',
    name: undefined,
  };
  const ERR_ARGS_IS_LIST = [
    'missingMandatory',
    'missingChar',
  ];

  /**
   * @type UsercssHelper
   * @namespace UsercssHelper
   */
  const usercss = {

    rxMETA: /\/\*!?\s*==userstyle==[\s\S]*?==\/userstyle==\s*\*\//i,

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

    async build({
      styleId,
      sourceCode,
      vars,
      checkDup,
      metaOnly,
      assignVars,
      initialUrl,
    }) {
      // downloading here while install-usercss page is loading to avoid the wait
      if (initialUrl) sourceCode = await download(initialUrl);
      const style = await usercss.buildMeta({sourceCode});
      const dup = (checkDup || assignVars) &&
        await usercss.find(styleId ? {id: styleId} : style);
      if (!metaOnly) {
        if (vars || assignVars) {
          await usercss.assignVars(style, vars ? {usercssData: {vars}} : dup);
        }
        await usercss.buildCode(style);
      }
      return {style, dup};
    },

    async buildCode(style) {
      const {sourceCode: code, usercssData: {vars, preprocessor}} = style;
      const match = code.match(usercss.rxMETA);
      const i = match.index;
      const j = i + match[0].length;
      const codeNoMeta = code.slice(0, i) + blankOut(code, i, j) + code.slice(j);
      const {sections, errors} = await API.worker.compileUsercss(preprocessor, codeNoMeta, vars);
      const recoverable = errors.every(e => e.recoverable);
      if (!sections.length || !recoverable) {
        throw !recoverable ? errors : 'Style does not contain any actual CSS to apply.';
      }
      style.sections = sections;
      return style;
    },

    async buildMeta(style) {
      if (style.usercssData) {
        return style;
      }
      // remember normalized sourceCode
      let code = style.sourceCode = style.sourceCode.replace(/\r\n?/g, '\n');
      style = Object.assign({
        enabled: true,
        sections: [],
      }, style);
      const match = code.match(usercss.rxMETA);
      if (!match) {
        return Promise.reject(new Error('Could not find metadata.'));
      }
      try {
        code = blankOut(code, 0, match.index) + match[0];
        const {metadata} = await API.worker.parseUsercssMeta(code);
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
          const args = ERR_ARGS_IS_LIST.includes(err.code)
            ? err.args.map(e => e.length === 1 ? JSON.stringify(e) : e).join(', ')
            : err.args;
          const msg = chrome.i18n.getMessage(`meta_${err.code}`, args);
          if (msg) err.message = msg;
        }
        return Promise.reject(err);
      }
    },

    async configVars(id, vars) {
      let style = deepCopy(await API.styles.get(id));
      style.usercssData.vars = vars;
      await usercss.buildCode(style);
      style = await API.styles.install(style, 'config');
      return style.usercssData.vars;
    },

    async editSave(style) {
      return API.styles.editSave(await usercss.parse(style));
    },

    async find(styleOrData) {
      if (styleOrData.id) {
        return API.styles.get(styleOrData.id);
      }
      const {name, namespace} = styleOrData.usercssData || styleOrData;
      for (const dup of await API.styles.getAll()) {
        const data = dup.usercssData;
        if (data &&
          data.name === name &&
          data.namespace === namespace) {
          return dup;
        }
      }
    },

    async install(style) {
      return API.styles.install(await usercss.parse(style));
    },

    async parse(style) {
      style = await usercss.buildMeta(style);
      // preserve style.vars during update
      const dup = await usercss.find(style);
      if (dup) {
        style.id = dup.id;
        await usercss.assignVars(style, dup);
      }
      return usercss.buildCode(style);
    },
  };

  /** Replaces everything with spaces to keep the original length,
   * but preserves the line breaks to keep the original line/col relation */
  function blankOut(str, start = 0, end = str.length) {
    return str.slice(start, end).replace(/[^\r\n]/g, ' ');
  }

  return usercss;
});
