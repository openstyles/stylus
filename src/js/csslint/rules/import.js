export default [{
  desc: '@import prevents parallel downloads and may be blocked by CSP.',
  url: 'Disallow-%40import',
}, (rule, parser, reporter) => {
  parser.addListener('import', e => {
    reporter.report(rule.desc, e, rule);
  });
}];
