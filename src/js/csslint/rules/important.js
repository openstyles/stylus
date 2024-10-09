export default [{
  desc: 'More than 9 !important declarations.',
  url: 'Disallow-%21important',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('property', event => {
    if (event.important) {
      count++;
      reporter.report('!important.', event, rule);
    }
  });
  parser.addListener('endstylesheet', () => {
    reporter.stat('important', count);
    if (count >= 10) reporter.rollupWarn(count + ': ' + rule.desc, rule);
  });
}];
