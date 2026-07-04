import {worker} from '@/edit/util';
import {getMetaComment} from '@/js/style-util';
import {t} from '@/js/util';

export let pendingMeta;
let /**@type{CM}*/cm;
let onUpdated;
let prevRes = [];
let prevMetadata;
let meta, done, iFrom, lineTo, chTo;
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
    if (errors.every(err => err.code === 'unknownMeta')) {
      onUpdated(metadata);
    }
    meta = text;
    prevRes = errors.map(({code, index, args, message}) => {
      const isUnknownMeta = code === 'unknownMeta';
      const typo = isUnknownMeta && args[1] ? 'Typo' : ''; // args[1] may be present but undefined
      const i = (index || 0) + iFromNew;
      const pos = cm.posFromIndex(i);
      return {
        i,
        from: pos,
        to: pos,
        message: code && t(`meta_${code}${typo}`, args, false) || message,
        severity: isUnknownMeta ? 'warning' : 'error',
        rule: code,
      };
    });
    done(prevRes);
  }
  iFrom = iFromNew;
  ({line: lineTo, ch: chTo} = cm.posFromIndex(iFromNew + text.length));
  return prevRes;
};
