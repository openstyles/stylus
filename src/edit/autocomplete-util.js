import {kCssPropSuffix} from '@/js/consts';
import {debounce} from '@/js/util';

const MARK = $tag('b');
const USO_VAR = 'uso-variable';
export const USO_VALID_VAR = 'variable-3 ' + USO_VAR;
export const USO_INVALID_VAR = 'error ' + USO_VAR;
const kCompleteSingle = 'completeSingle';
const pickedCms = new WeakSet();

export const addSuffix = (obj, suffix) =>
  // Sorting first, otherwise "foo-bar:" would precede "foo:"
  (Object.keys(obj).sort().join(suffix + '\n') + suffix).split('\n');

export class Completion {
  /* eslint-disable class-methods-use-this */
  constructor(i, text, isValue) {
    this.i = i;
    this.text = text;
    this.val = isValue;
  }

  /**
   * @param {CodeMirror.Editor} cm
   * @param {CompletionData} data
   * @param {Completion} completion
   */
  hint(cm, {from, to}, {text}) {
    pickedCms.add(cm);
    if (text === cm.getRange(from, to)) {
      cm.setCursor(to);
    } else {
      cm.replaceRange(text, from, to, 'complete');
    }
    if (text.endsWith(kCssPropSuffix)) {
      setTimeout(execAutocomplete, 0, cm);
    }
  }
  /**
   * @param {HTMLElement} el
   * @param {CompletionData} data
   * @param {Completion} completion
   */
  render(el, {len}, {i, text, val}) {
    el.className += ` hint-${val ? 'value' : 'name'} hint-${i ? 'start' : 'inside'}`;
    el.append(...[
      i && text.slice(0, i),
      len && (el = MARK.cloneNode(), el.append(text.slice(i, i + len)), el),
      !(i += len) ? text : text.slice(i),
    ].filter(Boolean));
  }
}

export function autocompleteOnTyping(cm, [info], debounced) {
  const lastLine = info.text[info.text.length - 1];
  if (cm.state.completionActive ||
      info.origin && !info.origin.includes('input') ||
      !lastLine) {
    return;
  }
  if (pickedCms.has(cm)) {
    pickedCms.delete(cm);
    return;
  }
  if (!debounced) {
    debounce(autocompleteOnTyping, 100, cm, [info], true);
    return;
  }
  if (lastLine.match(/[-a-z!]+$/i)) {
    execAutocomplete(cm);
  }
}

export async function execAutocomplete(cm) {
  pickedCms.delete(cm);
  const ho = cm.options.hintOptions;
  const old = ho[kCompleteSingle];
  ho[kCompleteSingle] = false;
  cm.execCommand('autocomplete');
  await 0;
  ho[kCompleteSingle] = old;
}

export function findAllCssVars(cm, leftPart, rightPart = '') {
  // simplified regex without CSS escapes
  const [, prefixed, named] = leftPart.match(/^(--|@)?(\S)?/);
  const rx = new RegExp(
    '(?:^|[\\s/;{])(' +
    (prefixed ? leftPart : '--') +
    (named ? '' : '[a-zA-Z_\u0080-\uFFFF]') +
    '[-0-9a-zA-Z_\u0080-\uFFFF]*)' +
    rightPart,
    'g');
  const list = new Set();
  cm.eachLine(({text}) => {
    for (let m; (m = rx.exec(text));) {
      list.add(m[1]);
    }
  });
  return [...list].sort();
}

export function getTokenState(cm, pos, type) {
  const token = cm.getTokenAt(pos, true);
  return token.type
    ? token.state.state
    : type;
}

/** makes sure we don't process a different adjacent comment */
export function isSameToken(text, style, i) {
  return !style || text[i] !== '/' && text[i + 1] !== '*' ||
    !style.startsWith(USO_VALID_VAR) && !style.startsWith(USO_INVALID_VAR);
}

export function execAt(rx, index, text) {
  rx.lastIndex = index;
  return rx.exec(text);
}

export function testAt(rx, index, text) {
  rx.lastIndex = Math.max(0, index);
  return rx.test(text);
}
