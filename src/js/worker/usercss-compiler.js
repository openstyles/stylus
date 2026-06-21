import {RX_META} from '@/js/util';
import extractSections from './extract-sections';
import {nullifyInvalidVars} from './meta-parser';
import preLess from './pre-less';
import preStylus from './pre-stylus';
import preUso from './pre-uso';
import spliceCssVars from './splice-css-vars';

let builderChain;

/**
 * @param {string} code
 * @param {string} preprocessor
 * @param {Object} [vars] - WARNING: each var's `value` will be overwritten
   (not a problem currently as this code runs in a worker so `vars` is just a copy)
 * @param {number} [styleId]
 * @param {boolean} [strict] throw on parsing error
 * @returns {Promise<[StyleSection[], string[]?, string[]?]>}
 */
export default async function compileUsercss(code, preprocessor, vars, styleId, strict) {
  if (vars) {
    nullifyInvalidVars(vars);
    simplifyUsercssVars(vars);
  }
  const fn = preprocessor === 'stylus' ? preStylus
    : preprocessor === 'less' ? preLess
      : preprocessor === 'uso' && preUso;
  const metaStr = code.match(RX_META)?.[0] || '';
  const log = fn === preStylus && [];
  const warn = log && [];
  let sections = (fn === preLess || fn === preStylus) && [];
  if (fn && (code = fn(code, metaStr, vars, sections, log, warn)) && code.then) {
    const me = builderChain = builderChain?.catch(__.DEBUG ? console.log : () => {}).then(code)
      || code;
    code = await builderChain;
    if (builderChain === me) // no one attached to the chain
      builderChain = null; // so no need to wait next time
  }
  sections ||= extractSections(code, styleId, metaStr, strict);
  if (vars && !fn && sections.length)
    spliceCssVars(sections, vars);
  if (!fn && preprocessor && preprocessor !== 'default')
    console.warn(`Unknown preprocessor "${preprocessor}" in style #${styleId}`);
  return [sections, log, warn];
}

/**
 * Adds units and sets `null` values to their defaults
 * WARNING: the old value is overwritten
 */
function simplifyUsercssVars(vars) {
  for (const va of Object.values(vars)) {
    let value = va.value != null ? va.value : va.default;
    switch (va.type) {
      case 'select':
      case 'dropdown':
      case 'image':
        // TODO: handle customized image
        for (const opt of va.options) {
          if (opt.name === value) {
            value = opt.value;
            break;
          }
        }
        break;
      case 'number':
      case 'range':
        value += va.units || '';
        break;
    }
    va.value = value;
  }
}
