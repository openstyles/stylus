import {createParser, ParseError} from 'usercss-meta';
import {importScriptsOnce} from './worker-util';

const PREPROCESSORS = new Set(['default', 'uso', 'stylus', 'less']);

// Custom parser for @match directive
function parseMatch(state) {
  // Parse single match pattern (one per @match directive)
  let currentMatch = '';
  let inQuotes = false;
  let quoteChar = '';

  while (state.lastIndex < state.text.length) {
    const char = state.text[state.lastIndex];

    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
      state.lastIndex++;
      continue;
    }

    if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = '';
      state.lastIndex++;
      continue;
    }

    if (!inQuotes && char === '\n') {
      break;
    }

    currentMatch += char;
    state.lastIndex++;
  }

  // Clean up the match pattern
  const cleanMatch = currentMatch.trim().replace(/^["']|["']$/g, '');

  // Initialize matches array if it doesn't exist
  if (!Array.isArray(state.usercssData.match)) {
    state.usercssData.match = [];
  }

  // Add this match pattern to the array
  if (cleanMatch) {
    state.usercssData.match.push(cleanMatch);
  }

  // Return the current pattern for validation
  state.value = cleanMatch;
}

// Post-process to collect all @match patterns
function collectAllMatches(metadata) {
  const allMatches = [];

  // Find all @match directives in the original text
  const matchRegex = /@match\s+([^\n]+)/g;
  let match;
  while ((match = matchRegex.exec(metadata)) !== null) {
    const pattern = match[1].trim().replace(/^["']|["']$/g, '');
    if (pattern) {
      allMatches.push(pattern);
    }
  }

  return allMatches;
}

// Validate @match pattern (similar to Tampermonkey patterns)
function isValidMatchPattern(pattern) {
  // Basic validation for @match patterns
  // Pattern should be in format: protocol://host/path
  // Examples: *://*.example.com/*, *://example.com/*, https://example.com/*

  if (!pattern || typeof pattern !== 'string') {
    return false;
  }

  // Check if it's a valid URL pattern
  try {
    // Replace wildcards with placeholder values for URL validation
    const testPattern = pattern
      .replace(/\*/g, 'example')
      .replace(/\/\*$/, '/test');

    new URL(testPattern);
    return true;
  } catch {
    return false;
  }
}
const options = {
  parseKey: {
    match: parseMatch,
  },
  validateKey: {
    preprocessor: state => {
      if (!PREPROCESSORS.has(state.value)) {
        throw new ParseError({
          code: 'unknownPreprocessor',
          args: [state.value],
          index: state.valueIndex,
        });
      }
    },
    match: state => {
      // Validate single match pattern
      if (!isValidMatchPattern(state.value)) {
        throw new ParseError({
          code: 'invalidMatchPattern',
          args: [state.value],
          index: state.valueIndex,
        });
      }
    },
  },
  // Don't overwrite match values, collect them instead
  unknownKey: 'assign',
  validateVar: {
    select: state => {
      if (state.varResult.options.every(o => o.name !== state.value)) {
        throw new ParseError({
          code: 'invalidSelectValueMismatch',
          index: state.valueIndex,
        });
      }
    },
    color: state => {
      importScriptsOnce('color-converter.js'); /* global colorConverter */
      const color = colorConverter.parse(state.value);
      if (!color) {
        throw new ParseError({
          code: 'invalidColor',
          args: [state.value],
          index: state.valueIndex,
        });
      }
      state.value = colorConverter.format(color);
    },
  },
};
const parser = createParser(options);
const looseParser = createParser(Object.assign({}, options, {
  allowErrors: true,
  unknownKey: 'throw',
}));

const metaParser = {

  lint: looseParser.parse,
  parse: text => {
    const result = parser.parse(text);
    // Post-process to collect all @match patterns
    if (result.metadata) {
      const allMatches = collectAllMatches(text);
      if (allMatches.length > 0) {
        result.metadata.match = allMatches;
      }
    }
    return result;
  },

  nullifyInvalidVars(vars) {
    for (const va of Object.values(vars)) {
      if (va.value !== null) {
        try {
          parser.validateVar(va);
        } catch {
          va.value = null;
        }
      }
    }
    return vars;
  },
};

export default metaParser;
