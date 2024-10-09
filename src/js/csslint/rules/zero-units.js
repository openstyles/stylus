export default [{
  desc: 'Unit suffix for "0" is redundant.',
  url: 'Disallow-units-for-zero-values',
}, (rule, parser, reporter) => {
  parser.addListener('property', event => {
    for (const p of event.value.parts) {
      if (p.is0 && p.units && p.type !== 'time') {
        reporter.report('"0" value with redundant units.', p, rule);
      }
    }
  });
}];
