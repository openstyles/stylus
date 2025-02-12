import {kPopup, UCD} from '@/js/consts';
import {API} from '@/js/msg-api';
import * as prefs from '@/js/prefs';
import {FIREFOX} from '@/js/ua';
import {isDark, setSystemDark} from './color-scheme';
import {bgBusy, dataHub, isVivaldi} from './common';
import {prefsDB, stateDB} from './db';
import makePopupData from './popup-data';
import {nondefaults} from './prefs-api';
import * as styleMan from './style-manager';
import {webRequestBlocking} from './style-via-webrequest';
import * as syncMan from './sync-manager';
import * as usercssTemplate from './usercss-template';

const kEditorScrollInfo = 'editorScrollInfo';
/** @type {ResponseInit} */
const RESPONSE_INIT = {
  headers: {'cache-control': 'no-cache'},
};
const ASSIGN_FUNC_STR = __.MV3 && `${function (data) {
  Object.assign(this[__.CLIENT_DATA], data);
}}`;
const PROVIDERS = {
  edit(url) {
    const id = +url.searchParams.get('id');
    const style = styleMan.get(id);
    const isUC = style ? UCD in style : prefs.__values.newStyleAsUsercss;
    const siKey = kEditorScrollInfo + id;
    return /** @namespace StylusClientData */ {
      style,
      isUC,
      si: style && (__.MV3 ? stateDB.get(siKey) : dataHub[siKey]),
      template: !style && isUC && (usercssTemplate.value || usercssTemplate.load()),
    };
  },
  manage(url) {
    const sp = url.searchParams;
    const query = sp.get('search') || undefined/*to enable client's parameter default value*/;
    return /** @namespace StylusClientData */ {
      badFavs: prefs.__values['manage.newUI']
        && prefs.__values['manage.newUI.favicons']
        && prefsDB.get('badFavs'),
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
      wrb: webRequestBlocking,
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
    else dataHub[kEditorScrollInfo + id] = info;
  },
});

export default async function setClientData({
  dark: pageDark,
  url: pageUrl,
} = {}) {
  setSystemDark(pageDark);
  if (bgBusy) await bgBusy;
  const url = new URL(pageUrl);
  const page = url.pathname.slice(1/*"/"*/, -5/*".html"*/);
  const jobs = /** @namespace StylusClientData */ Object.assign({
    apply: styleMan.getSectionsByUrl(pageUrl, {init: true}),
    dark: isDark,
    favicon: FIREFOX || isVivaldi,
    prefs: nondefaults,
  }, PROVIDERS[page]?.(url));
  const results = await Promise.all(Object.values(jobs));
  Object.keys(jobs).forEach((id, i) => (jobs[id] = results[i]));
  return __.MV3
    ? new Response(`(${ASSIGN_FUNC_STR})(${JSON.stringify(jobs)})`, RESPONSE_INIT)
    : jobs;
}
