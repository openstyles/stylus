export default [{
  desc: 'Simple selector must be used inside :not() for backwards compatibility.',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', e => {
    let pp, p;
    for (const sel of e.selectors) {
      for (const part of sel.parts) {
        if (!part.modifiers) continue;
        for (const {name, args} of part.modifiers) {
          if (name === 'not' && args[0] && (
            args[1] ||
            (pp = args[0].parts)[1] ||
            (p = pp[0]).modifiers.length + (p.elementName ? 1 : 0) > 1
          )) reporter.report('Complex selector inside :not().', args[0], rule);
        }
      }
    }
  });
}];
