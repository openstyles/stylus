export default [{
  desc: '.class or #id after an element tag is forbidden.',
  url: 'Disallow-overqualified-elements',
}, (rule, parser, reporter) => {
  const classes = {};
  const report = (part, mod) => {
    reporter.report(`"${part}" is overqualified, just use "${mod}" without element name.`,
      part, rule);
  };
  parser.addListener('startrule', event => {
    for (const selector of event.selectors) {
      for (const part of selector.parts) {
        if (!part.modifiers) continue;
        for (const mod of part.modifiers) {
          if (part.elementName && mod.type === 'id') {
            report(part, mod);
          } else if (mod.type === 'class') {
            (classes[mod] || (classes[mod] = []))
              .push({modifier: mod, part});
          }
        }
      }
    }
  });
  // one use means that this is overqualified
  parser.addListener('endstylesheet', () => {
    for (const prop of Object.values(classes)) {
      const {part, modifier} = prop[0];
      if (part.elementName && prop.length === 1) {
        report(part, modifier);
      }
    }
  });
}];
