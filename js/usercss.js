/* global loadScript mozParser */

'use strict';

// eslint-disable-next-line no-var
var usercss = (function () {
  function semverTest(a, b) {
    a = a.split('.').map(Number);
    b = b.split('.').map(Number);

    for (let i = 0; i < a.length; i++) {
      if (!(i in b)) {
        return 1;
      }
      if (a[i] < b[i]) {
        return -1;
      }
      if (a[i] > b[i]) {
        return 1;
      }
    }

    if (a.length < b.length) {
      return -1;
    }

    return 0;
  }

  function guessType(value) {
    if (/^url\(.+\)$/i.test(value)) {
      return 'image';
    }
    if (/^#[0-9a-f]{3,8}$/i.test(value)) {
      return 'color';
    }
    if (/^hsla?\(.+\)$/i.test(value)) {
      return 'color';
    }
    if (/^rgba?\(.+\)$/i.test(value)) {
      return 'color';
    }
    // should we use a color-name table to guess type?
    return 'text';
  }

  const BUILDER = {
    default: {
      postprocess(sections, vars) {
        let varDef = ':root {\n';
        for (const key of Object.keys(vars)) {
          varDef += `  --${key}: ${vars[key].value};\n`;
        }
        varDef += '}\n';

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

  function _buildMeta(source) {
    const style = {
      name: null,
      usercss: true,
      version: null,
      source: source,
      enabled: true,
      sections: [],
      vars: {},
      preprocessor: null
    };

    const metaSource = getMetaSource(source);

    const match = (re, callback) => {
      let m;
      if (!re.global) {
        if ((m = metaSource.match(re))) {
          if (m.length === 1) {
            callback(m[0]);
          } else {
            callback(...m.slice(1));
          }
        }
      } else {
        const result = [];
        while ((m = re.exec(metaSource))) {
          if (m.length <= 2) {
            result.push(m[m.length - 1]);
          } else {
            result.push(m.slice(1));
          }
        }
        if (result.length) {
          callback(result);
        }
      }
    };

    // FIXME: finish all metas
    match(/@name[^\S\r\n]+(.+?)[^\S\r\n]*$/m, m => (style.name = m));
    match(/@namespace[^\S\r\n]+(\S+)/, m => (style.namespace = m));
    match(/@preprocessor[^\S\r\n]+(\S+)/, m => (style.preprocessor = m));
    match(/@version[^\S\r\n]+(\S+)/, m => (style.version = m));
    match(
      /@var[^\S\r\n]+(\S+)[^\S\r\n]+(?:(['"])((?:\\\2|.)*?)\2|(\S+))[^\S\r\n]+(.+?)[^\S\r\n]*$/gm,
      ms => ms.forEach(([key,, label1, label2, value]) => (
        style.vars[key] = {
          type: guessType(value),
          label: label1 || label2,
          value: null,  // '.value' holds the value set by users.
          default: value // '.default' holds the value extract from meta.
        }
      ))
    );

    return style;
  }

  function buildCode(style) {
    let builder;
    if (style.preprocessor && style.preprocessor in BUILDER) {
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
  }

  return {buildMeta, buildCode, semverTest};
})();
