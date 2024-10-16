export default [{
  desc: 'Nested @import, @charset, @namespace inside @-moz-document.',
}, (rule, parser, reporter) => {
  let level = 0;
  let index = 0;
  parser.addListener('startdocument', () => level++);
  parser.addListener('enddocument', () => level-- * index++);
  const check = event => {
    if (level && index) {
      reporter.report(`A nested @${event.type} is valid only if this @-moz-document section ` +
        'is the first one matched for any given URL.', event, rule);
    }
  };
  parser.addListener('import', check);
  parser.addListener('charset', check);
  parser.addListener('namespace', check);
}];
