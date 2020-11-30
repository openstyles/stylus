'use strict';

define(require => {
  const t = require('/js/localization');
  const {
    $,
    $create,
    animateElement,
    focusAccessibility,
    moveFocus,
  } = require('/js/dom');

  // TODO: convert this singleton mess so we can show many boxes at once

  /** @type {MessageBox} */
  const mess = /** @namespace MessageBox */ {

    blockScroll: null,
    element: null,
    listeners: null,
    originalFocus: null,
    resolve: null,

    /**
     * @param {String|Node|Array<String|Node>} contents
     * @param {String} [className] like 'pre' for monospace font
     * @param {String} [title]
     * @returns {Promise<Boolean>} same as show
     */
    alert(contents, className, title) {
      return mess.show({
        title,
        contents,
        className: `center ${className || ''}`,
        buttons: [t('confirmClose')],
      });
    },

    /**
     * @param {String|Node|Array<String|Node>} contents
     * @param {String} [className] like 'pre' for monospace font
     * @param {String} [title]
     * @returns {Promise<Boolean>} resolves to true when confirmed
     */
    async confirm(contents, className, title) {
      const res = await mess.show({
        title,
        contents,
        className: `center ${className || ''}`,
        buttons: [t('confirmYes'), t('confirmNo')],
      });
      return res.button === 0 || res.enter;
    },

    /**
     * @exports MessageBox
     * @param {Object} params
     * @param {String} params.title
     * @param {String|Node|Object|Array<String|Node|Object>} params.contents
     *        a string gets parsed via t.HTML,
     *        a non-string is passed as is to $create()
     * @param {String} [params.className]
     *        CSS class name of the message box element
     * @param {Array<String|{textContent: String, onclick: Function, ...etc}>} [params.buttons]
     *        ...etc means anything $create() can handle
     * @param {Function(messageboxElement)} [params.onshow]
     *        invoked after the messagebox is shown
     * @param {Boolean} [params.blockScroll]
     *        blocks the page scroll
     * @returns {Promise}
     *        resolves to an object with optionally present properties depending on the interaction:
     *        {button: Number, enter: Boolean, esc: Boolean}
     */
    async show({
      title,
      contents,
      className = '',
      buttons = [],
      onshow,
      blockScroll,
    }) {
      await require(['./message-box.css']);
      if (!mess.listeners) initOwnListeners();
      bindGlobalListeners(blockScroll);
      createElement({title, contents, className, buttons});
      document.body.appendChild(mess.element);

      mess.originalFocus = document.activeElement;
      // skip external links like feedback
      while ((moveFocus(mess.element, 1) || {}).target === '_blank') {/*NOP*/}
      // suppress focus outline when invoked via click
      if (focusAccessibility.lastFocusedViaClick && document.activeElement) {
        document.activeElement.dataset.focusedViaClick = '';
      }

      if (typeof onshow === 'function') {
        onshow(mess.element);
      }

      if (!$('#message-box-title').textContent) {
        $('#message-box-title').hidden = true;
        $('#message-box-close-icon').hidden = true;
      }

      return new Promise(resolve => {
        mess.resolve = resolve;
      });
    },
  };

  function bindGlobalListeners(blockScroll) {
    mess.blockScroll = blockScroll && {x: scrollX, y: scrollY};
    if (blockScroll) {
      window.on('scroll', mess.listeners.scroll, {passive: false});
    }
    window.on('keydown', mess.listeners.key, true);
  }

  function createElement({title, contents, className, buttons}) {
    if (mess.element) {
      unbindGlobalListeners();
      removeSelf();
    }
    const id = 'message-box';
    mess.element =
      $create({id, className}, [
        $create([
          $create(`#${id}-title`, title),
          $create(`#${id}-close-icon`, {onclick: mess.listeners.closeIcon},
            $create('SVG:svg.svg-icon', {viewBox: '0 0 20 20'},
              $create('SVG:path', {d: 'M11.69,10l4.55,4.55-1.69,1.69L10,11.69,' +
                '5.45,16.23,3.77,14.55,8.31,10,3.77,5.45,5.45,3.77,10,8.31l4.55-4.55,1.69,1.69Z',
              }))),
          $create(`#${id}-contents`, t.HTML(contents)),
          $create(`#${id}-buttons`,
            buttons.map((content, buttonIndex) => content &&
              $create('button', Object.assign({
                buttonIndex,
                onclick: mess.listeners.button,
              }, typeof content === 'object' ? content : {
                textContent: content,
              })))),
        ]),
      ]);
  }

  function initOwnListeners() {
    mess.listeners = {
      closeIcon() {
        resolveWith({button: -1});
      },
      button() {
        resolveWith({button: this.buttonIndex});
      },
      key(event) {
        const {key, shiftKey, ctrlKey, altKey, metaKey, target} = event;
        if (shiftKey && key !== 'Tab' || ctrlKey || altKey || metaKey) {
          return;
        }
        switch (key) {
          case 'Enter':
            if (focusAccessibility.closest(target)) {
              return;
            }
            break;
          case 'Escape':
            event.preventDefault();
            event.stopPropagation();
            break;
          case 'Tab':
            moveFocus(mess.element, shiftKey ? -1 : 1);
            event.preventDefault();
            return;
          default:
            return;
        }
        resolveWith(key === 'Enter' ? {enter: true} : {esc: true});
      },
      scroll() {
        scrollTo(mess.blockScroll.x, mess.blockScroll.y);
      },
    };
  }

  function removeSelf() {
    mess.element.remove();
    mess.element = null;
    mess.resolve = null;
  }

  function resolveWith(value) {
    setTimeout(mess.resolve, 0, value);
    unbindGlobalListeners();
    animateElement(mess.element, 'fadeout')
      .then(removeSelf);
    if (mess.element.contains(document.activeElement)) {
      mess.originalFocus.focus();
    }
  }

  function unbindGlobalListeners() {
    window.off('keydown', mess.listeners.key, true);
    window.off('scroll', mess.listeners.scroll);
  }

  return mess;
});
