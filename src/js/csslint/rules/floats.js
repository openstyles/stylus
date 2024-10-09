import {getPropName} from './-util';

export default [{
  desc: 'More than 9 `float` declarations. Consider using a grid system instead.',
  url: 'Disallow-too-many-floats',
}, (rule, parser, reporter) => {
  let count = 0;
  parser.addListener('property', ({property, value}) => {
    count +=
      getPropName(property) === 'float' &&
      value.text.toLowerCase() !== 'none';
  });
  parser.addListener('endstylesheet', () => {
    reporter.stat('floats', count);
    if (count >= 10) reporter.rollupWarn(count + ': ' + rule.desc, rule);
  });
}];
