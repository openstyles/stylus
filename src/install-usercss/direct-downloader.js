import {API} from '@/js/msg-api';
import {fetchText} from '@/js/util';
import {CHROME} from '@/js/ua';

export default function DirectDownloader(url) {
  const opts = {
    // Disabling cache on http://localhost otherwise the recheck delay gets too big
    headers: {'Cache-Control': 'no-cache, no-store'},
  };
  let oldCode = null;
  return async () => {
    const code = CHROME < 99 // old Chrome can't fetch file://
      ? await API.download(url, opts)
      : await fetchText(url, opts);
    if (oldCode !== code) {
      oldCode = code;
      return code;
    }
  };
}
