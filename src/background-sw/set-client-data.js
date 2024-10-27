import {isDark, setSystemDark} from '/background/color-scheme';
import {isVivaldi} from '/background/common';
import prefsApi from '/background/prefs-api';
import * as styleMan from '/background/style-manager';
import * as syncMan from '/background/sync-manager';
import {API} from '/js/msg-api';
import * as prefs from '/js/prefs';
import {FIREFOX} from '/js/ua';

const NO_CACHE = {
  headers: {'cache-control': 'no-cache'},
};

/**
 * @param {FetchEvent} evt
 * @param {URL} reqUrl
 */
export default async function setClientData(evt, reqUrl) {
  let v;
  const reqParams = reqUrl.searchParams;
  const page = reqUrl.pathname.slice(1/*"/"*/, -5/*".html"*/);
  const pageUrl = reqParams.get('url');
  const pageParams = new URL(pageUrl).searchParams;
  const jobs = {};
  setSystemDark(!!+reqParams.get('dark'));

  Object.assign(jobs, /** @namespace StylusClientData */ {
    apply: styleMan.getSectionsByUrl(pageUrl, null, true),
    dark: isDark,
    favicon: FIREFOX || isVivaldi,
    prefs: prefsApi.get(),

  }, page === 'edit' ?
    styleMan.getEditClientData(+pageParams.get('id'))

  : page === 'manage' ? /** @namespace StylusClientData */ {
    badFavs: prefs.__values['manage.newUI'] && prefs.__values['manage.newUI.favicons']
      && API.prefsDb.get('badFavs'),
    ids: (v = pageParams.get('search') || undefined)
      && styleMan.searchDb({
        query: v,
        mode: pageParams.get('searchMode') || prefs.__values['manage.searchMode'],
      }),
    styles: styleMan.getCodelessStyles(),

  } : page === 'options' ? /** @namespace StylusClientData */ {
    sync: (v = syncMan.getStatus()),
    syncOpts: ((v = v.currentDriveName)) ? syncMan.getDriveOptions(v) : {},

  } : page === 'popup' ? /** @namespace StylusClientData */ {
    popup: API.data.pop('popupData'),

  } : null);

  v = await Promise.all(Object.values(jobs));
  Object.keys(jobs).forEach((id, i) => (jobs[id] = v[i]));
  return new Response(`var clientData = new Proxy(${JSON.stringify(jobs)}, {get: ${(obj, k, _) => ((
    (_ = obj[k]), delete obj[k], _
  ))}})`, NO_CACHE);
}
