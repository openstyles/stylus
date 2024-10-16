import {getPropName, registerRuleEvents} from './-util';

export default [{
  desc: 'Require an additional non-prefixed declaration when using vendor prefixes.',
  url: 'Require-standard-property-with-vendor-prefix',
}, (rule, parser, reporter) => {
  const propertiesToCheck = {
    '-webkit-border-radius': 'border-radius',
    '-webkit-border-top-left-radius': 'border-top-left-radius',
    '-webkit-border-top-right-radius': 'border-top-right-radius',
    '-webkit-border-bottom-left-radius': 'border-bottom-left-radius',
    '-webkit-border-bottom-right-radius': 'border-bottom-right-radius',
    '-o-border-radius': 'border-radius',
    '-o-border-top-left-radius': 'border-top-left-radius',
    '-o-border-top-right-radius': 'border-top-right-radius',
    '-o-border-bottom-left-radius': 'border-bottom-left-radius',
    '-o-border-bottom-right-radius': 'border-bottom-right-radius',
    '-moz-border-radius': 'border-radius',
    '-moz-border-radius-topleft': 'border-top-left-radius',
    '-moz-border-radius-topright': 'border-top-right-radius',
    '-moz-border-radius-bottomleft': 'border-bottom-left-radius',
    '-moz-border-radius-bottomright': 'border-bottom-right-radius',
    '-moz-column-count': 'column-count',
    '-webkit-column-count': 'column-count',
    '-moz-column-gap': 'column-gap',
    '-webkit-column-gap': 'column-gap',
    '-moz-column-rule': 'column-rule',
    '-webkit-column-rule': 'column-rule',
    '-moz-column-rule-style': 'column-rule-style',
    '-webkit-column-rule-style': 'column-rule-style',
    '-moz-column-rule-color': 'column-rule-color',
    '-webkit-column-rule-color': 'column-rule-color',
    '-moz-column-rule-width': 'column-rule-width',
    '-webkit-column-rule-width': 'column-rule-width',
    '-moz-column-width': 'column-width',
    '-webkit-column-width': 'column-width',
    '-webkit-column-span': 'column-span',
    '-webkit-columns': 'columns',
    '-moz-box-shadow': 'box-shadow',
    '-webkit-box-shadow': 'box-shadow',
    '-moz-transform': 'transform',
    '-webkit-transform': 'transform',
    '-o-transform': 'transform',
    '-ms-transform': 'transform',
    '-moz-transform-origin': 'transform-origin',
    '-webkit-transform-origin': 'transform-origin',
    '-o-transform-origin': 'transform-origin',
    '-ms-transform-origin': 'transform-origin',
    '-moz-box-sizing': 'box-sizing',
    '-webkit-box-sizing': 'box-sizing',
  };
  const stack = [];
  let props, num;
  registerRuleEvents(parser, {
    start() {
      stack.push({num, props});
      props = {};
      num = 1;
    },
    property(event) {
      if (!props || event.inParens) return;
      const name = getPropName(event.property);
      let prop = props[name];
      if (!prop) prop = props[name] = [];
      prop.push({
        name: event.property,
        value: event.value,
        pos: num++,
      });
    },
    end() {
      const needsStandard = [];
      for (const prop in props) {
        if (prop in propertiesToCheck) {
          needsStandard.push({
            actual: prop,
            needed: propertiesToCheck[prop],
          });
        }
      }
      for (const {needed, actual} of needsStandard) {
        const unit = props[actual][0].name;
        if (!props[needed]) {
          reporter.report(`Missing standard property "${needed}" to go along with "${actual}".`,
            unit, rule);
        } else if (props[needed][0].pos < props[actual][0].pos) {
          reporter.report(
            `Standard property "${needed}" should come after vendor-prefixed property "${actual}".`,
            unit, rule);
        }
      }
      ({num, props} = stack.pop());
    },
  });
}];
