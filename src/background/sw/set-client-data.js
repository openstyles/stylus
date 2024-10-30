import {kPopupData} from '/js/consts';
import {API} from '/js/msg-api';
import * as prefs from '/js/prefs';
import {FIREFOX} from '/js/ua';
import {kResolve} from '/js/util';
import {isDark, setSystemDark} from '../color-scheme';
import {bgReady, isVivaldi} from '../common';
import prefsApi from '../prefs-api';
import * as styleMan from '../style-manager';
import {webRequestBlocking} from '../style-via-webrequest';
import * as syncMan from '../sync-manager';

/** @type {ResponseInit} */
const RESPONSE_INIT = {
  headers: {'cache-control': 'no-cache'},
};
const ASSIGN_FUNC_STR = process.env.MV3 && `${data => Object.assign(window.clientData, data)}`;

export default async function setClientData(reqUrl) {
  if (bgReady[kResolve]) await bgReady;
  let v;
  reqUrl = new URL(reqUrl);
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
    styles: process.env.MV3 ? styleMan.getCodelessStyles() : styleMan.getAll(),

  } : page === 'options' ? /** @namespace StylusClientData */ {
    sync: (v = syncMan.getStatus()),
    syncOpts: ((v = v.currentDriveName)) ? syncMan.getDriveOptions(v) : {},
    wrb: webRequestBlocking,

  } : page === 'popup' ? /** @namespace StylusClientData */ {
    [kPopupData]: API.data.pop(kPopupData),

  } : null);

  v = await Promise.all(Object.values(jobs));
  Object.keys(jobs).forEach((id, i) => (jobs[id] = v[i]));
  return process.env.MV3
    ? new Response(`(${ASSIGN_FUNC_STR})(${JSON.stringify(jobs)})`, RESPONSE_INIT)
    : jobs;
}
