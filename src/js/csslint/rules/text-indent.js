import {getPropName, registerRuleEvents} from './-util';

export default [{
  desc: 'Large negative text-indent without `direction:ltr` causes problems in RTL languages.',
  url: 'Disallow-negative-text-indent',
}, (rule, parser, reporter) => {
  let textIndent, isLtr;
  registerRuleEvents(parser, {
    start() {
      textIndent = false;
      isLtr = false;
    },
    property(event) {
      if (event.inParens) return;
      const name = getPropName(event.property);
      const value = event.value;
      if (name === 'text-indent' && value.parts[0].number < -99) {
        textIndent = event.property;
      } else if (name === 'direction' && /^ltr$/i.test(value)) {
        isLtr = true;
      }
    },
    end() {
      if (textIndent && !isLtr) reporter.report(rule.desc, textIndent, rule);
    },
  });
}];
