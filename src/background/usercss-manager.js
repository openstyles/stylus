import {UCD} from '@/js/consts';
import {getMetaComment} from '@/js/style-util';
import {deepCopy, makeUserCssFindFilter, reuseStyleVars, t} from '@/js/util';
import * as styleMan from './style-manager';
import {styleMap} from './style-manager/util';
import {worker} from './util';

export * from './usercss-install-helper';

const GLOBAL_META = Object.entries({
  author: null,
  description: null,
  homepageURL: 'url',
  updateURL: 'updateUrl',
  name: null,
});

/**
 * @param {string} sourceCode
 * @param {{}} [opts]
 * @param {number} [opts.id]
 * @param {boolean} [opts.dup]
 * @param {boolean} [opts.metaOnly]
 * @param {boolean} [opts.strict] throw on parsing error
 * @param {boolean} [opts.vars]
 * @return {Promise<{style: StyleObj, dup: StyleObj?, logs: Array}>}
 */
export async function build(sourceCode, {id, dup, metaOnly, strict, vars} = {}) {
  const logs = [];
  const style = await buildMeta({}, sourceCode);
  dup = (dup || vars) && (id ? styleMap.get(id) : find(style));
  if (!metaOnly) await buildCode(style, vars && dup, logs, strict);
  return {style, dup, logs};
}

/**
 * @param {StyleObj} style
 * @param {StyleObj | boolean} [oldStyleWithVars]
 * @param {Array} [logs]
 * @param {boolean} [strict] throw on parsing error
 * @return {Promise<StyleObj>}
 */
export async function buildCode(style, oldStyleWithVars, logs, strict) {
  const {id, [UCD]: ucd} = style;
  const {preprocessor: pp, vars} = ucd;
  if (vars) reuseStyleVars(vars, oldStyleWithVars);
  const [res, log, warn] = await worker.compileUsercss(style.sourceCode, pp, vars, id, strict);
  if (!res.length) throw t('emptyStyle');
  if (log) logs?.push(log, warn);
  style.sections = res;
  return style;
}

/**
 * @param {StyleObj} [style] - when falsy, bare UsercssData is returned
 * @param {string} [sourceCode]
 * @return {Promise<StyleObj | UsercssData>} a shallow copy of `style`
 */
export async function buildMeta(style, sourceCode) {
  if (!sourceCode && style && style[UCD])
    return style;
  const code = (sourceCode || style?.sourceCode).replace(/\r\n?/g, '\n');
  const match = getMetaComment(code, 'match');
  if (!match)
    throw new Error('Could not find metadata.');
  try {
    const {metadata} = await worker.metaParse(match[0]);
    const res = !style ? metadata : {
      enabled: true,
      sections: [],
      ...style,
      sourceCode: code,
      [UCD]: metadata,
    };
    // https://github.com/openstyles/stylus/issues/560#issuecomment-440561196
    for (const [key, globalKey] of GLOBAL_META) {
      const val = metadata[key];
      if (val !== undefined) {
        res[globalKey || key] = val;
      }
    }
    return res;
  } catch (err) {
    if (err.code) {
      const args = err.code === 'missingMandatory' || err.code === 'missingChar'
        ? err.args.map(e => e.length === 1 ? JSON.stringify(e) : e).join(', ')
        : err.args;
      const msg = t(`meta_${(err.code)}`, args);
      // Fall back to a readable message if the locale string is missing (e.g.
      // i18n not fully initialized), instead of surfacing a bare 'meta_NN'.
      err.message = msg || `${err.code}${args ? `: ${args}` : ''}`;
      err.index = (err.index || 0) + match.index;
    }
    throw err;
  }
}

export async function configVars(id, vars) {
  const style = deepCopy(styleMan.get(id));
  style[UCD].vars = vars;
  await buildCode(style);
  return (await styleMan.install(style, 'config'))[UCD].vars;
}

/**
 * @param {StyleObj} style
 * @param {{}} msg
 * @return {Promise<{style: StyleObj, logs: Array}>}
 */
export async function editSave(style, msg) {
  const logs = [];
  style = await parse(style, {}, logs); // a shallow copy
  style = await styleMan.editSave(style, msg); // a shallow copy
  return {style, logs};
}

/**
 * @param {StyleObj | UsercssData} data
 * @param {boolean} [returnBoolean]
 * @return {StyleObj | void}
 */
export function find(data, returnBoolean) {
  const res = data.id
    ? styleMap.get(data.id)
    : styleMan.find(makeUserCssFindFilter(data[UCD] || data), UCD);
  return returnBoolean ? !!res : res;
}

export function getVersion(data) {
  return find(data)?.[UCD].version;
}

export async function install(style, opts) {
  return styleMan.install(await parse(style, opts));
}

async function parse(style, {dup, vars} = {}, logs) {
  if (!style[UCD])
    style = await buildMeta(style);
  // preserve style vars during update
  dup ||= find(style);
  style.id ||= dup?.id;
  return buildCode(style, vars || dup, logs);
}
