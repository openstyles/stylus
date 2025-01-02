'use strict';

/** Convert to ESM */
module.exports = function (text) {
  text = text
    .replace('var LZStringUnsafe = (function () {', '')
    .split(`\n  };\n})();\n`)[0]
    .split(`\n  return {\n`);
  return text[0] +
    text[1]
      .replaceAll(`\n    },\n`, '\n}\n')
      .replace(/(?:^|\n)\s+(\w+): (\w+),?/g, (s, id, func) => '\nexport ' + (
        func === 'function'
          ? `${func} ${id}`
          : `{${func} as ${id}}`
      ));
};
