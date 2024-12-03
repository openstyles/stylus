import {registerRuleEvents} from './-util';

export default [{
  desc: 'Require all vendor prefixes when using a vendor-prefixed gradient.',
  url: 'Require-all-gradient-definitions',
}, (rule, parser, reporter) => {
  const stack = [];
  let miss;
  registerRuleEvents(parser, {
    start() {
      stack.push(miss);
      miss = null;
    },
    property({inParens, value: {parts: [p]}}) {
      if (inParens) return;
      if (p && p.prefix && /(-|^)gradient$/.test(p.name)) {
        if (!miss) miss = {'-moz-': p, '-webkit-': p};
        delete miss[p.prefix];
      }
    },
    end() {
      let k;
      if (miss && (k = Object.keys(miss))[0]) {
        reporter.report(`Missing ${k.join(',')} prefix${k[1] ? 'es' : ''} for gradient.`,
          miss[k[0]], rule);
      }
      miss = stack.pop();
    },
  });
}];
