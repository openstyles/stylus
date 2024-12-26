export function getStyleAtPos(styles, ch, pickOne) {
  if (!styles) return;
  const len = styles.length;
  const end = styles[len - 2];
  if (ch > end) return;
  if (ch === end) {
    return pickOne === 0 ? styles[len - 1]
      : pickOne === 1 ? len - 2
        : [styles[len - 1], len - 2];
  }
  const mid = (ch / end * (len - 1) & ~1) + 1;
  let a = mid;
  let b;
  while (a > 1 && styles[a] > ch) {
    b = a;
    a = (a / 2 & ~1) + 1;
  }
  if (!b) b = mid;
  while (b < len && styles[b] < ch) b = ((len + b) / 2 & ~1) + 1;
  while (a < b - 3) {
    const c = ((a + b) / 2 & ~1) + 1;
    if (styles[c] > ch) b = c; else a = c;
  }
  while (a < len && styles[a] < ch) a += 2;
  return pickOne === 0 ? styles[a + 1]
    : pickOne === 1 ? a
      : [styles[a + 1], a];
}
