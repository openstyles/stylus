/* global focusAccessibility */
'use strict';

function messageBox({
  title,          // [mandatory] string
  contents,       // [mandatory] 1) DOM element 2) string
  className = '', // string, CSS class name of the message box element
  buttons = [],   // array of strings or objects like {textContent[string], onclick[function]}.
  onshow,         // function(messageboxElement) invoked after the messagebox is shown
  blockScroll,    // boolean, blocks the page scroll
}) {              // RETURNS: Promise resolved to {button[number], enter[boolean], esc[boolean]}
  initOwnListeners();
  bindGlobalListeners();
  createElement();
  document.body.appendChild(messageBox.element);

  messageBox.originalFocus = document.activeElement;
  moveFocus(1);

  if (typeof onshow === 'function') {
    onshow(messageBox.element);
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
            moveFocus(shiftKey ? -1 : 1);
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
                textContent: typeof content === 'object' ? '' : content,
                onclick: messageBox.listeners.button,
              }, typeof content === 'object' && content)))),
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

  function moveFocus(dir) {
    const elements = [...messageBox.element.getElementsByTagName('*')];
    const activeIndex = elements.indexOf(document.activeElement);
    const num = elements.length;
    for (let i = 1; i < num; i++) {
      const elementIndex = (activeIndex + i * dir + num) % num;
      // we don't use positive tabindex so we stop at any valid value
      const el = elements[elementIndex];
      if (!el.disabled && el.tabIndex >= 0) {
        el.focus();
        return;
      }
    }
  }
}

messageBox.alert = text =>
  messageBox({
    contents: text,
    className: 'pre center',
    buttons: [t('confirmClose')]
  });

messageBox.confirm = text =>
  messageBox({
    contents: text,
    className: 'pre center',
    buttons: [t('confirmYes'), t('confirmNo')]
  }).then(result => result.button === 0 || result.enter);
