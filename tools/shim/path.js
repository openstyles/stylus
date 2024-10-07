export function dirname(path) {
  const dir = path.replace(/[/\\][^/\\]+[/\\]?$/, '');
  return dir === path ? '.' : dir;
}
