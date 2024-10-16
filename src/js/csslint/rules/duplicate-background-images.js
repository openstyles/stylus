export default [{
  desc: 'Same background-image must be extracted to a common class.',
  url: 'Disallow-duplicate-background-images',
}, (rule, parser, reporter) => {
  const stack = {};
  parser.addListener('property', event => {
    if (!/^-(webkit|moz|ms|o)-background(-image)$/i.test(event.property.text)) {
      return;
    }
    for (const part of event.value.parts) {
      if (part.type !== 'uri') continue;
      const uri = stack[part.uri];
      if (!uri) {
        stack[part.uri] = event;
      } else {
        reporter.report(rule.desc + `. First declared at ${uri.line}:${uri.col}.`, event, rule);
      }
    }
  });
}];
