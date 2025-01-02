'use strict';

/**
 * Making exports directly invocable by converting `export const` to `export function`
 * and removing (0,export)() in invocations as we don't rely on `this` in general,
 * except cases where we expect it to be set explicitly e.g. `sender` for messages.
 *
 * Aside from a negligible performance improvement, it restores sane debugging process when
 * stepping line by line via F11 key to step inside the function. Previously, it would make 3
 * nonsensical jumps which became excrutiating when doing it on a line with several exports e.g.
 * mod.foo(mod.const1, mod.const2, mod.const3, mod.const4) with webpack's default implementation
 * would force you to step 15 times instead of 1.
 *
 * A function declaration is hoisted and initialized before execution starts in the scope,
 * so we can assign it immediately to the webpack exports map without making a getter.
 * Their names won't be minified/mangled thanks to `keep_fnames` in terser's options.
 *
 * A literal `const` is inlined, otherwise the value is remembered on the first access.
 */

const acorn = require('acorn');
const {SourceNode} = require('source-map-js');
const webpack = require('webpack');
const ReplaceSource = require('webpack-sources/lib/ReplaceSource');
const HarmonyExportSpecifierDependency =
  require('webpack/lib/dependencies/HarmonyExportSpecifierDependency');
const DefinePropertyGettersRuntimeModule =
  require('webpack/lib/runtime/DefinePropertyGettersRuntimeModule');

const rxExportArrow = /^export const (\$?\w*) = \([^)]*?\) =>/m;
/** Patching __.ABCD and (0,export)() in invocations */
const re = /\b__\.([$_A-Z][$_A-Z\d]*)\b|\(0,(\w+\.\$?\w*)\)/g;
const STAGE = (/**@type {typeof import('webpack/types').Compilation}*/webpack.Compilation)
  .PROCESS_ASSETS_STAGE_OPTIMIZE_COMPATIBILITY;
const STATIC = '/*static:';
const NAME = __filename.slice(__dirname.length);
const SYM = Symbol(NAME);
const CONST = 'const';
const FUNC = 'func';
const VAL = 'val';
const PATCH_EXPORTS_SRC = 'for(var key in definition) {';
const PATCH_EXPORTS = `$&
  let v = definition[key];
  if (typeof v == "object") {
  if (v[0]) exports[key] = v[1];
  else Object.defineProperty(exports, v[0] = key, {
    configurable: true,
    enumerable: true,
    get: () => Object.defineProperty(exports, v[0], {value: v = v[1]()}) && v,
  });
  continue;
}`;
let exportHooked;

class RawEnvPlugin {
  constructor(vars, raws = {}) {
    this.vars = vars;
    this.raws = raws;
  }
  apply(compiler) {
    compiler.hooks.compilation.tap(NAME, (compilation, params) => {
      const actor = compilation.options.plugins.find(p => p instanceof this.constructor);
      const map = actor.map ??= {};
      for (const [k, v] of Object.entries(this.vars)) map[k] = JSON.stringify(v);
      for (const [k, v] of Object.entries(this.raws)) map[k] = v;
      if (this !== actor) return;
      compilation.hooks.processAssets.tap({name: NAME, stage: STAGE}, assets => {
        for (const assetName in assets) {
          if (!assetName.endsWith('.js')) continue;
          const assetSource = assets[assetName];
          const str = assetSource.source();
          let replacer;
          for (let m, val; (m = re.exec(str));) {
            if ((val = m[2]) || (val = map[m[1]]) != null) {
              replacer ??= new ReplaceSource(assetSource);
              replacer.replace(m.index, m.index + m[0].length - 1, val);
            }
          }
          if (replacer) compilation.updateAsset(assetName, replacer);
        }
      });
      for (const type of ['auto', 'esm']) {
        params.normalModuleFactory.hooks.parser.for('javascript/' + type)
          .tap('staticExport', arrowToFuncParser);
      }
      exportHooked ??= hookFunc(compilation.runtimeTemplate, 'returningFunction', exportHook);
    });
  }
}

function arrowToFuncLoader(text) {
  if (!rxExportArrow.test(text)) {
    return text;
  }
  const source = new SourceNode(null, null, text);
  const comments = [];
  const ast = acorn.parse(text, {
    sourceType: 'module',
    ecmaVersion: 'latest',
    locations: true,
    ranges: true,
    onComment: comments,
  });
  ast.comments = comments;
  let iSrc = 0;
  for (const top of ast.body) {
    const td = top.declaration;
    if (!td || td.kind !== CONST || top.type !== 'ExportNamedDeclaration') {
      continue;
    }
    for (const dvar of td.declarations) {
      const init = dvar.init;
      if (init.type !== 'ArrowFunctionExpression') {
        continue;
      }
      const args = init.params;
      /** @type {Expression} */
      const body = init.body;
      const expr = body.type !== 'BlockStatement';
      if (iSrc < td.start) source.add(text.slice(iSrc, td.start));
      if (init.async) source.add('async ');
      source.add('function ');
      source.add(dvar.id.name);
      source.add('(');
      if (args[0]) source.add(text.slice(args[0].start, args.at(-1).end));
      source.add(')');
      if (expr) source.add('{return(');
      source.add(text.slice(body.start, body.end));
      if (expr) source.add(')}');
      iSrc = td.end;
    }
  }
  if (iSrc) {
    source.add(text.slice(iSrc));
    text = source.toStringWithSourceMap();
    this.callback(null, text.code, text.map.toJSON());
  } else {
    this.callback(null, text, null, {webpackAST: ast});
  }
}

/** @param {import('webpack/types').JavascriptParser} parser */
function arrowToFuncParser(parser) {
  /** @type {WeakMap<object, Map<string,string>>} */
  const topConsts = new WeakMap();
  parser.hooks.program.tap({name: arrowToFuncLoader.name}, /**@param {Program} ast*/ast => {
    let tc;
    for (let top of ast.body) {
      if (top.type === 'ExportNamedDeclaration')
        top = top.declaration;
      if (top?.kind !== CONST)
        continue;
      for (const td of top.declarations) {
        if (!(tc ??= topConsts.get(parser.scope)))
          topConsts.set(parser.scope, tc = new Map());
        tc.set(td.id.name, !td.init.regex && td.init.value || '');
      }
    }
  });
  parser.hooks.exportSpecifier.intercept({
    name: [arrowToFuncLoader.name],
    register(tap) {
      if (tap.name === 'HarmonyExportDependencyParserPlugin') {
        const {fn} = tap;
        tap.fn = (...args) => {
          const [exp, name, exportedName] = args;
          const res = fn.call(this, ...args);
          const dep = parser.state.current.dependencies.at(-1);
          if (dep?.name === exportedName) {
            let tc;
            const decl = exp.declaration;
            if (decl?.type === 'FunctionDeclaration') {
              dep[SYM] = FUNC;
            } else if (
              (decl?.kind === CONST || exp.specifiers) &&
              (tc = topConsts.get(parser.scope)?.get(name)) != null
            ) {
              dep[SYM] = !tc ? CONST : VAL + ' ' + JSON.stringify(tc).replaceAll('*/', '\n');
            }
            return res;
          }
        };
      }
      return tap;
    },
  });
}

function exportHook(...args) {
  let res = Reflect.apply(...args);
  let i = res.indexOf(STATIC);
  if (i >= 0) {
    const info = res.slice(i += STATIC.length, res.indexOf('*/', i));
    const type = info.match(/\w+/)[0];
    const val = type === CONST ? '0,' + res
      : type === FUNC ? '1,' + res.slice(i + info.length + 2, -1)
        : '2,' + info.slice(type.length + 1).replaceAll('\b', '*/');
    res = `${STATIC}${type}*/ [${val}]`;
  }
  return res;
}

function hookFunc(obj, name, hook) {
  if (typeof obj === 'function') obj = obj.prototype;
  obj[name] = new Proxy(obj[name], {apply: hook});
}

hookFunc(HarmonyExportSpecifierDependency.Template, 'apply', (fn, me, args) => {
  const [dep, /*source*/, {initFragments: frags}] = args;
  const old = frags.length;
  const res = Reflect.apply(fn, me, args);
  if (dep[SYM] && old < frags.length) {
    const boundVal = '/* binding */ ' + dep.id;
    frags.at(-1).exportMap.forEach((val, key, map) => {
      if (val === boundVal) map.set(key, `${STATIC}${dep[SYM]}*/${dep.id}`);
    });
  }
  return res;
});

hookFunc(DefinePropertyGettersRuntimeModule, 'generate', (...args) =>
  Reflect.apply(...args).replace(PATCH_EXPORTS_SRC, PATCH_EXPORTS));

module.exports = arrowToFuncLoader;
module.exports.RawEnvPlugin = RawEnvPlugin;
