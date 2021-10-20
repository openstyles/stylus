/* global $ $$ $remove animateElement getEventKeyName moveFocus */// dom.js
/* global API */// msg.js
/* global getActiveTab */// toolbox.js
/* global resortEntries tabURL */// popup.js
/* global t */// localization.js
'use strict';

const MODAL_SHOWN = 'data-display'; // attribute name

const Events = {

  async configure(event) {
    const {styleId, styleIsUsercss} = getClickedStyleElement(event);
    if (styleIsUsercss) {
      const [style] = await Promise.all([
        API.styles.get(styleId),
        require(['/popup/hotkeys']), /* global hotkeys */
        require(['/js/dlg/config-dialog']), /* global configDialog */
      ]);
      hotkeys.setState(false);
      await configDialog(style);
      hotkeys.setState(true);
    } else {
      Events.openURLandHide.call(this, event);
    }
  },

  copyContent(event) {
    event.preventDefault();
    const target = document.activeElement;
    const message = $('.copy-message');
    navigator.clipboard.writeText(target.textContent);
    target.classList.add('copied');
    message.classList.add('show-message');
    setTimeout(() => {
      target.classList.remove('copied');
      message.classList.remove('show-message');
    }, 1000);
  },

  delete(event) {
    const entry = getClickedStyleElement(event);
    const box = $('#confirm');
    box.dataset.id = entry.styleId;
    $('b', box).textContent = $('.style-name', entry).textContent;
    Events.showModal(box, '[data-cmd=cancel]');
  },

  getExcludeRule(type) {
    const u = new URL(tabURL);
    return type === 'domain'
      ? u.origin + '/*'
      : escapeGlob(u.origin + u.pathname); // current page
  },

  async hideModal(box, {animate} = {}) {
    window.off('keydown', box._onkeydown);
    box._onkeydown = null;
    if (animate) {
      box.style.animationName = '';
      await animateElement(box, 'lights-on');
    }
    box.removeAttribute(MODAL_SHOWN);
  },

  indicator(event) {
    const entry = getClickedStyleElement(event);
    const info = t.template.regexpProblemExplanation.cloneNode(true);
    $remove('#' + info.id);
    $$('a', info).forEach(el => (el.onclick = Events.openURLandHide));
    $$('button', info).forEach(el => (el.onclick = closeExplanation));
    entry.appendChild(info);
  },

  isStyleExcluded({exclusions}, type) {
    if (!exclusions) {
      return false;
    }
    const rule = Events.getExcludeRule(type);
    return exclusions.includes(rule);
  },

  maybeEdit(event) {
    if (!(
      event.button === 0 && (event.ctrlKey || event.metaKey) ||
      event.button === 1 ||
      event.button === 2)) {
      return;
    }
    // open an editor on middleclick
    const el = event.target;
    if (el.matches('.entry, .style-edit-link') || el.closest('.style-name')) {
      this.onmouseup = () => $('.style-edit-link', this).click();
      this.oncontextmenu = event => event.preventDefault();
      event.preventDefault();
      return;
    }
  },

  name(event) {
    $('input', this).dispatchEvent(new MouseEvent('click'));
    event.preventDefault();
  },

  async openEditor(event, options) {
    event.preventDefault();
    await API.openEditor(options);
    window.close();
  },

  async openManager(event) {
    event.preventDefault();
    const isSearch = tabURL && (event.shiftKey || event.button === 2);
    await API.openManage(isSearch ? {search: tabURL, searchMode: 'url'} : {});
    window.close();
  },

  async openURLandHide(event) {
    event.preventDefault();
    await API.openURL({
      url: this.href || this.dataset.href,
      index: (await getActiveTab()).index + 1,
      message: this._sendMessage,
    });
    window.close();
  },

  showModal(box, cancelButtonSelector) {
    const oldBox = $(`[${MODAL_SHOWN}]`);
    if (oldBox) box.style.animationName = 'none';
    // '' would be fine but 'true' is backward-compatible with the existing userstyles
    box.setAttribute(MODAL_SHOWN, 'true');
    box._onkeydown = e => {
      const key = getEventKeyName(e);
      switch (key) {
        case 'Tab':
        case 'Shift-Tab':
          e.preventDefault();
          moveFocus(box, e.shiftKey ? -1 : 1);
          break;
        case 'Escape': {
          e.preventDefault();
          window.onkeydown = null;
          $(cancelButtonSelector, box).click();
          break;
        }
      }
    };
    window.on('keydown', box._onkeydown);
    moveFocus(box, 0);
    if (oldBox) Events.hideModal(oldBox);
  },

  async toggleState(event) {
    // when fired on checkbox, prevent the parent label from seeing the event, see #501
    event.stopPropagation();
    await API.styles.toggle((getClickedStyleElement(event) || {}).styleId, this.checked);
    resortEntries();
  },

  toggleExclude(event, type) {
    const entry = getClickedStyleElement(event);
    if (event.target.checked) {
      API.styles.addExclusion(entry.styleMeta.id, Events.getExcludeRule(type));
    } else {
      API.styles.removeExclusion(entry.styleMeta.id, Events.getExcludeRule(type));
    }
  },

  toggleMenu(event) {
    const entry = getClickedStyleElement(event);
    const menu = $('.menu', entry);
    if (menu.hasAttribute(MODAL_SHOWN)) {
      Events.hideModal(menu, {animate: true});
    } else {
      $('.menu-title', entry).textContent = $('.style-name', entry).textContent;
      Events.showModal(menu, '.menu-close');
    }
  },
};

function closeExplanation() {
  $('#regexp-explanation').remove();
}

function escapeGlob(text) {
  return text.replace(/\*/g, '\\*');
}

function getClickedStyleElement(event) {
  return event.target.closest('.entry');
}
