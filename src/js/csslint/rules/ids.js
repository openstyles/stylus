export default [{
  desc: '#id selectors are forbidden.',
  url: 'Disallow-IDs-in-selectors',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const sel of event.selectors) {
      const cnt =
        sel.parts.reduce((sum = 0, {modifiers}) =>
          modifiers
            ? modifiers.reduce((sum2, mod) => sum2 + (mod.type === 'id'), 0)
            : sum, 0);
      if (cnt) {
        reporter.report(`Id in selector${cnt > 1 ? '!'.repeat(cnt) : '.'}`, sel, rule);
      }
    }
  });
}];
