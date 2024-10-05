import {getPropName, registerRuleEvents} from './-util';

export default [{
  desc: 'Properties must be ordered alphabetically.',
}, (rule, parser, reporter) => {
  const stack = [];
  let last, failed;
  registerRuleEvents(parser, {
    start() {
      stack.push({last, failed});
      last = '';
      failed = false;
    },
    property(event) {
      if (event.inParens) return;
      if (!failed) {
        const name = getPropName(event.property);
        if (name < last) {
          reporter.report(`Non-alphabetical order: "${name}".`, event, rule);
          failed = true;
        }
        last = name;
      }
    },
    end() {
      ({last, failed} = stack.pop());
    },
  });
}];
