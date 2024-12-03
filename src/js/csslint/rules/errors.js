export default [{
  name: 'Parsing Errors',
  desc: 'Recoverable syntax errors.',
}, (rule, parser, reporter) => {
  parser.addListener('error', e => reporter.error(e.message, e, rule));
}];
