import {kAtRuleNoUnknown, kDeclValue, kGradientDir, kRulesOvr} from '@/js/consts';

const WARNING = {severity: 'warning'};
const ENABLED_AS_WARNING = [true, WARNING];
const kNoInvalidPositionDeclaration = 'no-invalid-position-declaration';
const kPropertyNoUnknown = 'property-no-unknown';
export const DEFAULTS = {
  stylelint: {
    // Silencing useless checks for LESS and Stylus where vars/funcs are seen by postcss as at-rules
    [kRulesOvr + 'less']: {
      [kAtRuleNoUnknown]: null,
      [kDeclValue]: null,
    },
    [kRulesOvr + 'stylus']: {
      [kAtRuleNoUnknown]: null,
      [kDeclValue]: null,
      [kNoInvalidPositionDeclaration]: null,
      [kPropertyNoUnknown]: null,
    },
    // WARNING! onConfigSave() expects these rules to be arrays and enabled.
    rules: {
      'at-rule-descriptor-no-unknown': ENABLED_AS_WARNING,
      'at-rule-descriptor-value-no-unknown': ENABLED_AS_WARNING,
      [kAtRuleNoUnknown]: ENABLED_AS_WARNING,
      'block-no-empty': ENABLED_AS_WARNING,
      'color-no-invalid-hex': ENABLED_AS_WARNING,
      'declaration-block-no-duplicate-properties': [true, {
        'ignore': ['consecutive-duplicates-with-different-values'],
        ...WARNING,
      }],
      'declaration-block-no-shorthand-property-overrides': ENABLED_AS_WARNING,
      [kDeclValue]: ENABLED_AS_WARNING,
      'font-family-no-duplicate-names': ENABLED_AS_WARNING,
      'function-calc-no-unspaced-operator': ENABLED_AS_WARNING,
      [kGradientDir]: ENABLED_AS_WARNING,
      'keyframe-declaration-no-important': ENABLED_AS_WARNING,
      'media-feature-name-no-unknown': ENABLED_AS_WARNING,
      'nesting-selector-no-missing-scoping-root': ENABLED_AS_WARNING,
      'no-invalid-double-slash-comments': ENABLED_AS_WARNING,
      [kNoInvalidPositionDeclaration]: ENABLED_AS_WARNING,
      [kPropertyNoUnknown]: ENABLED_AS_WARNING,
      'selector-no-invalid': ENABLED_AS_WARNING,
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
    'selector-newline-no-indent': 1,
    'shorthand-overrides': 1,
    'warnings': 1,
  },
};
