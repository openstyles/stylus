import {getPropName, registerRuleEvents} from './-util';

export default [{
  desc: 'none or 0 for `outline` outside of :focus rule.',
  url: 'Disallow-outline%3Anone',
}, (rule, parser, reporter) => {
  let lastRule;
  registerRuleEvents(parser, {
    start(event) {
      lastRule = !event.selectors ? null : {
        line: event.line,
        col: event.col,
        selectors: event.selectors,
        propCount: 0,
        outline: false,
      };
    },
    property(event) {
      if (!lastRule || event.inParens) return;
      lastRule.propCount++;
      if (getPropName(event.property) === 'outline' && /^(none|0)$/i.test(event.value)) {
        lastRule.outline = true;
      }
    },
    end() {
      const {outline, selectors, propCount} = lastRule || {};
      lastRule = null;
      if (!outline) return;
      if (!/:focus/i.test(selectors)) {
        reporter.report('Outlines should only be modified using :focus.', lastRule, rule);
      } else if (propCount === 1) {
        reporter.report("Outlines shouldn't be hidden unless other visual changes are made.",
          lastRule, rule);
      }
    },
  });
}];
