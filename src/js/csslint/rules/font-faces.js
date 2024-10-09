export default [{
  desc: 'More than 5 web fonts.',
  url: 'Don%27t-use-too-many-web-fonts',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('startfontface', () => count++);
  parser.addListener('endstylesheet', () => {
    if (count > 5) reporter.rollupWarn(count + ': ' + rule.desc, rule);
  });
}];
