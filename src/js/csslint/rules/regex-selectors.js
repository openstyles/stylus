export default [{
  desc: 'Slow attribute selectors with substring matching (^= $= *=. |= ~=).',
  url: 'Disallow-selectors-that-look-like-regular-expressions',
}, (rule, parser, reporter) => {
  parser.addListener('startrule', event => {
    for (const {parts} of event.selectors) {
      for (const {modifiers} of parts) {
        if (modifiers) {
          for (const mod of modifiers) {
            const eq = mod.type === 'attribute' && mod.args[2];
            if (eq && eq.length === 2) {
              reporter.report(`Slow attribute selector ${eq}.`, eq, rule);
            }
          }
        }
      }
    }
  });
}];
