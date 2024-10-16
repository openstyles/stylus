export default [{
  desc: 'Unknown property per CSS spec without a vendor prefix.',
  url: 'Require-use-of-known-properties',
}, (rule, parser, reporter) => {
  parser.addListener('property', event => {
    const inv = event.invalid;
    if (inv) reporter.report(inv.message, inv, rule);
  });
}];
