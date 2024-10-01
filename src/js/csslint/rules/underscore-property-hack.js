export default [{
  url: 'Disallow-underscore-hack',
  desc: 'Forbid underscore prefixed _property (IE6 hack).',
}, (rule, parser, reporter) => {
  parser.addListener('property', ({property}) => {
    if (property.hack === '_') {
      reporter.report('IE underscore prefix.', property, rule);
    }
  });
}];
