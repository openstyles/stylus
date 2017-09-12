/* global loadScript mozParser semverCompare */

'use strict';

// eslint-disable-next-line no-var
var usercss = (function () {
  const METAS = [
    'author', 'description', 'homepageURL', 'icon', 'license', 'name',
    'namespace', 'noframes', 'preprocessor', 'supportURL', 'var', 'version'
  ];

  const BUILDER = {
    default: {
      postprocess(sections, vars) {
        let varDef =
          ':root {\n' +
          Object.keys(vars).map(k => `  --${k}: ${vars[k].value};\n`).join('') +
          '}\n';

        for (const section of sections) {
          section.code = varDef + section.code;
        }
      }
    },
    stylus: {
      preprocess(source, vars) {
        return loadScript('vendor/stylus-lang/stylus.min.js').then(() => (
          new Promise((resolve, reject) => {
            let varDef = '';
            for (const key of Object.keys(vars)) {
              varDef += `${key} = ${vars[key].value};\n`;
            }

            // eslint-disable-next-line no-undef
            stylus(varDef + source).render((err, output) => {
              if (err) {
                reject(err);
              } else {
                resolve(output);
              }
            });
          })
        ));
      }
    }
  };

  const colorParser = (function () {
    const el = document.createElement('div');
    // https://bugs.webkit.org/show_bug.cgi?id=14563
    document.head.appendChild(el);

    function _parse(color) {
      const [r, g, b, a = 1] = color.match(/[.\d]+/g).map(Number);
      return {r, g, b, a};
    }

    function parse(color) {
      el.style.color = color;
      if (el.style.color === '') {
        throw new Error(chrome.i18n.getMessage('styleMetaErrorColor', color));
      }
      color = getComputedStyle(el).color;
      el.style.color = '';
      return _parse(color);
    }

    function format({r, g, b, a = 1}) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    function pad(s) {
      if (s.padStart) {
        // chrome 57+
        return s.padStart(2, '0');
      }
      return `00${s}`.slice(-2);
    }

    function formatHex({r, g, b, a = null}) {
      const values = [r, g, b];
      if (a !== null) {
        values.push(Math.floor(a * 255));
      }
      return '#' + values.map(n => pad(n.toString(16))).join('');
    }

    return {parse, format, formatHex};
  })();

  function getMetaSource(source) {
    const commentRe = /\/\*[\s\S]*?\*\//g;
    const metaRe = /==userstyle==[\s\S]*?==\/userstyle==/i;

    let m;
    // iterate through each comment
    while ((m = commentRe.exec(source))) {
      const commentSource = source.slice(m.index, m.index + m[0].length);
      const n = commentSource.match(metaRe);
      if (n) {
        return n[0];
      }
    }
  }

  function buildMeta(source) {
    const style = _buildMeta(source);
    validate(style);
    return style;
  }

  function *parseMetas(source) {
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/@(\w+)/);
      if (!match) {
        continue;
      }
      yield [match[1], line.slice(match.index + match[0].length).trim()];
    }
  }

  function matchString(s) {
    const match = matchFollow(s, /^(?:\w+|(['"])(?:\\\1|.)*?\1)/);
    match.value = match[1] ? match[0].slice(1, -1) : match[0];
    return match;
  }

  function matchFollow(s, re) {
    const match = s.match(re);
    match.follow = s.slice(match.index + match[0].length).trim();
    return match;
  }

  function parseVar(source) {
    const result = {
      label: null,
      name: null,
      value: null,
      default: null,
      select: null
    };

    {
      // type & name
      const match = matchFollow(source, /^([\w-]+)\s+([\w-]+)/);
      ([, result.type, result.name] = match);
      source = match.follow;
    }

    {
      // label
      const match = matchString(source);
      result.label = match.value;
      source = match.follow;
    }

    // select type has an additional field
    if (result.type === 'select') {
      const match = matchString(source);
      try {
        result.select = JSON.parse(match.follow);
      } catch (err) {
        throw new Error(chrome.i18n.getMessage('styleMetaErrorSelect', err.message));
      }
      source = match.value;
    }

    result.default = source;

    return result;
  }

  function _buildMeta(source) {
    const style = {
      name: null,
      usercss: true,
      version: null,
      source: source,
      edited: false,
      enabled: true,
      sections: [],
      vars: {},
      preprocessor: null,
      noframes: false
    };

    const metaSource = getMetaSource(source);

    for (const [key, value] of parseMetas(metaSource)) {
      if (!METAS.includes(key)) {
        continue;
      }
      if (key === 'noframes') {
        style.noframes = true;
      } else if (key === 'var') {
        const va = parseVar(value);
        style.vars[va.name] = va;
      } else if (key === 'homepageURL') {
        style.url = value;
      } else {
        style[key] = value;
      }
    }

    return style;
  }

  function buildCode(style) {
    let builder;
    if (style.preprocessor) {
      if (!BUILDER.hasOwnProperty(style.preprocessor)) {
        return Promise.reject(new Error(`Unsupported preprocessor: ${style.preprocessor}`));
      }
      builder = BUILDER[style.preprocessor];
    } else {
      builder = BUILDER.default;
    }

    const vars = simpleVars(style.vars);

    return Promise.resolve().then(() => {
      // preprocess
      if (builder.preprocess) {
        return builder.preprocess(style.source, vars);
      }
      return style.source;
    }).then(mozStyle =>
      // moz-parser
      loadScript('/js/moz-parser.js').then(() =>
        mozParser.parse(mozStyle).then(sections => {
          style.sections = sections;
        })
      )
    ).then(() => {
      // postprocess
      if (builder.postprocess) {
        return builder.postprocess(style.sections, vars);
      }
    }).then(() => style);
  }

  function simpleVars(vars) {
    // simplify vars by merging `va.default` to `va.value`, so BUILDER don't
    // need to test each va's default value.
    return Object.keys(vars).reduce((output, key) => {
      const va = vars[key];
      output[key] = {
        value: va.value === null || va.value === undefined ?
          va.default : va.value
      };
      return output;
    }, {});
  }

  function validate(style) {
    // mandatory fields
    for (const prop of ['name', 'namespace', 'version']) {
      if (!style[prop]) {
        throw new Error(chrome.i18n.getMessage('styleMissingMeta', prop));
      }
    }
    // validate version
    semverCompare(style.version, '0.0.0');

    // validate URLs
    validUrl(style.url);
    validUrl(style.supportURL);

    // validate vars
    for (const key of Object.keys(style.vars)) {
      validVar(style.vars[key]);
    }
  }

  function validUrl(url) {
    if (!url) {
      return;
    }
    url = new URL(url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${url.protocol} is not a valid protocol`);
    }
  }

  function validVar(va, value = 'default') {
    if (va.type === 'select' && !va.select[va[value]]) {
      throw new Error(chrome.i18n.getMessage('styleMetaErrorSelectMissingKey', va[value]));
    } else if (va.type === 'checkbox' && !/^[01]$/.test(va[value])) {
      throw new Error(chrome.i18n.getMessage('styleMetaErrorCheckbox'));
    } else if (va.type === 'color') {
      va[value] = colorParser.format(colorParser.parse(va[value]));
    }
  }

  function assignVars(style, old) {
    // The type of var might be changed during the update. Set value to null if the value is invalid.
    for (const key of Object.keys(style.vars)) {
      if (old.vars[key] && old.vars[key].value) {
        style.vars[key].value = old.vars[key].value;
        try {
          validVar(style.vars[key], 'value');
        } catch (err) {
          style.vars[key].value = null;
        }
      }
    }
  }

  return {buildMeta, buildCode, colorParser, assignVars};
})();
