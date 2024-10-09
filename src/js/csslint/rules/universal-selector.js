export default [{
  desc: 'Universal selector (*) is slow.',
  url: 'Disallow-universal-selector',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const {parts} of event.selectors) {
      const part = parts[parts.length - 1];
      if (part.elementName === '*') {
        reporter.report(rule.desc, part, rule);
      }
    }
  });
}];
