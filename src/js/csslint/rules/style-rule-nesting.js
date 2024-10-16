import {registerRuleEvents} from './-util';

export default [{
  desc: 'Nesting inside style rules is not backwards-compatible.',
}, (rule, parser, reporter) => {
  registerRuleEvents(parser, {
    start(evt) {
      if (parser._inStyle) reporter.report(rule.desc, evt, rule);
    },
  });
}];
