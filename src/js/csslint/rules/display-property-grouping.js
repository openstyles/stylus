import {getPropName, registerRuleEvents} from './-util';

export default [{
  desc: 'Must use properties compatible with the value of `display`.',
  url: 'Require-properties-appropriate-for-display',
}, (rule, parser, reporter) => {
  let props;
  const propertiesToCheck = {
    'display': 1,
    'float': 'none',
    'height': 1,
    'width': 1,
    'margin': 1,
    'margin-left': 1,
    'margin-right': 1,
    'margin-bottom': 1,
    'margin-top': 1,
    'padding': 1,
    'padding-left': 1,
    'padding-right': 1,
    'padding-bottom': 1,
    'padding-top': 1,
    'vertical-align': 1,
  };
  const stack = [];
  const reportProperty = (name, display, msg) => {
    const prop = props[name];
    if (prop && propertiesToCheck[name] !== prop.value.toLowerCase()) {
      reporter.report(msg || `"${name}" can't be used with display: ${display}.`, prop, rule);
    }
  };
  const INLINE = ['height', 'width', 'margin', 'margin-top', 'margin-bottom'];
  const TABLE = ['margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'float'];
  registerRuleEvents(parser, {
    start() {
      stack.push(props);
      props = {};
    },
    property(event) {
      if (!props || event.inParens) return;
      const name = getPropName(event.property);
      if (name in propertiesToCheck) {
        props[name] = {
          value: event.value.text,
          line: event.property.line,
          col: event.property.col,
        };
      }
    },
    end() {
      let v;
      if (props && (v = props.display)) {
        v = v.value.toLowerCase();
        if (v === 'inline') {
          for (const p of INLINE) reportProperty(p, v);
          reportProperty('float', v,
            '"display:inline" has no effect on floated elements ' +
            '(but may be used to fix the IE6 double-margin bug).');
        } else if (v === 'block') {
          reportProperty('vertical-align', v);
        } else if (v === 'inline-block') {
          reportProperty('float', v);
        } else if (v && /^table-/i.test(v)) {
          for (const p of TABLE) reportProperty(p, v);
        }
      }
      props = stack.pop();
    },
  });
}];
