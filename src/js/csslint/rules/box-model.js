import {getPropName, registerRuleEvents} from './-util';

export default [{
  desc: 'width or height specified with padding or border and no box-sizing.',
  url: 'Beware-of-box-model-size',
}, (rule, parser, reporter) => {
  const sizeProps = {
    width: ['border', 'border-left', 'border-right', 'padding', 'padding-left', 'padding-right'],
    height: ['border', 'border-bottom', 'border-top', 'padding', 'padding-bottom', 'padding-top'],
  };
  const stack = [];
  let props;
  registerRuleEvents(parser, {
    start() {
      stack.push(props);
      props = {};
    },
    property(event) {
      if (!props || event.inParens) return;
      const name = getPropName(event.property);
      if (sizeProps.width.includes(name) || sizeProps.height.includes(name)) {
        if (!/^0+\D*$/.test(event.value) &&
          (name !== 'border' || !/^none$/i.test(event.value))) {
          props[name] = {
            line: event.property.line,
            col: event.property.col,
            value: event.value,
          };
        }
      } else if (name === 'box-sizing' ||
        /^(width|height)/i.test(name) &&
        /^(length|%)/.test(event.value.parts[0].type)) {
        props[name] = 1;
      }
    },
    end() {
      if (!props['box-sizing']) {
        for (const size in sizeProps) {
          if (!props[size]) continue;
          for (const prop of sizeProps[size]) {
            if (prop !== 'padding' || !props[prop]) continue;
            const {value: {parts}, line, col} = props[prop];
            if (parts.length !== 2 || parts[0].number) {
              reporter.report(
                `No box-sizing and ${size} in ${prop}`,
                {line, col}, rule);
            }
          }
        }
      }
      props = stack.pop();
    },
  });
}];
