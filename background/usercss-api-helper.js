/* global
  API
  deepCopy
  usercss
*/
'use strict';

API.usercss = {

  async build({
    styleId,
    sourceCode,
    vars,
    checkDup,
    metaOnly,
    assignVars,
  }) {
    let style = await usercss.buildMeta(sourceCode);
    const dup = (checkDup || assignVars) &&
      await API.usercss.find(styleId ? {id: styleId} : style);
    if (!metaOnly) {
      if (vars || assignVars) {
        await usercss.assignVars(style, vars ? {usercssData: {vars}} : dup);
      }
      style = await usercss.buildCode(style);
    }
    return {style, dup};
  },

  async buildMeta(style) {
    if (style.usercssData) {
      return style;
    }
    // allow sourceCode to be normalized
    const {sourceCode} = style;
    delete style.sourceCode;
    return Object.assign(await usercss.buildMeta(sourceCode), style);
  },

  async configVars(id, vars) {
    let style = deepCopy(await API.styles.get(id));
    style.usercssData.vars = vars;
    style = await usercss.buildCode(style);
    style = await API.styles.install(style, 'config');
    return style.usercssData.vars;
  },

  async editSave(style) {
    return API.styles.editSave(await API.usercss.parse(style));
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
    return API.styles.install(await API.usercss.parse(style));
  },

  async parse(style) {
    style = await API.usercss.buildMeta(style);
    // preserve style.vars during update
    const dup = await API.usercss.find(style);
    if (dup) {
      style.id = dup.id;
      await usercss.assignVars(style, dup);
    }
    return usercss.buildCode(style);
  },
};
