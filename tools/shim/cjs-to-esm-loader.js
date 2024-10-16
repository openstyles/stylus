export default function (text) {
  return text.replace(/\bmodule\.exports\s*=\s*(({[^{}]+})|\w+)(;?\s*)$/,
    (s, val, multi, tail) => 'export ' + (multi || `default ${val}`) + tail);
}
