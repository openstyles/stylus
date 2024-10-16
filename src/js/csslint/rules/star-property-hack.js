export default [{
  desc: 'Forbid star prefixed *property (IE6 hack).',
  url: 'Disallow-star-hack',
}, (rule, parser, reporter) => {
  parser.addListener('property', ({property}) => {
    if (property.hack === '*') {
      reporter.report('IE star prefix.', property, rule);
    }
  });
}];
