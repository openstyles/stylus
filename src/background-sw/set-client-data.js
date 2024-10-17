import {isDark} from '/background/color-scheme';
import {bgReady, isVivaldi} from '/background/common';
import prefsApi from '/background/prefs-api';
import {searchDb} from '/background/style-manager';
import * as styleMan from '/background/style-manager';
import * as syncMan from '/background/sync-manager';
import {API} from '/js/msg-base';
import * as prefs from '/js/prefs';
import {FIREFOX} from '/js/ua';

export default async function setClientData(page, clientId) {
  let v;
  const [{url}] = /** @type {Client[]} */ await Promise.all([
    self.clients.get(clientId),
    !global.msg && bgReady.styles,
  ]);
  const sp = new URL(url).searchParams;
  const jobs = Object.assign(/** @namespace StylusClientData */ {

    apply: styleMan.getSectionsByUrl(url, null, true),
    dark: isDark(),
    favicon: FIREFOX || isVivaldi,
    prefs: prefsApi.get(),

  }, page === 'edit' ?

    styleMan.getEditClientData(+url.match(/[?&]id=(\d+)/)?.[1])

  : page === 'manage' ? /** @namespace StylusClientData */ {

    badFavs: prefs.__values['manage.newUI'] && prefs.__values['manage.newUI.favicons']
      && API.prefsDb.get('badFavs'),
    ids: (v = sp.get('search') || undefined)
      && searchDb({
        query: v,
        mode: sp.get('searchMode') || prefs.__values['manage.searchMode'],
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
  return new Response(`var clientData = ${JSON.stringify(jobs)}`);
}
