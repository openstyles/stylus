export default [{
  desc: 'Rule without declarations must be removed.',
  url: 'Disallow-empty-rules',
}, (rule, parser, reporter) => {
  parser.addListener('endrule', event => {
    if (event.empty) reporter.report('Empty rule.', event.selectors[0], rule);
  });
}];
