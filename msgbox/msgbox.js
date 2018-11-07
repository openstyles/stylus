/* global focusAccessibility moveFocus $ $create t tHTML animateElement */
'use strict';

/**
 * @param {Object} params
 * @param {String} params.title
 * @param {String|Node|Object|Array<String|Node|Object>} params.contents
 *        a string gets parsed via tHTML,
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
function messageBox({
  title,
  contents,
  className = '',
  buttons = [],
  onshow,
  blockScroll,
}) {
  initOwnListeners();
  bindGlobalListeners();
  createElement();
  document.body.appendChild(messageBox.element);

  messageBox.originalFocus = document.activeElement;
  // skip external links like feedback
  while ((moveFocus(messageBox.element, 1) || {}).target === '_blank') {/*NOP*/}
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

  return new Promise(_resolve => {
    messageBox.resolve = _resolve;
  });

  function initOwnListeners() {
    messageBox.listeners = messageBox.listeners || {
      closeIcon() {
        resolveWith({button: -1});
      },
      button() {
        resolveWith({button: this.buttonIndex});
      },
      key(event) {
        const {which, shiftKey, ctrlKey, altKey, metaKey, target} = event;
        if (shiftKey && which !== 9 || ctrlKey || altKey || metaKey) {
          return;
        }
        switch (which) {
          case 13:
            if (target.closest(focusAccessibility.ELEMENTS.join(','))) {
              return;
            }
            break;
          case 27:
            event.preventDefault();
            event.stopPropagation();
            break;
          case 9:
            moveFocus(messageBox.element, shiftKey ? -1 : 1);
            event.preventDefault();
            return;
          default:
            return;
        }
        resolveWith(which === 13 ? {enter: true} : {esc: true});
      },
      scroll() {
        scrollTo(blockScroll.x, blockScroll.y);
      }
    };
  }

  function resolveWith(value) {
    unbindGlobalListeners();
    setTimeout(messageBox.resolve, 0, value);
    animateElement(messageBox.element, {
      className: 'fadeout',
      onComplete: removeSelf,
    });
    if (messageBox.element.contains(document.activeElement)) {
      messageBox.originalFocus.focus();
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
          $create(`#${id}-contents`, tHTML(contents)),
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
    blockScroll = blockScroll && {x: scrollX, y: scrollY};
    if (blockScroll) {
      window.addEventListener('scroll', messageBox.listeners.scroll);
    }
    window.addEventListener('keydown', messageBox.listeners.key, true);
  }

  function unbindGlobalListeners() {
    window.removeEventListener('keydown', messageBox.listeners.key, true);
    window.removeEventListener('scroll', messageBox.listeners.scroll);
  }

  function removeSelf() {
    messageBox.element.remove();
    messageBox.element = null;
    messageBox.resolve = null;
  }
}

/**
 * @param {String|Node|Array<String|Node>} contents
 * @param {String} [className] like 'pre' for monospace font
 * @param {String} [title]
 * @returns {Promise<Boolean>} same as messageBox
 */
messageBox.alert = (contents, className, title) =>
  messageBox({
    title,
    contents,
    className: `center ${className || ''}`,
    buttons: [t('confirmClose')]
  });

/**
 * @param {String|Node|Array<String|Node>} contents
 * @param {String} [className] like 'pre' for monospace font
 * @returns {Promise<Boolean>} resolves to true when confirmed
 */
messageBox.confirm = (contents, className) =>
  messageBox({
    contents,
    className: `center ${className || ''}`,
    buttons: [t('confirmYes'), t('confirmNo')]
  }).then(result => result.button === 0 || result.enter);
