import {getPropName} from './-util';

export default [{
  desc: 'More than 9 `font-size` declarations.',
  url: 'Don%27t-use-too-many-font-size-declarations',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('property', event => {
    count += getPropName(event.property) === 'font-size';
  });
  parser.addListener('endstylesheet', () => {
    reporter.stat('font-sizes', count);
    if (count >= 10) reporter.rollupWarn(count + ': ' + rule.desc, rule);
  });
}];
