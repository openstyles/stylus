export default [{
  desc: 'Forbid redefinition of headings.',
  url: 'Headings-should-only-be-defined-once',
}, (rule, parser, reporter) => {
  const headings = new Array(6).fill(0);
  parser.addListener('startrule', event => {
    for (const {parts} of event.selectors) {
      const p = parts[parts.length - 1];
      if (/h([1-6])/i.test(p.elementName) &&
          !p.modifiers.some(mod => mod.type === 'pseudo') &&
          ++headings[RegExp.$1 - 1] > 1) {
        reporter.report(`Heading ${p.elementName} has already been defined.`, p, rule);
      }
    }
  });
  parser.addListener('endstylesheet', () => {
    const stats = headings
      .filter(h => h > 1)
      .map((h, i) => `${h} H${i + 1}s`);
    if (stats.length) {
      reporter.rollupWarn(stats.join(', '), rule);
    }
  });
}];
