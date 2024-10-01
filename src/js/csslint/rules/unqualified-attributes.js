export default [{
  desc: 'Unqualified attribute selector is slow.',
  name: 'Disallow-unqualified-attribute-selectors',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    event.selectors.forEach(({parts}) => {
      const part = parts[parts.length - 1];
      const mods = part.modifiers;
      if (mods && (part.elementName || '*') === '*') {
        let attr;
        for (const m of mods) {
          if (m.type === 'class' || m.type === 'id') return;
          if (m.type === 'attribute') attr = m;
        }
        if (attr) reporter.report(rule.desc, attr, rule);
      }
    });
  });
}];
