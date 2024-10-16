export default [{
  desc: 'Require all compatible vendor prefixes.',
  url: 'Require-compatible-vendor-prefixes',
}, (rule, parser, reporter) => {
  // See http://peter.sh/experiments/vendor-prefixed-css-property-overview/ for details
  const compatiblePrefixes = {
    'animation': 'webkit',
    'animation-delay': 'webkit',
    'animation-direction': 'webkit',
    'animation-duration': 'webkit',
    'animation-fill-mode': 'webkit',
    'animation-iteration-count': 'webkit',
    'animation-name': 'webkit',
    'animation-play-state': 'webkit',
    'animation-timing-function': 'webkit',
    'appearance': 'webkit moz',
    'border-end': 'webkit moz',
    'border-end-color': 'webkit moz',
    'border-end-style': 'webkit moz',
    'border-end-width': 'webkit moz',
    'border-image': 'webkit moz o',
    'border-radius': 'webkit',
    'border-start': 'webkit moz',
    'border-start-color': 'webkit moz',
    'border-start-style': 'webkit moz',
    'border-start-width': 'webkit moz',
    'box-align': 'webkit moz',
    'box-direction': 'webkit moz',
    'box-flex': 'webkit moz',
    'box-lines': 'webkit',
    'box-ordinal-group': 'webkit moz',
    'box-orient': 'webkit moz',
    'box-pack': 'webkit moz',
    'box-sizing': '',
    'box-shadow': '',
    'column-count': 'webkit moz ms',
    'column-gap': 'webkit moz ms',
    'column-rule': 'webkit moz ms',
    'column-rule-color': 'webkit moz ms',
    'column-rule-style': 'webkit moz ms',
    'column-rule-width': 'webkit moz ms',
    'column-width': 'webkit moz ms',
    'flex': 'webkit ms',
    'flex-basis': 'webkit',
    'flex-direction': 'webkit ms',
    'flex-flow': 'webkit',
    'flex-grow': 'webkit',
    'flex-shrink': 'webkit',
    'hyphens': 'epub moz',
    'line-break': 'webkit ms',
    'margin-end': 'webkit moz',
    'margin-start': 'webkit moz',
    'marquee-speed': 'webkit wap',
    'marquee-style': 'webkit wap',
    'padding-end': 'webkit moz',
    'padding-start': 'webkit moz',
    'tab-size': 'moz o',
    'text-size-adjust': 'webkit ms',
    'transform': 'webkit ms',
    'transform-origin': 'webkit ms',
    'transition': '',
    'transition-delay': '',
    'transition-duration': '',
    'transition-property': '',
    'transition-timing-function': '',
    'user-modify': 'webkit moz',
    'user-select': 'webkit moz ms',
    'word-break': 'epub ms',
    'writing-mode': 'epub ms',
  };
  const applyTo = [];
  let properties = [];
  let inKeyFrame = false;
  let started = 0;

  for (const prop in compatiblePrefixes) {
    const variations = compatiblePrefixes[prop].split(' ').map(s => `-${s}-${prop}`);
    compatiblePrefixes[prop] = variations;
    applyTo.push(...variations);
  }

  parser.addListener('startrule', () => {
    started++;
    properties = [];
  });

  parser.addListener('startkeyframes', event => {
    started++;
    inKeyFrame = event.prefix || true;
    if (inKeyFrame && typeof inKeyFrame === 'string') {
      inKeyFrame = '-' + inKeyFrame + '-';
    }
  });

  parser.addListener('endkeyframes', () => {
    started--;
    inKeyFrame = false;
  });

  parser.addListener('property', event => {
    if (!started) return;
    const name = event.property.text;
    if (inKeyFrame &&
        typeof inKeyFrame === 'string' &&
        name.startsWith(inKeyFrame) ||
        !applyTo.includes(name)) {
      return;
    }
    properties.push(event.property);
  });

  parser.addListener('endrule', () => {
    started = false;
    if (!properties.length) return;
    const groups = {};
    for (const name of properties) {
      for (const prop in compatiblePrefixes) {
        const variations = compatiblePrefixes[prop];
        if (!variations.includes(name.text)) {
          continue;
        }
        if (!groups[prop]) {
          groups[prop] = {
            full: variations.slice(0),
            actual: [],
            actualNodes: [],
          };
        }
        if (!groups[prop].actual.includes(name.text)) {
          groups[prop].actual.push(name.text);
          groups[prop].actualNodes.push(name);
        }
      }
    }
    for (const prop in groups) {
      const value = groups[prop];
      const actual = value.actual;
      const len = actual.length;
      if (value.full.length <= len) continue;
      for (const item of value.full) {
        if (!actual.includes(item)) {
          const spec = len === 1 ? actual[0] : len === 2 ? actual.join(' and ') : actual.join(', ');
          reporter.report(
            `"${item}" is compatible with ${spec} and should be included as well.`,
            value.actualNodes[0], rule);
        }
      }
    }
  });
}];
