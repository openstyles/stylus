import {$create} from '@/js/dom';
import {ownRoot} from '@/js/urls';
import {t} from '@/js/util';
import {MF} from '@/js/util-webext';
import '@/css/dom-error.css';

export default showUnhandledError;

/** onerror() is called from prefs.js directly to avoid importing this DOM module in bg */
window.onerror = window.onunhandledrejection = showUnhandledError;
let elError, elEntry;

function showUnhandledError(a, b, c, d, err = a /* window.onerror has 5 params */) {
  err = err.reason || err; // for onunhandledrejection
  if (!elError) {
    elError = $create('#unhandledError', [
      $create('a', {title: t('copy'), tabIndex: 0}, $create('i.i-copy')),
      $create('a', {title: t('confirmClose'), tabIndex: 0}, $create('i.i-close')),
    ]);
    elEntry = $create('details', [
      $create('summary', [
        $tag('span'),
        $create('a', {target: '_blank', rel: 'noopener', tabIndex: 0}, t('reportBug')),
      ]),
      $tag('pre'),
    ]);
    const formatText = target => '```\n' +
      [].map.call((target?.closest('details') || elError).$$('span, pre'),
        (_, i) => _.textContent + (i % 2 ? '\n' : ''))
        .join('\n') + '```\n\n- UA: ' +
      navigator.userAgent.replace(
        /\(KHTML.+?\) |(Mozilla|AppleWebKit|Gecko)\S+ | Safari\/537\.36/g, '') +
      `\n- Stylus: ${MF.version} (MV${__.MV3 ? 3 : 2})\n`;
    const onauxclick = elError.onauxclick = async (evt, target = evt.target) => {
      if (target.href !== '')
        return;
      evt.preventDefault();
      target.disabled = true;
      const title = location.pathname.slice(1, -5/*drop ".html"*/) + ': ' +
        target.parentElement.$('span').innerText;
      let url;
      try {
        url = 'https://api.github.com/search/issues?q=' + encodeURIComponent(title) +
          '+in:title+repo:openstyles/stylus+is:issue&sort=created&order=asc&per_page=1';
        url = (
          await (await fetch(url, {headers: {'Accept': 'application/vnd.github+json'}})).json()
        ).items[0].html_url;
      } catch {
        url = 'https://github.com/openstyles/stylus/issues/new?' + new URLSearchParams({
          title,
          labels: 'bug',
          body: formatText(target),
        });
      }
      target.href = url;
      target.disabled = false;
      if (evt.button < 2) target.click();
    };
    elError.onclick = evt => {
      const {target} = evt;
      if (target.rel)
        return onauxclick(evt, target);
      if (target === elError || target.closest('details'))
        return;
      if (target.$('.i-copy'))
        navigator.clipboard.writeText(formatText());
      elError.remove();
    };
  }
  const msg = (`${err.message || err}`).trim().split(ownRoot).join('');
  let el = [].find.call(elError.$$('summary span'), s => s.innerText === msg);
  if (el) {
    el.dataset.num = (+el.dataset.num || 1) + 1;
  } else {
    el = elEntry.cloneNode(true);
    elError.append(el);
    el.$('pre').innerText = err.stack?.replace(msg, '') || '';
    el = el.$('span');
    el.innerText = msg;
  }
  $root.appendChild(elError);
}
