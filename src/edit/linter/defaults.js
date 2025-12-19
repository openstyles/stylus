const WARNING = {severity: 'warning'};
const ENABLED_AS_WARNING = [true, WARNING];
export const DEFAULTS = {
  stylelint: {
    // WARNING! onConfigSave() expects these rules to be arrays and enabled.
    rules: {
      'at-rule-no-unknown': [true, {
        'ignoreAtRules': ['extend', 'extends', 'css', 'block'],
        ...WARNING,
      }],
      'block-no-empty': ENABLED_AS_WARNING,
      'color-no-invalid-hex': ENABLED_AS_WARNING,
      'declaration-block-no-duplicate-properties': [true, {
        'ignore': ['consecutive-duplicates-with-different-values'],
        ...WARNING,
      }],
      'declaration-block-no-shorthand-property-overrides': ENABLED_AS_WARNING,
      'font-family-no-duplicate-names': ENABLED_AS_WARNING,
      'function-calc-no-unspaced-operator': ENABLED_AS_WARNING,
      'function-linear-gradient-no-nonstandard-direction': ENABLED_AS_WARNING,
      'keyframe-declaration-no-important': ENABLED_AS_WARNING,
      'media-feature-name-no-unknown': ENABLED_AS_WARNING,
      'no-invalid-double-slash-comments': ENABLED_AS_WARNING,
      'property-no-unknown': ENABLED_AS_WARNING,
      'selector-pseudo-class-no-unknown': ENABLED_AS_WARNING,
      'selector-pseudo-element-no-unknown': ENABLED_AS_WARNING,
      'string-no-newline': ENABLED_AS_WARNING,
      'unit-no-unknown': ENABLED_AS_WARNING,
    },
  },
  csslint: {
    'display-property-grouping': 1,
    'duplicate-properties': 1,
    'empty-rules': 1,
    'errors': 1,
    'globals-in-document': 1,
    'known-properties': 1,
    'known-pseudos': 1,
    'selector-newline': 1,
    'shorthand-overrides': 1,
    'simple-not': 1,
    'warnings': 1,
  },
};
