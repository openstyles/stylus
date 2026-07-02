import {FROM_CSS} from '@/js/style-util';
import {loadStylusLang, stylusLang} from './util';

/** @type {StyleSection[]} */
let sectionsTmp;
let metaStrTmp, varsSep, varsUsed;

export default function preStylus(code, metaStr, vars, sections, log, warn) {
  if (!stylusLang)
    loadStylusLang();
  if (!varsSep) {
    /** Added after vars to ensure any leftovers are removed. Not using `globals` because it has
     * to use a separate Parser+Evaluator which pre-parses all built-in functions and named colors
     * which is then performed again wastefully on the main code. */
    varsSep = 'sep' + Math.random().toString(36).slice(2);
    stylusLang.Compiler.prototype.visitRoot = extractSectionsFromStylus;
  }
  if (vars) {
    vars = Object.keys(vars).map(k => `${k}=${vars[k].value};\n`).join('') +
      '@' + varsSep + ';\n';
    code = vars + code;
  }
  metaStrTmp = metaStr;
  sectionsTmp = sections;
  varsUsed = !!vars;
  stylusLang(code, {
    /** Copied from postcss-styl to avoid it crashing due to an empty lexer.
     *  TODO: see if this noticeably reduces performance and maybe patch postcss-styl. */
    cache: false,
    functions: {
      p: node => log.push(node.val || node) && stylusLang.nodes.null,
      warn: node => warn.push(node.val || node) && stylusLang.nodes.null,
    },
  }).render((err, css) => {
    if (err) {
      if (vars) err.message = err.message.replace(/:(\d+)(?=:)/,
        // Not using Object.keys(vars).length because values may have \n inside
        (s, line) => ':' + (line - vars.match(/^/gm).length - 1));
      throw err;
    }
    code = css;
  });
  metaStrTmp = sectionsTmp = null;
  return code;
}

function extractSectionsFromStylus(block) {
  let cmt, k, v, sepSkipped;
  this.buf = '';
  for (const node of block.nodes) {
    if ((v = node.str) && v !== metaStrTmp && v.charCodeAt(0) === 47/* / */ && (cmt = v)
    || varsUsed && !sepSkipped && (node.type !== varsSep || (sepSkipped = true))
    || node.suppress)
      continue;
    if (node.type === '-moz-document') {
      if ((v = this.buf)) {
        sectionsTmp.push({code: v}); // global
        this.buf = '';
      }
      this.visitBlock(node.block);
      v = this.buf;
      const sec = {code: cmt ? cmt + v : v};
      for (const seg of node.segments)
        if ((k = FROM_CSS[seg.name.toLowerCase()]) && (v = seg.args.first))
          (sec[k] ||= []).push((v.val || `${v}`).replace(/\\\\/g, '\\'));
      sectionsTmp.push(sec);
      this.buf = cmt = '';
    } else if ((v = this.visit(node))) {
      this.buf += v + '\n';
    }
  }
  if ((v = this.buf)) {
    sectionsTmp.push({code: v}); // global
  }
  return '';
}
