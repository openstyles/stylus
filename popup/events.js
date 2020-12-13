'use strict';

define(require => {
  const {API} = require('/js/msg');
  const {getActiveTab, tryJSONparse} = require('/js/toolbox');
  const t = require('/js/localization');
  const {
    $,
    $$,
    $remove,
    animateElement,
    getEventKeyName,
    moveFocus,
  } = require('/js/dom');

  const MODAL_SHOWN = 'data-display'; // attribute name

  const Events = {

    tabURL: '',

    async configure(event) {
      const {styleId, styleIsUsercss} = getClickedStyleElement(event);
      if (styleIsUsercss) {
        const style = await API.styles.get(styleId);
        const hotkeys = await require(['./hotkeys']);
        hotkeys.setState(false);
        const configDialog = await require(['/js/dlg/config-dialog']);
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
      const u = new URL(Events.tabURL);
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
      // prevent the popup being opened in a background tab
      // when an irrelevant link was accidentally clicked
      if (el.closest('a')) {
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
      const isSearch = Events.tabURL && (event.shiftKey || event.button === 2);
      await API.openManage(isSearch ? {search: Events.tabURL, searchMode: 'url'} : {});
      window.close();
    },

    async openURLandHide(event) {
      event.preventDefault();
      await API.openURL({
        url: this.href || this.dataset.href,
        index: (await getActiveTab()).index + 1,
        message: tryJSONparse(this.dataset.sendMessage),
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
      Events.hideModal(oldBox);
    },

    async toggleState(event) {
      // when fired on checkbox, prevent the parent label from seeing the event, see #501
      event.stopPropagation();
      await API.styles.toggle(getClickedStyleId(event), this.checked);
      require(['./popup'], res => res.resortEntries());
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

  function getClickedStyleId(event) {
    return (getClickedStyleElement(event) || {}).styleId;
  }

  return Events;
});
