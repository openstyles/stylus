import {CodeMirror} from '.';
import 'codemirror/mode/javascript/javascript';
import {parseJSON} from 'usercss-meta/lib/parse-util';

CodeMirror.registerHelper('lint', 'json', text => {
  let res, line, ch, i;
  try {
    parseJSON({text, lastIndex: 0});
  } catch (e) {
    ch = 0;
    line = i = -1;
    do line++; while ((i = text.indexOf('\n', ch = i + 1)) >= 0 && i < e.index);
    ch = e.index - ch;
    res = [{
      from: {line, ch},
      to: {line, ch: ch + 1},
      message: e.message.replace('Invalid JSON: ', ''),
    }];
  }
  return res || [];
});
