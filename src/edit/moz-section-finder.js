import {CodeMirror} from '@/cm';
import {deepEqual} from '@/js/util';
import {trimCommentLabel} from './util';

export default function MozSectionFinder(cm) {
  const KEY = 'MozSectionFinder';
  const MOZ_DOC_LEN = '@-moz-document'.length;
  const rxDOC = /@-moz-document(\s+|$)/ig;
  const rxVOID = /\s*}/y;
  const rxFUNC = /([-a-z]+)\(/iy;
  const rxNEXT = /(\s*)(.)?/y;
  const rxSPACE = /\s+/y;
  const rxTokDOC = /^(?!comment|string)/;
  const rxTokCOMMENT = /^comment(\s|$)/;
  const rxTokSTRING = /^string(\s|$)/;
  const {cmpPos} = CodeMirror;
  const minPos = (a, b) => cmpPos(a, b) < 0 ? a : b;
  const maxPos = (a, b) => cmpPos(a, b) > 0 ? a : b;
  const keptAlive = new Map();
  const state = /** @namespace MozSectionCmState */ {
    /** @type {Set<function>} */
    listeners: new Set(),
    /** @type {MozSection[]} */
    sections: [],
  };
  /** @type {CodeMirror.Pos} */
  let updFrom;
  /** @type {CodeMirror.Pos} */
  let updTo;
  let scheduled;

  /** @namespace MozSectionFinder */
  const finder = {
    IGNORE_ORIGIN: KEY,
    EQ_SKIP_KEYS: [
      'mark',
      'valueStart',
      'valueEnd',
      'sticky', // added by TextMarker::find()
    ],
    sections: state.sections,
    keepAliveFor(id, ms) {
      let data = keptAlive.get(id);
      if (data) {
        clearTimeout(data.timer);
      } else {
        const NOP = () => 0;
        data = {fn: NOP};
        keptAlive.set(id, data);
        finder.on(NOP);
      }
      data.timer = setTimeout(() => keptAlive.delete(id), ms);
    },

    on(fn) {
      const {listeners} = state;
      const needsInit = !listeners.size;
      listeners.add(fn);
      if (needsInit) {
        cm.on('changes', onCmChanges);
        update();
      }
    },

    off(fn) {
      const {listeners, sections} = state;
      if (listeners.size) {
        listeners.delete(fn);
        if (!listeners.size) {
          cm.off('changes', onCmChanges);
          cm.operation(() => sections.forEach(sec => sec.mark.clear()));
          sections.length = 0;
        }
      }
    },

    onOff(fn, enable) {
      finder[enable ? 'on' : 'off'](fn);
    },

    /** @param {MozSection} [section] */
    updatePositions(section) {
      (section ? [section] : state.sections).forEach(setPositionFromMark);
    },
  };

  function onCmChanges(_cm, changes) {
    if (!updFrom) updFrom = {line: Infinity, ch: 0};
    if (!updTo) updTo = {line: -1, ch: 0};
    for (const c of changes) {
      if (c.origin !== finder.IGNORE_ORIGIN) {
        updFrom = minPos(c.from, updFrom);
        updTo = maxPos(CodeMirror.changeEnd(c), updTo);
      }
    }
    if (updTo.line >= 0 && !scheduled) {
      scheduled = requestAnimationFrame(update);
    }
  }

  function update() {
    const {sections, listeners} = state;
    // Cloning to avoid breaking the internals of CodeMirror
    let from = updFrom ? {line: updFrom.line, ch: updFrom.ch} : {line: 0, ch: 0};
    let to = updTo ? {line: updTo.line, ch: updTo.ch} : {line: cm.doc.size, ch: 0};
    let cutAt = -1;
    let cutTo = -1;
    scheduled = updFrom = updTo = null;
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (cmpPos(sec.end, from) >= 0) {
        if (cutAt < 0) {
          cutAt = i;
          from = minPos(from, sec.start);
        }
        // Sections that start/end after `from` may have incorrect positions
        if (setPositionFromMark(sec)) {
          if (cmpPos(sec.start, to) > 0) {
            cutTo = i;
            break;
          }
          to = maxPos(sec.end, to);
        }
      }
    }
    if (cutAt < 0) {
      from.ch = Math.max(0, from.ch - MOZ_DOC_LEN);
      cutAt = sections.length;
    }
    if (cutTo < 0) {
      to.ch += MOZ_DOC_LEN;
      cutTo = sections.length;
    }
    let op;
    let reusedAtStart = 0;
    let reusedAtEnd = 0;
    const added = findSections(from, to);
    const removed = sections.slice(cutAt, cutTo);
    for (const sec of added) {
      const i = removed.findIndex(isSameSection, sec);
      if (i >= 0) {
        const r = removed[i];
        r.funcs = sec.funcs; // use the new valueStart, valueEnd
        sec.mark = r.mark;
        removed[i] = null;
        reusedAtEnd++;
        if (!op) reusedAtStart++;
      } else {
        if (!op) op = cm.curOp || (cm.startOperation(), true);
        sec.mark = cm.markText(sec.start, sec.end, {
          clearWhenEmpty: false,
          inclusiveRight: true,
          [KEY]: sec,
        });
        reusedAtEnd = 0;
      }
    }
    added.length -= reusedAtEnd;
    cutTo -= reusedAtEnd;
    if (reusedAtStart) {
      cutAt += reusedAtStart;
      added.splice(0, reusedAtStart);
    }
    for (const sec of removed) {
      if (sec) {
        if (!op) op = cm.curOp || (cm.startOperation(), true);
        sec.mark.clear();
      }
    }
    if (op) {
      sections.splice(cutAt, cutTo - cutAt, ...added);
      for (const fn of listeners)
        fn.call(cm, added, removed, cutAt, cutTo);
    }
    if (op === true) {
      cm.endOperation();
    }
  }

  /**
   * @param {CodeMirror.Pos} from
   * @param {CodeMirror.Pos} to
   * @returns MozSection[]
   */
  function findSections(from, to) {
    /** @type MozSection[] */
    const found = [];
    let line = from.line - 1;
    let goal = '';
    let section, func, funcPos, url;
    /** @type {MozSectionFunc[]} */
    let funcs;
    // will stop after to.line if there's no goal anymore, see `return true` below
    cm.eachLine(from.line, cm.doc.size, handle => {
      ++line;
      const {text} = handle;
      const len = text.length;
      if (!len) {
        return;
      }
      let ch = line === from.line ? from.ch : 0;
      while (true) {
        let m;
        if (!goal) {
          // useful for minified styles with long lines
          if ((line - to.line || ch - to.ch) >= 0) {
            return true;
          }
          if ((ch = text.indexOf('@-', ch)) < 0 ||
            !(rxDOC.lastIndex = ch, m = rxDOC.exec(text))) {
            return;
          }
          ch = m.index + m[0].length;
          section = /** @namespace MozSection */ {
            funcs: funcs = [],
            start: {line, ch: m.index},
            end: null,
            mark: null,
            tocEntry: {
              label: '',
              target: null,
              numTargets: 0,
            },
          };
          if (rxTokDOC.test(cm.getTokenTypeAt(section.start))) {
            found.push(section);
            goal = '_func';
          } else {
            continue;
          }
        }
        if (!handle.styles) cm.getTokenTypeAt({line, ch: 0});
        const {styles} = handle;
        let j = 1;
        if (ch) {
          j += styles.length * ch / len & ~1;
          while (styles[j - 2] >= ch) j -= 2;
          while (styles[j] <= ch) j += 2;
        }
        let type, chPrev;
        for (; goal && j < styles.length;
               (type || ch >= styles[j] || ch === chPrev) && (j += 2), chPrev = ch) {
          /* We may loop several times through one long text token like "),        {   "
             (chPrev prevents an endless loop, it's not really necessary but just in case) */
          let s;
          type = styles[j + 1];
          if (type && type.startsWith('overlay ')) type = '';
          if (goal.startsWith('_')) {
            if (!type && (rxSPACE.lastIndex = ch, rxSPACE.test(text))) {
              ch = rxSPACE.lastIndex;
              if (ch === styles[j]) {
                continue;
              }
            }
            const isCmt = type && rxTokCOMMENT.test(type);
            if (goal === '_cmt') {
              const cmt = isCmt && trimCommentLabel(text.slice(ch, ch = styles[j]));
              if (cmt) section.tocEntry.label = cmt;
              if (!isCmt && type || cmt) goal = '';
              continue;
            }
            if (isCmt) {
              ch = styles[j];
              continue;
            }
            goal = goal.slice(1);
          }
          if (goal === 'func') {
            if (!type || !(rxFUNC.lastIndex = ch, m = rxFUNC.exec(text))) {
              goal = 'error';
              break;
            }
            func = m[1];
            funcPos = {line, ch};
            ch += func.length + 1; // +1 for "("
            url = false;
            goal = '_str';
            // Tokens in `styles` are split into multiple items due to `overlay`.
            while (styles[j + 2] <= ch) j += 2;
          }
          if (goal === 'str') {
            if (!url) {
              s = ((s = text[ch]) === '"' || s === "'") ? s : '';
              url = {
                chunks: [],
                start: {line, ch: ch += !!s},
                end: null,
                quote: s,
              };
            }
            if (rxTokSTRING.test(type)) {
              let end = styles[j];
              // CSS strings can span multiple lines.
              // Tokens in `styles` are split into multiple items due to `overlay`.
              if (end > ch) {
                if (text[end - 1] === url.quote && text[end - 2] !== '\\') {
                  end--;
                  goal = '_)';
                }
                url.chunks.push(text.slice(ch, end));
                url.end = {line, ch: end};
              }
              ch = styles[j];
            } else if (type) {
              goal = 'error';
              break;
            } else {
              goal = text[ch] === ')' ? (j += 2, ')') : '_)';
              url.end = {line, ch};
            }
          }
          if (goal === ')') {
            if (text[ch] !== ')') {
              goal = 'error';
              break;
            }
            ch++;
            s = url ? url.chunks.join('') : '';
            if (!funcs.length) section.tocEntry.target = s;
            section.tocEntry.numTargets++;
            funcs.push(/** @namespace MozSectionFunc */ {
              type: func,
              value: s,
              isQuoted: url.quote,
              start: funcPos,
              end: {line, ch},
              valueStart: url.start,
              valueEnd: url.end,
            });
            rxNEXT.lastIndex = ch;
            s = text.match(rxNEXT);
            goal = s[2];
            goal = goal === ',' ? '_func' :
              goal === '{' ? '_cmt' :
                !goal && '_,'; // non-space something at this place = syntax error
            if (!goal) {
              goal = 'error';
              break;
            }
            ch += s[0].length;
            if (s[2] === '{' && (rxVOID.lastIndex = ch, rxVOID.test(text))) {
              goal = '';
              break;
            }
          }
          if (goal === ',') {
            goal = text[ch] === ',' ? '_func' : '';
          }
        }
        section.end = {line, ch: styles[j + 2] || len};
        // at this point it's either an error...
        if (goal === 'error') {
          goal = '';
        }
        // ...or a EOL, in which case we'll advance to the next line
        if (goal) {
          return;
        }
      }
    });
    return found;
  }

  /**
   * @param {MozSection|MozSectionFunc} obj
   * @returns {?{from:CodeMirror.Pos, to:CodeMirror.Pos}} falsy if marker was removed
   */
  function setPositionFromMark(obj) {
    const pos = obj.mark.find();
    obj.start = pos && pos.from;
    obj.end = pos && pos.to;
    return pos;
  }

  /**
   * @this {MozSection} new section
   * @param {MozSection} old
   * @returns {boolean}
   */
  function isSameSection(old) {
    return old &&
      old.start &&
      old.tocEntry.label === this.tocEntry.label &&
      !cmpPos(old.start, this.start) &&
      !cmpPos(old.end, this.end) &&
      old.funcs.length === this.funcs.length &&
      old.funcs.every(isSameFunc, this.funcs);
  }

  /** @this {MozSectionFunc[]} new functions */
  function isSameFunc(func, i) {
    return deepEqual(func, this[i], finder.EQ_SKIP_KEYS);
  }

  /** @typedef CodeMirror.Pos
   * @property {number} line
   * @property {number} ch
   */

  return finder;
}
