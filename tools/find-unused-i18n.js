'use strict';
const acorn = require('acorn');
const acornWalk = require('acorn-walk');
const chalk = require('chalk');
const fs = require('fs');
const {SRC} = require('./util');

if (process.argv[2] === '--del') {
  const keys = process.argv[3].split(',');
  const dir = SRC + '_locales/';
  for (const fname of fs.readdirSync(dir)) {
    try {
      const fpath = dir + fname + '/messages.json';
      const data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
      let num = 0;
      for (const k of keys)
        num += data[k] ? delete data[k] : 0;
      if (num) {
        fs.writeFileSync(fpath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        console.log(`${fname}: removed ${num} keys`);
      }
    } catch {}
  }
  process.exit(0);
}

const all = JSON.parse(fs.readFileSync(SRC + '/_locales/en/messages.json', 'utf8'));
const found = {};
const suspected = {};
const SKIP = new Set([
  'Identifier',
  'MemberExpression',
]);
for (const f of fs.readdirSync(SRC, {recursive: true})) {
  const func =
    /^manifest.*\.json$/.test(f) ? testJSON :
    /\.html$/.test(f) ? testHTML :
    /\.m?js$/.test(f) ? testJS :
    null;
  func?.(f, fs.readFileSync(SRC + f, 'utf8'));
}
const notFound = Object.keys(all).map(k => {
  if (found[k]) return;
  const sus = Object.entries(suspected[k] || {})
    .flatMap(([f, fv]) => Object.entries(fv).map(([line, str]) =>
      `  ? ${chalk.bold(f)}:${line} ${str.trim()}`))
    .join('\n');
  const msg = all[k].message;
  return `${chalk.bold.red(k)}: ${msg.length > 50 ? msg.slice(0, 50) + '...' : msg}` +
    (sus ? '\x00' + chalk.green(sus) : '');
}).filter(Boolean);
console.log(`${notFound.length} keys not found:\n` +
  notFound.sort().join('\x00').replaceAll('\n', '\\n').replaceAll('\x00', '\n'));

function testJSON(f, text) {
  if (!text.includes('__MSG_'))
    return;
  text.split(/\r?\n/).forEach((str, i) => {
    for (const [id] of str.matchAll(/(?<=__MSG_)\w+(?=__)/g) || [])
      ((found[id] ??= {})[f] ??= {})[i + 1] ??= str;
  });
}

function testHTML(f, text) {
  if (!text.includes('i18n='))
    return;
  const rx = /(?:^|[\s"'])i18n\s*=\s*(?:(["'])([^"']+)(\1)?|(\w+))/g;
  let prev = '';
  text.split(/\r?\n/).forEach((str, i) => {
    for (const [m0, q1, i18n, q2, id] of (prev + str).matchAll(rx)) {
      if (q1 && !q2) {
        prev += m0 + '\n';
      } else {
        prev = '';
        for (let p of i18n?.split(',') || [id]) {
          p = p.trim().match(/^(?:\+?|[-\w]+:\s*)?(\w+)$/);
          if (p) ((found[p[1]] ??= {})[f] ??= {})[i + 1] ??= str;
        }
      }
    }
  });
}

function testJS(f, text) {
  let lines;
  acornWalk.simple(acorn.parse(text, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
  }), {
    Literal(node) {
      let v = node.value;
      if (all[v])
        ((suspected[v] ??= {})[f] ??= {})[v = node.loc.start.line] ??=
          (lines ??= text.split(/\r?\n/))[v - 1];
    },
    CallExpression(node) {
      const c = node.callee;
      if (c.name !== 't' && !(
        c.property?.name === 'getMessage' &&
        c.object.property?.name === 'i18n'
      )) return;
      const a0 = node.arguments[0];
      const queue = [a0];
      const tBase = a0.type === 'BinaryExpression' &&
        a0.operator === '+' && a0.left.type === 'Literal' && a0.left.value ||
        '';
      for (let arg, t, v; (arg = queue.shift());) {
        t = arg.type;
        v = t === 'Literal' ? typeof (v = arg.value) === 'string' && v
          : t === 'TemplateLiteral' && arg.quasis[0].value.cooked;
        if (v !== false) {
          const line = node.loc.start.line;
          const exp = t === 'TemplateLiteral' && arg.expressions[0];
          const parts = exp?.type !== 'ConditionalExpression' ? [tBase + v] : [
            typeof (t = exp.consequent.value) === 'string' && (v + t),
            typeof (t = exp.alternate.value) === 'string' && (v + t),
          ].filter(Boolean);
          lines ??= text.split(/\r?\n/);
          for (const part of parts)
            ((found[part] ??= {})[f] ??= {})[line] ??= lines[line - 1];
        } else {
          for (const k in arg) {
            if (k !== 'loc' && k !== 'test'
            && typeof (v = arg[k]) === 'object' && v && !SKIP.has(v.type)) {
              queue.push(v);
            }
          }
        }
      }
    },
  });
}
