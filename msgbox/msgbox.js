'use strict';

function messageBox({
  title,          // [mandatory] string
  contents,       // [mandatory] 1) DOM element 2) string
  className = '', // string, CSS class name of the message box element
  buttons = [],   // array of strings or objects like {textContent[string], onclick[function]}.
  onshow,         // function(messageboxElement) invoked after the messagebox is shown
  blockScroll,    // boolean, blocks the page scroll
}) {              // RETURNS: Promise resolved to {button[number], enter[boolean], esc[boolean]}
  messageBox.originalFocus = document.activeElement;
  initOwnListeners();
  bindGlobalListeners();
  createElement();
  document.body.appendChild(messageBox.element);
  if (onshow) {
    onshow(messageBox.element);
  }
  messageBox.element.focus();
  const firstEl = $('a, button, input, select', messageBox.element);
  if (firstEl) {
    firstEl.focus();
  }
  messageBox.lastEl = firstEl || messageBox.element;
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
        const keyCode = event.keyCode || event.which;
        if (event.target.closest('#message-box, .colorpicker-popup')) {
          messageBox.lastEl = event.target;
        }
        if (keyCode === 13 && event.target.dataset.allowEnter) {
          // usercss item resets needs to activate
          return;
        }
        if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
        && (keyCode === 13 || keyCode === 27)) {
          event.preventDefault();
          event.stopPropagation();
          resolveWith(keyCode === 13 ? {enter: true, button: event.target.buttonIndex} : {esc: true});
        }
      },
      keyup(event) {
        const keyCode = event.keyCode || event.which;
        if (keyCode === 9 && !event.target.closest('#message-box, .colorpicker-popup')) {
          event.preventDefault();
          event.stopPropagation();
          messageBox.lastEl.focus();
        }
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
    messageBox.originalFocus.focus();
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
    window.addEventListener('keyup', messageBox.listeners.keyup, true);
  }

  function unbindGlobalListeners() {
    window.removeEventListener('keydown', messageBox.listeners.key, true);
    window.removeEventListener('keyup', messageBox.listeners.keyup, true);
    window.removeEventListener('scroll', messageBox.listeners.scroll);
  }

  function removeSelf() {
    messageBox.element.remove();
    messageBox.element = null;
    messageBox.resolve = null;
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
