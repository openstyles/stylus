import {FROM_CSS} from '@/js/style-util';
import {loadStylusLang, stylusLang} from './util';

/** @type {StyleSection[]} */
let sectionsTmp;
let metaStrTmp;

export default function preStylus(code, metaStr, vars, sections, log, warn) {
  if (!stylusLang)
    loadStylusLang();
  if (sectionsTmp === undefined)
    stylusLang.Compiler.prototype.visitRoot = extractSectionsFromStylus;
  if (vars) {
    const str = `@import 'functions/index.styl';\n` +
      `vars={${Object.keys(vars).map(k => `'${k}':${vars[k].value}`).join(',\n')}}`;
    const ast = new stylusLang.Parser(str).parse();
    const ev = new stylusLang.Evaluator(ast).evaluate();
    vars = ev.nodes[1].nodes[0].vals;
  }
  metaStrTmp = metaStr;
  sectionsTmp = sections;
  code = stylusLang(code, {
    /** Copied from postcss-styl to avoid it crashing due to an empty lexer.
     *  TODO: see if this noticeably reduces performance and maybe patch postcss-styl. */
    cache: false,
    globals: vars,
    functions: {
      p: node => log.push(node.val || node) && stylusLang.nodes.null,
      warn: node => warn.push(node.val || node) && stylusLang.nodes.null,
    },
  }).render();
  metaStrTmp = sectionsTmp = null;
  return code;
}

function extractSectionsFromStylus(block) {
  let cmt, k, v;
  this.buf = '';
  for (const node of block.nodes) {
    if ((v = node.str) && v !== metaStrTmp && v.charCodeAt(0) === 47/* / */ && (cmt = v)
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
