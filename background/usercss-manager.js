/* global API */// msg.js
/* global RX_META deepCopy download */// toolbox.js
'use strict';

const usercssMan = {

  GLOBAL_META: Object.entries({
    author: null,
    description: null,
    homepageURL: 'url',
    updateURL: 'updateUrl',
    name: null,
  }),

  async assignVars(style, oldStyle) {
    const meta = style.usercssData;
    const vars = meta.vars;
    const oldVars = (oldStyle.usercssData || {}).vars;
    if (vars && oldVars) {
      // The type of var might be changed during the update. Set value to null if the value is invalid.
      for (const [key, v] of Object.entries(vars)) {
        const old = oldVars[key] && oldVars[key].value;
        if (old) v.value = old;
      }
      meta.vars = await API.worker.nullifyInvalidVars(vars);
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
    const style = await usercssMan.buildMeta({sourceCode});
    const dup = (checkDup || assignVars) &&
      await usercssMan.find(styleId ? {id: styleId} : style);
    let log;
    if (!metaOnly) {
      if (vars || assignVars) {
        await usercssMan.assignVars(style, vars ? {usercssData: {vars}} : dup);
      }
      await usercssMan.buildCode(style);
      log = style.log; // extracting the non-enumerable prop, otherwise it won't survive messaging
    }
    return {style, dup, log};
  },

  async buildCode(style) {
    const {sourceCode: code, usercssData: {vars, preprocessor}} = style;
    const match = code.match(RX_META);
    const i = match.index;
    const j = i + match[0].length;
    const codeNoMeta = code.slice(0, i) + blankOut(code, i, j) + code.slice(j);
    const {sections, errors, log} = await API.worker.compileUsercss(preprocessor, codeNoMeta, vars);
    const recoverable = errors.every(e => e.recoverable);
    if (!sections.length || !recoverable) {
      throw !recoverable ? errors : 'Style does not contain any actual CSS to apply.';
    }
    style.sections = sections;
    // adding a non-enumerable prop so it won't be written to storage
    if (log) Object.defineProperty(style, 'log', {value: log});
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
    const match = code.match(RX_META);
    if (!match) {
      return Promise.reject(new Error('Could not find metadata.'));
    }
    try {
      code = blankOut(code, 0, match.index) + match[0];
      const {metadata} = await API.worker.parseUsercssMeta(code);
      style.usercssData = metadata;
      // https://github.com/openstyles/stylus/issues/560#issuecomment-440561196
      for (const [key, globalKey] of usercssMan.GLOBAL_META) {
        const val = metadata[key];
        if (val !== undefined) {
          style[globalKey || key] = val;
        }
      }
      return style;
    } catch (err) {
      if (err.code) {
        const args = err.code === 'missingMandatory' || err.code === 'missingChar'
          ? err.args.map(e => e.length === 1 ? JSON.stringify(e) : e).join(', ')
          : err.args;
        const msg = chrome.i18n.getMessage(`meta_${(err.code)}`, args);
        if (msg) err.message = msg;
      }
      return Promise.reject(err);
    }
  },

  async configVars(id, vars) {
    const style = deepCopy(await API.styles.get(id));
    style.usercssData.vars = vars;
    await usercssMan.buildCode(style);
    return (await API.styles.install(style, 'config'))
      .usercssData.vars;
  },

  async editSave(style) {
    style = await usercssMan.parse(style);
    return {
      log: style.log, // extracting the non-enumerable prop, otherwise it won't survive messaging
      style: await API.styles.editSave(style),
    };
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
    return API.styles.install(await usercssMan.parse(style));
  },

  async parse(style) {
    style = await usercssMan.buildMeta(style);
    // preserve style.vars during update
    const dup = await usercssMan.find(style);
    if (dup) {
      style.id = dup.id;
      await usercssMan.assignVars(style, dup);
    }
    return usercssMan.buildCode(style);
  },
};

/** Replaces everything with spaces to keep the original length,
 * but preserves the line breaks to keep the original line/col relation */
function blankOut(str, start = 0, end = str.length) {
  return str.slice(start, end).replace(/[^\r\n]/g, ' ');
}
