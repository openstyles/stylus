export let less, parserlib, stylusLang;

export const {importScripts} = global;
export const load = (file, name) => importScripts(file) || global[name];
export const loadLess = () =>
  (less = load('less.js', 'less'));
export const loadParserlib = () =>
  (parserlib = load('parserlib.js', 'parserlib'));
export const loadStylusLang = () =>
  (stylusLang = load('stylus-lang.js', 'stylus'));

export const compileLess = (code, vars) => {
  if (!less) loadLess();
  return less.render(code, {
    math: 'parens-division',
    modifyVars: vars,
  }, !vars && ((err, res) => (code = err ? err.type !== 'Syntax' : res.css)))
    || code;
};

export const compileStylus = (code, vars) => {
  if (!stylusLang)
    loadStylusLang();
  if (vars) {
    compileStylusVars();
    return stylusLang(code, vars).render();
  }
  try {
    return stylusLang(code).render();
  } catch {}
};

const compileStylusVars = vars => {
  for (const key in vars) {
    let val = vars[key].value;
    try {
      val = new stylusLang.Parser(`(${val})`).parse();
      val = new stylusLang.Evaluator(val).evaluate();
      do val = val.nodes[0]; while (val.nodeName === 'expression' && val.nodes.length);
      vars[key] = val;
    } catch (err) {
      err.message += '\n' + key + ' = ' + val;
      throw err;
    }
  }
};
