import {FROM_CSS} from '@/js/style-util';
import {load} from './util';

/** @type {import('less')} */
let less;

export default function preLess(code, metaStr, vars, sections) {
  let resolve, reject;
  less ||= load('less.js', 'less');
  less.render(code, {
    math: 'parens-division',
    modifyVars: vars && Object.fromEntries(Object.keys(vars).map(k => ['@' + k, vars[k].value])),
  }, (err, ...res) => err
    ? reject ? reject(err) : (reject = err)
    : resolve ? resolve(extractSectionsFromLess(...res, metaStr, sections)) : (resolve = res));
  if (reject) throw reject;
  if (resolve) extractSectionsFromLess(...resolve, metaStr, sections);
  else return new Promise((ok, ko) => { resolve = ok; reject = ko; });
}

function extractSectionsFromLess({css}, docs, metaStr, sections) {
  let v;
  let prevEnd = 0;
  for (let [cmt, prelude, body, start, end] of docs) {
    if (cmt) {
      // If it's right before the section, metaStr will be added as a part of global code
      if (cmt === metaStr) cmt = '';
      else body = cmt + '\n' + body;
    }
    // Global code before the current section including metaStr determined above
    if ((v = css.slice(prevEnd, start - cmt.length - (css.charCodeAt(start - 1) === 10)).trim()))
      sections.push({code: v});
    const sec = {code: body};
    if (prelude && (prelude = Array.isArray(v = prelude.value) ? v : [prelude])) {
      for (const node of prelude) {
        let k, quote;
        if (typeof (v = node.value) !== 'string'
          && (k = node.name || node.type)
          && (k = FROM_CSS[k.toLowerCase()])
          && (v ||= node.args?.[0])
          && typeof ({quote} = v, v = v.value) === 'string') {
          // TODO: use parserlib.Token.string to decode CSS escapes
          (sec[k] ||= []).push(quote ? v.replace(/\\\\/g, '\\') : v);
        }
      }
    }
    sections.push(sec);
    prevEnd = end;
  }
  // Global code at the end
  if ((v = css.slice(prevEnd).trim()))
    sections.push({code: v});
}
