import {kExclusions, kInclusions, kOverridden, kTabOvr} from '@/js/consts';
import {moveFocus} from '@/js/dom-util';
import {template} from '@/js/localization';
import {API} from '@/js/msg-api';
import {FIREFOX} from '@/js/ua';
import {NOP, t} from '@/js/util';
import {tabId, tabUrl} from '.';
import {EntryClick, openEditor} from './events';

export const menu = template.menu;
/** @type {PopupMenuOvr[]} */
let ITEMS;
/** @type {HTMLAnchorElement} */
let btnEdit;
export let btnDel;
/** @type {HTMLInputElement} */
let chkStyle, chkOvr;
/** @type {HTMLElement} */
let elMatched;
let bodyStyle = '';

export function closeMenu() {
  menu.remove();
  document.body.style.cssText = bodyStyle;
  bodyStyle = '';
}

function initMenu() {
  const u = new URL(tabUrl);
  const tplOvr = template.incOvr;
  menu.$('p br').replaceWith(tplOvr);
  menu.onclick = ({target}) => {
    if (target === menu) closeMenu();
  };
  (chkOvr = tplOvr.$('input')).onclick = () => {
    API.styles.config(menu.styleId, kOverridden, chkOvr.checked);
    return false;
  };
  (chkStyle = menu.$('input')).onclick = EntryClick.input;
  (btnEdit = menu.$('[data-cmd="edit"]')).onclick = openEditor;
  btnEdit.title = '<F2>: ' + t('styleSitesPopupEdit');
  menu.$('[data-cmd="cancel"]').onclick = closeMenu;
  (btnDel = menu.$('[data-cmd="delete"]')).onclick = () => {
    if (!menu.classList.toggle('delete')) {
      API.styles.remove(menu.styleId);
      closeMenu();
    }
  };
  elMatched = menu.$('#matchedOvr');
  ITEMS = [];
  for (const el of menu.$$('[data-ovr]')) {
    const [elInc, elExc] = el.$$('input');
    const type = el.dataset.ovr;
    const rule = type === 'tab' ? '' :
      type === 'domain' ? u.origin + '/*' :
        u.origin + u.pathname.replace(/\*/g, '\\*') +
          (type === 'url' ? '' : '*');
    /** @namespace PopupMenuOvr */
    const item = {el, elInc, elExc, rule, handleEvent: onOvrChanged};
    ITEMS.push(item);
    el.on('change', item);
    let i = +el.dataset.index;
    i = `<${i}>` + (i ? '' : ', <`>') + ': ';
    elInc.title = `${i}${t('include')}`;
    elExc.title = `${i.replace(/</g, '<Shift-')}${t('exclude')}`;
  }
}

/** @param {StyleEntryElement<StyleObjMatch>} entry */
export async function openMenu(entry) {
  if (!ITEMS) initMenu();
  if (!bodyStyle) bodyStyle = document.body.style.cssText;
  const menuCL = menu.classList;
  const be = entry.getBoundingClientRect();
  const style = entry.styleMeta;
  const {enabled, id, url} = style;
  const [elTitle, elHome] = menu.$('header').children;
  const inc = style[kInclusions] || [];
  const exc = style[kExclusions] || [];
  const ovr = style[kTabOvr];
  elMatched.textContent = style.matchedOvrs || await API.styles.matchOverrides(id, tabUrl);
  let prevRule;
  for (const {el, elInc, elExc, rule} of ITEMS) {
    el.title = rule;
    el.hidden = rule === prevRule;
    el.classList.toggle('enabled', elInc.checked = rule ? inc.includes(rule) : !!ovr);
    el.classList.toggle('disabled', elExc.checked = rule ? exc.includes(rule) : ovr === false);
    prevRule = rule;
  }
  menu.styleId = id;
  menuCL.remove('delete');
  menuCL.toggle('enabled', enabled);
  chkOvr.checked = style[kOverridden];
  chkStyle.styleId = id;
  chkStyle.checked = enabled;
  btnEdit.search = '?id=' + id;
  elTitle.children[1].textContent = style.customName || style.name;
  elHome.hidden = !url;
  if (url) {
    Object.assign(elHome, {
      href: url,
      // Firefox already shows the target of links in a popup
      title: t('externalHomepage') + (FIREFOX ? '' : '\n' + url),
    });
  }
  menuCL.add('measure');
  document.body.append(menu);
  const menuH = menu.firstElementChild.offsetHeight + 1;
  const popupH = $root.clientHeight;
  if (menuH > popupH) document.body.style.minHeight = menuH + 'px';
  else menu.style.paddingTop = Math.min(be.bottom, popupH - menuH - 8) + 'px';
  menuCL.remove('measure');
  moveFocus(menu, 0);
}

/** @this {PopupMenuOvr} */
function onOvrChanged(evt) {
  const id = menu.styleId;
  const rule = this.rule;
  const ctl = evt.target;
  const isInc = ctl === this.elInc;
  const val = ctl.checked;
  (rule
    ? API.styles.toggleSiteOvr(id, rule, isInc, val)
    : API.styles.toggleTabOvrMany(tabId, {[id]: val ? isInc : null})
  ).catch(NOP);
}
