export default [{
  desc: 'Qualified headings like `div h1`.',
  url: 'Disallow-qualified-headings',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const selector of event.selectors) {
      let first = true;
      for (const part of selector.parts) {
        const name = part.elementName;
        if (!first && name && /h[1-6]/.test(name)) {
          reporter.report(`Heading "${name}" should not be qualified.`, part, rule);
        }
        first = false;
      }
    }
  });
}];
