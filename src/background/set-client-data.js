import {kBadFavs, kEditorScrollInfo, kEditorState, kPopup, pEditorTheme, UCD} from '@/js/consts';
import * as prefs from '@/js/prefs';
import {chromeLocal} from '@/js/storage-util';
import {FIREFOX} from '@/js/ua';
import {fetchText, NOP} from '@/js/util';
import {isDark, setSystemDark} from './color-scheme';
import {bgBusy, dataHub, isVivaldi, vivaldiTest, WRB, WRBTest} from './common';
import {stateDB} from './db';
import {ownPagesCommitted} from './navigation-manager';
import makePopupData from './popup-data';
import {nondefaults} from './prefs-api';
import * as styleMan from './style-manager';
import * as syncMan from './sync-manager';
import {loadTemplate} from './usercss-template';

const CM_THEMES_TEXT = {};
const PROVIDERS = {
  edit(url) {
    const id = +url.searchParams.get('id');
    const style = styleMan.get(id);
    const isUsercss = style ? UCD in style : prefs.__values.newStyleAsUsercss;
    const siKey = kEditorScrollInfo + id;
    let v;
    v = /** @namespace StylusClientData */ {
      style,
      isUsercss,
      si: style && (__.MV3 ? stateDB.get(siKey) : dataHub.get(siKey)),
      state: chromeLocal.getValue(kEditorState),
      template: isUsercss && loadTemplate(),
      theme: v = prefs.__values[pEditorTheme],
      themeText: v !== prefs.__defaults[pEditorTheme] && (
        CM_THEMES_TEXT[v = `${__.CM_PATH}${v}.css`] ??= fetchText(v).catch(NOP)
      ),
    };
    return v;
  },
  manage(url) {
    const sp = url.searchParams;
    const query = sp.get('search') || undefined/*to enable client's parameter default value*/;
    const styles = styleMan.getCore({sections: true, size: true});
    return /** @namespace StylusClientData */ {
      ids: query
        && styleMan.searchDb({
          query,
          mode: sp.get('searchMode') || prefs.__values['manage.searchMode'],
        }),
      // JSON.parse in the receiver is faster than JS parsing of a huge literal object
      styles: __.MV3 ? JSON.stringify(styles) : styles,
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
  const sender = {frameId, tab: tabId >= 0 ? {id: tabId, url: pageUrl} : {}};
  const jobs = Object.assign(/** @namespace StylusClientData */ {
    apply: styleMan.getSectionsByUrl.call({sender}, pageUrl, {init: true}),
    dark: isDark,
    favicon: __.B_FIREFOX || __.B_ANY && FIREFOX || (isVivaldi ?? vivaldiTest()),
    prefs: nondefaults,
    tabId: tabId ?? -1,
    [kBadFavs]: (page === 'edit' || page === 'install-usercss' || page === 'manage')
      && prefs.__values['manage.newUI.favicons']
      && prefs.getDbArray(kBadFavs),
  }, PROVIDERS[page]?.(url));
  const results = await Promise.all(Object.values(jobs));
  if (pagesForUrl && !pagesForUrl.length)
    delete ownPagesCommitted[url];
  Object.keys(jobs).forEach((id, i) => (jobs[id] = results[i]));
  return jobs;
}
