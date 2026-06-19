import {loadStylusLang, stylusLang} from './util';

export default function preStylus(code, metaStr, vars, sections, log, warn) {
  if (!stylusLang)
    loadStylusLang();
  /** Adding to the source text because `globals` needs a Node, but Evaluator fails on url()
   * Using a random separator to clean up leftovers (note that {} is re-formatted by stylus) */
  let sep;
  if (vars) {
    code = Object.entries(vars).map(e => `${e[0]}=${e[1].value};\n`).join('') +
      (sep = '.a' + Math.random().toString(36).slice(2)) + '{x:0}\n' +
      code;
  }
  code = stylusLang(code, {
    /** Copied from postcss-styl to avoid it crashing due to an empty lexer.
     *  TODO: see if this noticeably reduces performance and maybe patch postcss-styl. */
    cache: false,
    functions: {
      p: node => log.push(node.val || node) && stylusLang.nodes.null,
      warn: node => warn.push(node.val || node) && stylusLang.nodes.null,
    },
  }).render();
  if (vars && ~(sep = code.indexOf(sep)))
    code = code.slice(code.indexOf('}', sep) + 2/*}\n*/);
  return code;
}
