export default [{
  desc: 'A new line between selectors is a forgotten comma and not a descendant combinator.',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const {parts} of event.selectors) {
      for (let i = 0, p, pn; i < parts.length - 1 && (p = parts[i]); i++) {
        if (p.type === 'descendant' && (pn = parts[i + 1]).line > p.line) {
          reporter.report('Line break in selector (forgot a comma?)', pn, rule);
        }
      }
    }
  });
}];
