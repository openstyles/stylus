if (!Object.entries) {
  Object.entries = obj => Object.keys(obj).map(k => [k, obj[k]]);
}
if (!Object.values) {
  Object.values = obj => Object.keys(obj).map(k => obj[k]);
}
