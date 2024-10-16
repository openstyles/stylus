import {registerShorthandEvents, shorthands} from './-util';

export default [{
  desc: 'Use shorthand declaration instead of several individual properties.',
  url: 'Require-shorthand-properties',
}, (rule, parser, reporter) => {
  registerShorthandEvents(parser, {
    end(event, props) {
      for (const [sh, events] of Object.entries(props)) {
        const names = Object.keys(events);
        if (names.length === shorthands[sh].length) {
          const msg = `"${sh}" shorthand can replace "${names.join('" + "')}"`;
          names.forEach(n => reporter.report(msg, events[n], rule));
        }
      }
    },
  });
}];
