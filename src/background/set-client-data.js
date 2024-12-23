import {kPopup} from '@/js/consts';
import {API} from '@/js/msg';
import * as prefs from '@/js/prefs';
import {FIREFOX} from '@/js/ua';
import {isDark, setSystemDark} from './color-scheme';
import {bgBusy, isVivaldi} from './common';
import makePopupData from './popup-data';
import prefsApi from './prefs-api';
import * as styleMan from './style-manager';
import {webRequestBlocking} from './style-via-webrequest';
import * as syncMan from './sync-manager';

/** @type {ResponseInit} */
const RESPONSE_INIT = {
  headers: {'cache-control': 'no-cache'},
};
const ASSIGN_FUNC_STR = __.MV3 && `${function (data) {
  Object.assign(this[__.CLIENT_DATA], data);
}}`;

export default async function setClientData({
  dark: pageDark,
  url: pageUrl,
} = {}) {
  if (bgBusy) await bgBusy;
  let v, params;
  const url = new URL(pageUrl);
  const page = url.pathname.slice(1/*"/"*/, -5/*".html"*/);
  const jobs = {};
  setSystemDark(pageDark);

  Object.assign(jobs, /** @namespace StylusClientData */ {
    apply: styleMan.getSectionsByUrl(pageUrl, null, true),
    dark: isDark,
    favicon: FIREFOX || isVivaldi,
    prefs: prefsApi.get(),

  }, page === 'edit' ?
    styleMan.getEditClientData(+url.searchParams.get('id'))

  : page === 'manage' ? /** @namespace StylusClientData */ {
    badFavs: prefs.__values['manage.newUI'] && prefs.__values['manage.newUI.favicons']
      && API.prefsDb.get('badFavs'),
    ids: (v = (params = url.searchParams).get('search') || undefined)
      && styleMan.searchDb({
        query: v,
        mode: params.get('searchMode') || prefs.__values['manage.searchMode'],
      }),
    styles: __.MV3 ? styleMan.getCodelessStyles() : styleMan.getAll(),
    sync: syncMan.getStatus(),

  } : page === 'options' ? /** @namespace StylusClientData */ {
    sync: (v = syncMan.getStatus()),
    syncOpts: ((v = v.drive)) ? syncMan.getDriveOptions(v) : {},
    wrb: webRequestBlocking,

  } : page === 'popup' ? /** @namespace StylusClientData */ {
    [kPopup]: API.data.pop(kPopup) || makePopupData(),

  } : null);

  v = await Promise.all(Object.values(jobs));
  Object.keys(jobs).forEach((id, i) => (jobs[id] = v[i]));
  return __.MV3
    ? new Response(`(${ASSIGN_FUNC_STR})(${JSON.stringify(jobs)})`, RESPONSE_INIT)
    : jobs;
}
