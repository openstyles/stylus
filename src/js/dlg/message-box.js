import {$create} from '@/js/dom';
import {animateElement, closestFocusable, moveFocus} from '@/js/dom-util';
import {tHTML} from '@/js/localization';
import {clamp, t} from '@/js/util';
import './message-box.css';

// TODO: convert this singleton mess so we can show many boxes at once
const messageBox = {
  element: null,
  listeners: null,
  _blockScroll: null,
  _originalFocus: null,
  _resolve: null,
};
export default messageBox;

messageBox.close = async isAnimated => {
  window.off('keydown', messageBox.listeners.key, true);
  window.off('scroll', messageBox.listeners.scroll);
  window.off('mouseup', messageBox.listeners.mouseUp);
  window.off('mousemove', messageBox.listeners.mouseMove);
  if (isAnimated) {
    await animateElement(messageBox.element, 'fadeout');
  }
  messageBox.element.remove();
  messageBox.element = null;
  messageBox._resolve = null;
};

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
messageBox.show = ({
  title,
  contents,
  className = '',
  buttons = [],
  onshow,
  blockScroll,
}) => {
  if (!messageBox.listeners) initOwnListeners();
  createElement();
  bindGlobalListeners();
  document.body.appendChild(messageBox.element);

  messageBox._originalFocus = document.activeElement;
  // focus the first focusable child but skip the first external link which is usually `feedback`
  if ((moveFocus(messageBox.element, 0) || {}).target === '_blank' &&
      /config-dialog/.test(className)) {
    moveFocus(messageBox.element, 1);
  }
  if (document.activeElement === messageBox._originalFocus) {
    document.body.focus();
  }

  if (typeof onshow === 'function') {
    onshow(messageBox.element);
  }

  if (!$id('message-box-title').textContent) {
    $id('message-box-title').hidden = true;
    $id('message-box-close-icon').hidden = true;
  }

  return new Promise(resolve => {
    messageBox._resolve = resolve;
  });

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
            if (closestFocusable(target)) {
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
        offsetX = clamp(event.clientX, 30, innerWidth - 30) - clickX;
        offsetY = clamp(event.clientY, 30, innerHeight - 30) - clickY;
        messageBox.element.firstChild.style.transform = `translate(${offsetX}px,${offsetY}px)`;
      },
    };
  }

  function resolveWith(value) {
    setTimeout(messageBox._resolve, 0, value);
    if (messageBox.element.contains(document.activeElement)) {
      messageBox._originalFocus.focus();
    }
    messageBox.close(true);
  }

  function createElement() {
    if (messageBox.element) {
      messageBox.close();
    }
    const id = 'message-box';
    messageBox.element =
      $create('div', {id, className}, [
        $create('div', [
          $create(`#${id}-title.ellipsis`, {onmousedown: messageBox.listeners.mouseDown}, title),
          $create(`#${id}-close-icon`, {onclick: messageBox.listeners.closeIcon},
            $create('i.i-close')),
          $create(`#${id}-contents`, tHTML(contents)),
          $create(`#${id}-buttons`, buttons.filter(Boolean).map((btn, buttonIndex) => {
            if (btn.localName !== 'button') btn = $create('button', btn);
            btn.buttonIndex = buttonIndex;
            btn.onclick ??= messageBox.listeners.button;
            return btn;
          })),
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
