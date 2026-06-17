import {UCD} from '@/js/consts';
import {deepCopy, makeUserCssFindFilter, reuseStyleVars, RX_META, t} from '@/js/util';
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
 * @param {{id?: number, dup?: boolean, metaOnly?: boolean, vars?: boolean}} [opts]
 * @return {Promise<{style: StyleObj|UsercssData, dup: StyleObj|void, log: *}>}
 */
export async function build(sourceCode, {id, dup, metaOnly, vars} = {}) {
  // downloading here while install-usercss page is loading to avoid the wait
  const style = await buildMeta({}, sourceCode);
  dup = (dup || vars) && (id ? styleMap.get(id) : find(style));
  let log;
  if (!metaOnly) {
    await buildCode(style, vars && dup);
    log = style.log; // extracting the non-enumerable prop, otherwise it won't survive messaging
  }
  return {style, dup, log};
}

/**
 * @param {StyleObj} style
 * @param {StyleObj | boolean} [oldStyleWithVars]
 * @return {Promise<*>}
 */
export async function buildCode(style, oldStyleWithVars) {
  const {sourceCode: code, [UCD]: {vars, preprocessor}} = style;
  const {sections, errors, log} = await worker.compileUsercss(preprocessor, code,
    vars && reuseStyleVars(vars, oldStyleWithVars));
  const recoverable = errors.every(e => e.recoverable);
  if (!sections.length || !recoverable) {
    throw !recoverable ? errors : 'Style does not contain any actual CSS to apply.';
  }
  style.sections = sections;
  // adding a non-enumerable prop so it won't be written to storage
  if (log) Object.defineProperty(style, 'log', {value: log});
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
  const match = code.match(RX_META);
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
      if (msg) err.message = msg;
      err.index += match.index;
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

export async function editSave(style, msg) {
  style = await parse(style);
  return {
    log: style.log, // extracting the non-enumerable prop, otherwise it won't survive messaging
    style: await styleMan.editSave(style, msg),
  };
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

export async function parse(style, {dup, vars} = {}) {
  if (!style[UCD])
    style = await buildMeta(style);
  // preserve style vars during update
  dup ||= find(style);
  style.id ||= dup?.id;
  return buildCode(style, vars || dup);
}
