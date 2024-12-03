export default function (text) {
  return text.replace('var jsonlint = (function(){', '')
    .split('return parser;', 1)[0] + 'self.jsonlint = parser;';
}
