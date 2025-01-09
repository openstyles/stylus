import {UCD} from '@/js/consts';
import {deepCopy, mapObj, RX_META, t} from '@/js/util';
import download from './download';
import * as styleMan from './style-manager';
import {worker} from './util';

export * from './usercss-install-helper';

const GLOBAL_META = Object.entries({
  author: null,
  description: null,
  homepageURL: 'url',
  updateURL: 'updateUrl',
  name: null,
});

/** `src` is a style or vars */
async function assign(style, src) {
  const meta = style[UCD];
  const meta2 = src[UCD];
  const {vars} = meta;
  const oldVars = meta2 ? meta2.vars : src;
  if (vars && oldVars) {
    // The type of var might be changed during the update. Set value to null if the value is invalid.
    for (const [key, v] of Object.entries(vars)) {
      const old = oldVars[key] && oldVars[key].value;
      if (old != null) v.value = old;
    }
    meta.vars = await worker.nullifyInvalidVars(vars);
  }
}

export async function build({
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
  const style = await buildMeta({sourceCode});
  const dup = (checkDup || assignVars) &&
    find(styleId ? {id: styleId} : style);
  let log;
  if (!metaOnly) {
    if (vars || assignVars) {
      await assign(style, vars || dup);
    }
    await buildCode(style);
    log = style.log; // extracting the non-enumerable prop, otherwise it won't survive messaging
  }
  return {style, dup, log};
}

export async function buildCode(style) {
  const {sourceCode: code, [UCD]: {vars, preprocessor}} = style;
  const {sections, errors, log} = await worker.compileUsercss(preprocessor, code, vars);
  const recoverable = errors.every(e => e.recoverable);
  if (!sections.length || !recoverable) {
    throw !recoverable ? errors : 'Style does not contain any actual CSS to apply.';
  }
  style.sections = sections;
  // adding a non-enumerable prop so it won't be written to storage
  if (log) Object.defineProperty(style, 'log', {value: log});
  return style;
}

export async function buildMeta(style) {
  if (style[UCD]) {
    return style;
  }
  // remember normalized sourceCode
  const code = style.sourceCode = style.sourceCode.replace(/\r\n?/g, '\n');
  style = Object.assign({
    enabled: true,
    sections: [],
  }, style);
  const match = code.match(RX_META);
  if (!match) {
    return Promise.reject(new Error('Could not find metadata.'));
  }
  try {
    const {metadata} = await worker.parseUsercssMeta(match[0]);
    style[UCD] = metadata;
    // https://github.com/openstyles/stylus/issues/560#issuecomment-440561196
    for (const [key, globalKey] of GLOBAL_META) {
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
      const msg = t(`meta_${(err.code)}`, args);
      if (msg) err.message = msg;
      err.index += match.index;
    }
    return Promise.reject(err);
  }
}

export async function configVars(id, vars) {
  const style = deepCopy(styleMan.get(id));
  style[UCD].vars = vars;
  await buildCode(style);
  return (await styleMan.install(style, 'config'))[UCD].vars;
}

export async function editSave(style) {
  style = await parse(style);
  return {
    log: style.log, // extracting the non-enumerable prop, otherwise it won't survive messaging
    style: await styleMan.editSave(style),
  };
}

/**
 * @param {Object} data - style object or usercssData
 * @return {StyleObj|void}
 */
export function find(data) {
  if (data.id) return styleMan.get(data.id);
  const filter = mapObj(data[UCD] || data, null, ['name', 'namespace']);
  return styleMan.find(filter, UCD);
}

export function getVersion(data) {
  return find(data)?.[UCD].version;
}

export async function install(style, opts) {
  return styleMan.install(await parse(style, opts));
}

export async function parse(style, {dup, vars} = {}) {
  style = await buildMeta(style);
  // preserve style.vars during update
  if (dup || (dup = find(style))) {
    style.id = dup.id;
  }
  if (vars || (vars = dup)) {
    await assign(style, vars);
  }
  return buildCode(style);
}
