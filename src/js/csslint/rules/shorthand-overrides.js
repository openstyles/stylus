import {registerShorthandEvents} from './-util';

export default [{
  desc: 'Use shorthand declarations before individual properties.',
}, (rule, parser, reporter) => {
  registerShorthandEvents(parser, {
    property(event, props, name) {
      const ovr = props[name];
      if (ovr) {
        delete props[name];
        reporter.report(`"${event.property}" overrides "${Object.keys(ovr).join('" + "')}" above.`,
          event, rule);
      }
    },
  });
}];
