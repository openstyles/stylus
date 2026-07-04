import {worker} from '@/edit/util';
import {getMetaComment} from '@/js/style-util';
import {t} from '@/js/util';

export let pendingMeta;
let /**@type{CM}*/cm;
let onUpdated;
let prevRes = [];
let prevMetadata;
let meta, iFrom, lineTo, chTo;
/** @param {CodeMirror.EditorChange} change */
const isAfterMeta = ({from, removed}) => (
  from.line - lineTo - removed.length + 1 ||
  from.ch - chTo
) >= 0;

export const initMetaCompiler = (codemirror, cb) => {
  cm = codemirror;
  onUpdated = cb;
  return metaCompiler;
};

export const metaCompiler = async (text, linterOptions, linterCM, force) => {
  if (!force && (pendingMeta || (linterCM ? linterCM !== cm : meta && text.every(isAfterMeta))))
    return;
  let iFromNew = 0;
  let ok, done;
  if (!linterCM && !force) {
    let m;
    let line = -1;
    text = '';
    cm.eachLine(({text: str}) => {
      ++line;
      text += str + '\n';
      return str.includes('*/') && (m = getMetaComment(text, 'match'));
    });
    text = m && m[0];
    lineTo = m && line;
    chTo = m && text.length + (iFromNew = m.index);
  } else if (
    (text = getMetaComment(text, 'match'))
  ) {
    iFromNew = text.index;
    text = text[0];
  }
  if (!text) {
    return [];
  }
  if (text === meta && (!force || prevMetadata)) {
    if (force)
      return prevMetadata;
    if (iFromNew !== iFrom) {
      for (const r of prevRes) {
        r.from = r.to = cm.posFromIndex(r.i - iFrom + iFromNew);
        r.i = iFromNew;
      }
    }
  } else {
    pendingMeta = new Promise(cb => (done = cb));
    const {metadata, errors} = await worker.metalint(text);
    pendingMeta = null;
    if (force)
      return metadata;
    ok = true;
    meta = text;
    prevRes = errors;
    for (let i = 0; i < errors.length; i++) {
      const {code, index, args, message} = errors[i];
      const isUnknownMeta = code === 'unknownMeta' || (ok = false);
      const typo = isUnknownMeta && args[1] ? 'Typo' : ''; // args[1] may be present but undefined
      const offset = (index || 0) + iFromNew;
      const pos = cm.posFromIndex(offset);
      errors[i] = {
        i: offset,
        from: pos,
        to: pos,
        message: code && t(`meta_${code}${typo}`, args, false) || message,
        severity: isUnknownMeta ? 'warning' : 'error',
        rule: code,
      };
    }
    done(errors);
    if (ok) onUpdated(metadata);
  }
  iFrom = iFromNew;
  ({line: lineTo, ch: chTo} = cm.posFromIndex(iFromNew + text.length));
  return prevRes;
};
