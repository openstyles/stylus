export function basename(path) {
  return path.match(/([^/\\]+)[/\\]?$|$/)[1] || path;
}

export function dirname(path) {
  const dir = path.replace(/[/\\][^/\\]+[/\\]?$/, '');
  return dir === path ? '.' : dir;
}
