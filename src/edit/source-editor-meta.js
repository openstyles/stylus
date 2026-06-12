import {worker} from '@/edit/util';
import {RX_META, t} from '@/js/util';

export let pendingMeta;
let /**@type{CM}*/cm;
let onUpdated;
let prevRes = [];
let prevMetadata;
let meta, done, iFrom, iTo, lineTo, chTo;
const [rxMetaStart, rxMetaEnd] = RX_META.source.split(/(?=\(\?:)/).map(s => RegExp(s, 'yi'));
/** @param {CodeMirror.EditorChange} change */
const isAfterMeta = ({from}) => (from.line - lineTo || from.ch - chTo) >= 0;

export const initMetaCompiler = (codemirror, cb) => {
  cm = codemirror;
  onUpdated = cb;
  return metaCompiler;
};

export const metaCompiler = async (text, linterOptions, linterCM, force) => {
  if (!force && (pendingMeta || (linterCM ? linterCM !== cm : text.every(isAfterMeta))))
    return;
  let iFromNew = 0;
  let iToNew = 0;
  if (!linterCM && !force) {
    text = '';
    let line = -1;
    let inComment, inMeta;
    cm.eachLine(({text: str}) => {
      line++;
      let i = -15; // minimal length of meta start
      let j, m;
      while (true) {
        if (!inComment) {
          inComment = (i = str.indexOf('/*', i)) >= 0;
          if (!inComment)
            break;
          rxMetaStart.lastIndex = i;
          inMeta = rxMetaStart.test(str);
          if (inMeta) iFromNew += i;
        }
        inComment = (j = str.indexOf('*/', i + 2)) < 0;
        if (inComment) {
          if (inMeta) {
            if (text) text += '\n';
            text += str;
          }
          break;
        }
        j += 2;
        inMeta &&= j - i >= 31 &&
          ((str.indexOf('==/', i + 15) + 1 || j) < j) &&
          (rxMetaEnd.lastIndex = i + 15, m = rxMetaEnd.exec(str)) &&
          (m.index + m[0].length === j);
        if (inMeta) {
          if (text) text += '\n';
          text += str.slice(i < 0 ? 0 : i, j);
          lineTo = line;
          chTo = j;
          iToNew += j;
          return true;
        }
        i = j;
      }
      i = str.length + 1;
      iToNew += i;
      if (!inMeta) iFromNew += i;
    });
  } else if (
    (!meta
      || text.charCodeAt(iFrom) !== meta.charCodeAt(iFrom)
      || text.charCodeAt(iTo) !== meta.charCodeAt(iTo)
      || text.slice(iFrom, iTo) !== meta
    ) && (text = text.match(RX_META))
  ) {
    iFromNew = text.index;
    text = text[0];
    iToNew = iFromNew + text.length;
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
    iFrom = iFromNew;
    iTo = iToNew;
    return prevRes;
  }
  pendingMeta = new Promise(cb => (done = cb));
  const {metadata, errors} = await worker.metalint(text);
  pendingMeta = null;
  if (force)
    return metadata;
  if (errors.every(err => err.code === 'unknownMeta')) {
    onUpdated(metadata);
  }
  meta = text;
  iFrom = iFromNew;
  iTo = iToNew;
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
  return prevRes;
};
