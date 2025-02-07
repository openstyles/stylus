'use strict';

/**
 * Making exports directly invocable by patching webpack's output:
 * 1. remove (0,export)() in invocations as we don't rely on `this` in general,
 *    except cases where we expect it to be set explicitly e.g. `sender` for messages.
 * 2. set the exported functions directly on the exports object as values because
 *    a function declaration is hoisted and initialized before execution starts in the scope,
 * 3. set the exported consts directly on the exports object as values at the end of the module.
 *
 * Aside from a negligible performance improvement, it restores sane debugging process when
 * stepping line by line via F11 key to step inside the function. Previously, it would make 3+
 * nonsensical jumps which becomes excrutiating when doing it on a line with several exports e.g.
 * mod.foo(mod.const1, mod.const2, mod.const3, mod.const4) with webpack's default implementation
 * would force you to step 15 times (or more if those consts are reexported) instead of 1.
 */

const webpack = require('webpack');
const RG = webpack.RuntimeGlobals;
const ReplaceSource = require('webpack-sources/lib/ReplaceSource');
const ConcatenatedModule =
  require('webpack/lib/optimize/ConcatenatedModule');
const HarmonyExportInitFragment =
  require('webpack/lib/dependencies/HarmonyExportInitFragment');
const HarmonyExportSpecifierDependency =
  require('webpack/lib/dependencies/HarmonyExportSpecifierDependency');
const HarmonyImportSpecifierDependency =
  require('webpack/lib/dependencies/HarmonyImportSpecifierDependency');
const MakeNamespaceObjectRuntimeModule =
  require('webpack/lib/runtime/MakeNamespaceObjectRuntimeModule');

/** Patching __.ABCD */
const rxVar = /\b__\.([$_A-Z][$_A-Z\d]*)\b/g;
/** Patching (0,module.export) */
const rxCall = /^\(0,([$\w]+\.[$\w]+)\)$/;
const rxUnmangled = /\b[$a-z]\w{2,}\b/gi;
const MANGLE = ['document', 'global', 'window', 'moduleId', 'cachedModule'];
const STAGE = (/**@type {typeof import('webpack/types').Compilation}*/webpack.Compilation)
  .PROCESS_ASSETS_STAGE_OPTIMIZE_COMPATIBILITY;
const NAME = __filename.slice(__dirname.length + 1).replace(/\.\w+$/, '');
const SYM = Symbol(NAME);
const CONST = 'const';
const FUNC = 'func';
const MAKE_NS = `\
${RG.makeNamespaceObject} = ${exports =>
  Object.defineProperties(exports, {
    [Symbol.toStringTag]: {value: 'Module'},
    __esModule: {value: true},
  })
}`.replace(/[\r\n]\s*/g, '');

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
      const [reserved] = compilation.options.optimization.minimizer
        .map(m => m.options.minimizer.options.mangle?.reserved)
        .filter(Boolean);
      compilation.hooks.processAssets.tap({name: NAME, stage: STAGE}, assets => {
        for (const assetName in assets) {
          if (!assetName.endsWith('.js')
          || compilation.assetsInfo.get(assetName).sourceFilename?.includes('node_modules')) {
            continue;
          }
          const assetSource = assets[assetName];
          const str = assetSource.source();
          if (reserved) {
            `${str}`.replace(/^\/\*+\/.*/, '') // skip lines with webpack machinery
              .match(rxUnmangled)
              .forEach(reserved.add, reserved);
            MANGLE.forEach(reserved.delete, reserved);
          }
          let replacer;
          for (let m, val; (m = rxVar.exec(str));) {
            if ((val = map[m[1]]) != null) {
              replacer ??= new ReplaceSource(assetSource);
              replacer.replace(m.index, m.index + m[0].length - 1, val);
            }
          }
          if (replacer) compilation.updateAsset(assetName, replacer);
        }
      });
      for (const type of ['auto', 'esm']) {
        params.normalModuleFactory.hooks.parser.for('javascript/' + type)
          .tap(NAME, findStaticExports);
      }
    });
  }
}

/** @param {import('webpack/types').JavascriptParser} parser */
function findStaticExports(parser) {
  /** @type {WeakMap<object, Map<string,string>>} */
  const topConsts = new WeakMap();
  parser.hooks.program.tap(NAME, /**@param {Program} ast*/ast => {
    let tc;
    for (let top of ast.body) {
      if (top.type === 'ExportNamedDeclaration' || top.type === 'ExportDefaultDeclaration')
        top = top.declaration;
      if (!top || top.kind !== CONST && top.type !== 'FunctionDeclaration')
        continue;
      for (const td of top.declarations || [top]) {
        if (!(tc ??= topConsts.get(parser.scope)))
          topConsts.set(parser.scope, tc = new Set());
        tc.add(td.id.name);
      }
    }
  });
  parser.hooks.exportSpecifier.intercept({
    name: [NAME],
    register(tap) {
      if (tap.name === 'HarmonyExportDependencyParserPlugin') {
        const {fn} = tap;
        tap.fn = (...args) => {
          const [exp, name, exportedName] = args;
          const res = fn.call(this, ...args);
          const dep = parser.state.current.dependencies.at(-1);
          if (dep?.name === exportedName) {
            const decl = exp.declaration;
            if (decl?.type === 'FunctionDeclaration') {
              dep[SYM] = FUNC;
            } else if (
              (decl?.kind === CONST || exp.specifiers) &&
              topConsts.get(parser.scope)?.has(name)
            ) {
              dep[SYM] = CONST;
            }
            return res;
          }
        };
      }
      return tap;
    },
  });
}

hookFunc(HarmonyExportSpecifierDependency.Template, 'apply', (fn, me, args) => {
  const [dep, /*source*/, {initFragments: frags, concatenationScope}] = args;
  const old = frags.length;
  const res = Reflect.apply(fn, me, args);
  if (dep[SYM]) {
    if (old < frags.length) {
      const boundVal = '/* binding */ ' + dep.id;
      frags.at(-1).exportMap.forEach((val, key, map) => {
        if (val === boundVal) map.set(key, `/*${dep[SYM]}*/${dep.id}`);
      });
    } else {
      (concatenationScope._currentModule.module[SYM] ??= {})[dep.id] = dep[SYM];
    }
  }
  return res;
});

hookFunc(HarmonyImportSpecifierDependency.Template, '_getCodeForIds', (fn, me, args) => {
  const res = Reflect.apply(fn, me, args);
  return res.replace(rxCall, '$1');
});

hookFunc(HarmonyExportInitFragment, 'getContent', (fn, me, args) => {
  const [a, b] = flattenExports(Reflect.apply(fn, me, args));
  me.endContent = b;
  return a;
});

hookFunc(ConcatenatedModule, 'codeGeneration', (fn, me, args) => {
  const res = Reflect.apply(fn, me, args);
  for (const src of res.sources.values())
    for (let i = 0, child, exp, arr = src._source._children; i < arr.length; i++) {
      child = arr[i];
      if (!exp && child === '\n// EXPORTS\n') {
        exp = {};
        for (const mod of me.modules)
          Object.assign(exp, mod[SYM]);
        exp = flattenExports(arr[i + 1], exp);
        arr.splice(i + 1, 1);
        arr.push(exp[1]);
        arr[i] = exp[0];
        continue;
      }
      for (const r of child._replacements || []) {
        if (rxCall.test(r.content)) {
          r.content = RegExp.$1;
        }
      }
    }
  return res;
});

MakeNamespaceObjectRuntimeModule.prototype.generate = () => MAKE_NS;

function hookFunc(obj, name, hook) {
  if (typeof obj === 'function') obj = obj.prototype;
  obj[name] = new Proxy(obj[name], {apply: hook});
}

function flattenExports(str, ids) {
  let flat1 = '';
  let flat2 = '';
  str = str.replaceAll('/* harmony export */ ', '').replace(
    /\s*"?([$\w]+)"?: \(\) => \((?:\/\*\s*(?:(c)onst|(f)unc|\w+)\s*\*\/\s*)?([$\w]+)\),?\s*/g,
    (match, id, isConst, isFunc, dest) => {
      if (
        (isFunc ??= ids?.[id] === FUNC) ||
        (isConst ??= (ids?.[id] === CONST || dest === '__WEBPACK_DEFAULT_EXPORT__'))
      ) {
        match = `${RG.exports}.${id} = ${dest};\n`;
        if (isFunc) flat1 += match; else flat2 += match;
        match = '';
      }
      return match;
    });
  if (str.replace(/\s+/g, '') !== `${RG.definePropertyGetters}(${RG.exports},{});`)
    flat2 += str;
  return [flat1, flat2];
}

module.exports = {
  RawEnvPlugin,
};
