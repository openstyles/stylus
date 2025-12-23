import {kBadFavs, kPopup, UCD} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {FIREFOX} from '@/js/ua';
import {isDark, setSystemDark} from './color-scheme';
import {bgBusy, dataHub, isVivaldi, WRB, WRBTest} from './common';
import {stateDB} from './db';
import {ownPagesCommitted} from './navigation-manager';
import makePopupData from './popup-data';
import {nondefaults} from './prefs-api';
import * as styleMan from './style-manager';
import * as syncMan from './sync-manager';
import * as usercssTemplate from './usercss-template';

const kEditorScrollInfo = 'editorScrollInfo';
/** @type {ResponseInit} */
const RESPONSE_INIT = {
  headers: {'cache-control': 'no-cache'},
};
const PROVIDERS = {
  edit(url) {
    const id = +url.searchParams.get('id');
    const style = styleMan.get(id);
    const isUC = style ? UCD in style : prefs.__values.newStyleAsUsercss;
    const siKey = kEditorScrollInfo + id;
    return /** @namespace StylusClientData */ {
      style,
      isUC,
      si: style && (__.MV3 ? stateDB.get(siKey) : dataHub.get(siKey)),
      template: !style && isUC && (usercssTemplate.value || usercssTemplate.load()),
    };
  },
  manage(url) {
    const sp = url.searchParams;
    const query = sp.get('search') || undefined/*to enable client's parameter default value*/;
    return /** @namespace StylusClientData */ {
      ids: query
        && styleMan.searchDb({
          query,
          mode: sp.get('searchMode') || prefs.__values['manage.searchMode'],
        }),
      styles: styleMan.getCore({sections: true, size: true}),
      sync: syncMan.getStatus(true),
    };
  },
  options: () => {
    const status = syncMan.getStatus();
    const {drive} = status;
    return /** @namespace StylusClientData */ {
      sync: status,
      syncOpts: drive ? syncMan.getDriveOptions(drive) : {},
      wrb: WRBTest || WRB,
    };
  },
  popup: () => ({
    [kPopup]: dataHub.pop(kPopup) || makePopupData(),
  }),
};

/** @namespace API */
Object.assign(API, {
  saveScroll(id, info) {
    if (__.MV3) stateDB.put(info, kEditorScrollInfo + id);
    else dataHub.set(kEditorScrollInfo + id, info);
  },
});

export default async function setClientData({
  dark: pageDark,
  url: pageUrl,
  frameId,
} = {}) {
  setSystemDark(pageDark);
  if (bgBusy) await bgBusy;
  const url = new URL(pageUrl);
  const page = url.pathname.slice(1/*"/"*/, -5/*".html"*/);
  const pagesForUrl = ownPagesCommitted[pageUrl];
  const tabId = pagesForUrl?.shift();
  const sender = {frameId, tab: {id: tabId, url: pageUrl}};
  const jobs = /** @namespace StylusClientData */ Object.assign({
    apply: styleMan.getSectionsByUrl.call({sender}, pageUrl, {init: true}),
    dark: isDark,
    favicon: FIREFOX || isVivaldi,
    prefs: nondefaults,
    [kBadFavs]: (page === 'edit' || page === 'install-usercss' || page === 'manage')
      && prefs.__values['manage.newUI.favicons']
      && prefs.getDbArray(kBadFavs),
  }, PROVIDERS[page]?.(url));
  const results = await Promise.all(Object.values(jobs));
  if (pagesForUrl && !pagesForUrl.length)
    delete ownPagesCommitted[url];
  Object.keys(jobs).forEach((id, i) => (jobs[id] = results[i]));
  return __.MV3
    ? new Response(`Object.assign(${__.CLIENT_DATA},${JSON.stringify(jobs)})`, RESPONSE_INIT)
    : jobs;
}
