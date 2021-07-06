/* global $ $create animateElement focusAccessibility moveFocus */// dom.js
/* global t */// localization.js
'use strict';

// TODO: convert this singleton mess so we can show many boxes at once
/* global messageBox */
window.messageBox = {
  element: null,
  listeners: null,
  _blockScroll: null,
  _originalFocus: null,
  _resolve: null,
};

/**
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
messageBox.show = async ({
  title,
  contents,
  className = '',
  buttons = [],
  onshow,
  blockScroll,
}) => {
  await require(['/js/dlg/message-box.css']);
  if (!messageBox.listeners) initOwnListeners();
  bindGlobalListeners();
  createElement();
  document.body.appendChild(messageBox.element);
  bindElementLiseners();

  messageBox._originalFocus = document.activeElement;
  // focus the first focusable child but skip the first external link which is usually `feedback`
  if ((moveFocus(messageBox.element, 0) || {}).target === '_blank') {
    moveFocus(messageBox.element, 1);
  }
  // suppress focus outline when invoked via click
  if (focusAccessibility.lastFocusedViaClick && document.activeElement) {
    document.activeElement.dataset.focusedViaClick = '';
  }

  if (typeof onshow === 'function') {
    onshow(messageBox.element);
  }

  if (!$('#message-box-title').textContent) {
    $('#message-box-title').hidden = true;
    $('#message-box-close-icon').hidden = true;
  }

  return new Promise(resolve => {
    messageBox._resolve = resolve;
  });

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function initOwnListeners() {
    let listening = false;
    let offsetX = 0;
    let offsetY = 0;
    let clickX, clickY;
    messageBox.listeners = {
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
            moveFocus(messageBox.element, shiftKey ? -1 : 1);
            event.preventDefault();
            return;
          default:
            return;
        }
        resolveWith(key === 'Enter' ? {enter: true} : {esc: true});
      },
      scroll() {
        scrollTo(messageBox._blockScroll.x, messageBox._blockScroll.y);
      },
      mouseDown(event) {
        if (event.button !== 0) {
          return;
        }
        if (!listening) {
          window.on('mouseup', messageBox.listeners.mouseUp, {passive: true});
          window.on('mousemove', messageBox.listeners.mouseMove, {passive: true});
          listening = true;
        }
        clickX = event.clientX - offsetX;
        clickY = event.clientY - offsetY;
      },
      mouseUp(event) {
        if (event.button !== 0) {
          return;
        }
        window.off('mouseup', messageBox.listeners.mouseUp);
        window.off('mousemove', messageBox.listeners.mouseMove);
        listening = false;
      },
      mouseMove(event) {
        const x = clamp(event.clientX, 30, innerWidth - 30) - clickX;
        const y = clamp(event.clientY, 30, innerHeight - 30) - clickY;

        offsetX = x;
        offsetY = y;

        $('#message-box > div').style.transform =
          `translateX(${x}px) 
          translateY(${y}px)`;
      },
    };
  }

  function resolveWith(value) {
    setTimeout(messageBox._resolve, 0, value);
    unbindGlobalListeners();
    animateElement(messageBox.element, 'fadeout')
      .then(removeSelf);
    if (messageBox.element.contains(document.activeElement)) {
      messageBox._originalFocus.focus();
    }
  }

  function createElement() {
    if (messageBox.element) {
      unbindGlobalListeners();
      removeSelf();
    }
    const id = 'message-box';
    messageBox.element =
      $create({id, className}, [
        $create([
          $create(`#${id}-title`, title),
          $create(`#${id}-close-icon`, {onclick: messageBox.listeners.closeIcon},
            $create('SVG:svg.svg-icon', {viewBox: '0 0 20 20'},
              $create('SVG:path', {d: 'M11.69,10l4.55,4.55-1.69,1.69L10,11.69,' +
                '5.45,16.23,3.77,14.55,8.31,10,3.77,5.45,5.45,3.77,10,8.31l4.55-4.55,1.69,1.69Z',
              }))),
          $create(`#${id}-contents`, t.HTML(contents)),
          $create(`#${id}-buttons`,
            buttons.map((content, buttonIndex) => content &&
              $create('button', Object.assign({
                buttonIndex,
                onclick: messageBox.listeners.button,
              }, typeof content === 'object' ? content : {
                textContent: content,
              })))),
        ]),
      ]);
  }

  function bindGlobalListeners() {
    messageBox._blockScroll = blockScroll && {x: scrollX, y: scrollY};
    if (blockScroll) {
      window.on('scroll', messageBox.listeners.scroll, {passive: false});
    }
    window.on('keydown', messageBox.listeners.key, true);
  }

  function bindElementLiseners() {
    $('#message-box-title').on('mousedown', messageBox.listeners.mouseDown, {passive: true});
  }

  function unbindGlobalListeners() {
    window.off('keydown', messageBox.listeners.key, true);
    window.off('scroll', messageBox.listeners.scroll);
    window.off('mouseup', messageBox.listeners.mouseUp);
    window.off('mousemove', messageBox.listeners.mouseMove);
    $('#message-box-title').off('mousedown', messageBox.listeners.mouseDown);
  }

  function removeSelf() {
    messageBox.element.remove();
    messageBox.element = null;
    messageBox._resolve = null;
  }
};

/**
 * @param {String|Node|Array<String|Node>} contents
 * @param {String} [className] like 'pre' for monospace font
 * @param {String} [title]
 * @returns {Promise<Boolean>} same as show()
 */
messageBox.alert = (contents, className, title) =>
  messageBox.show({
    title,
    contents,
    className: `center ${className || ''}`,
    buttons: [t('confirmClose')],
  });

/**
 * @param {String|Node|Array<String|Node>} contents
 * @param {String} [className] like 'pre' for monospace font
 * @param {String} [title]
 * @returns {Promise<Boolean>} resolves to true when confirmed
 */
messageBox.confirm = async (contents, className, title) => {
  const res = await messageBox.show({
    title,
    contents,
    className: `center ${className || ''}`,
    buttons: [t('confirmYes'), t('confirmNo')],
  });
  return res.button === 0 || res.enter;
};
