import {registerRuleEvents} from './-util';

export default [{
  desc: 'Duplicate properties must be next to each other; exact duplicates are forbidden.',
  url: 'Disallow-duplicate-properties',
}, (rule, parser, reporter) => {
  const stack = [];
  let props, lastName;
  registerRuleEvents(parser, {
    start() {
      stack.push(props);
      props = {};
    },
    property(event) {
      if (!props || event.inParens) return;
      const property = event.property;
      const name = property.text.toLowerCase();
      const last = props[name];
      const dupValue = last === event.value.text;
      if (last && (lastName !== name || dupValue)) {
        reporter.report(`${dupValue ? 'Duplicate' : 'Ungrouped duplicate'} "${property}".`,
          event, rule);
      }
      props[name] = event.value.text;
      lastName = name;
    },
    end() {
      props = stack.pop();
    },
  });
}];
