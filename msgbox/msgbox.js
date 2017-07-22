'use strict';

function messageBox({
  title,          // [mandatory] the title string for innerHTML
  contents,       // [mandatory] 1) DOM element 2) string for innerHTML
  className = '', // string, CSS class name of the message box element
  buttons = [],   // array of strings used as labels
  onshow,         // function(messageboxElement) invoked after the messagebox is shown
  blockScroll,    // boolean, blocks the page scroll
}) {              // RETURNS: Promise resolved to {button[number], enter[boolean], esc[boolean]}
  initOwnListeners();
  bindGlobalListeners();
  createElement();
  document.body.appendChild(messageBox.element);
  if (onshow) {
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
        const keyCode = event.keyCode || event.which;
        if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
        && (keyCode === 13 || keyCode === 27)) {
          event.preventDefault();
          resolveWith(keyCode === 13 ? {enter: true} : {esc: true});
        }
      },
      scroll() {
        scrollTo(blockScroll.x, blockScroll.y);
      }
    };
  }

  function resolveWith(value) {
    setTimeout(messageBox.resolve, 0, value);
    animateElement(messageBox.element, {className: 'fadeout', remove: true})
      .then(unbindAndRemoveSelf);
  }

  function createElement() {
    if (messageBox.element) {
      unbindAndRemoveSelf();
    }
    const id = 'message-box';
    const putAs = typeof contents === 'string' ? 'innerHTML' : 'appendChild';
    messageBox.element = $element({id, className, appendChild: [
      $element({appendChild: [
        $element({id: `${id}-title`, innerHTML: title}),
        $element({id: `${id}-close-icon`, appendChild:
          $element({tag: 'SVG#svg', class: 'svg-icon', viewBox: '0 0 20 20', appendChild:
            $element({tag: 'SVG#path', d: 'M11.69,10l4.55,4.55-1.69,1.69L10,11.69,' +
              '5.45,16.23,3.77,14.55,8.31,10,3.77,5.45,5.45,3.77,10,8.31l4.55-4.55,1.69,1.69Z',
            })
          }),
          onclick: messageBox.listeners.closeIcon}),
        $element({id: `${id}-contents`, [putAs]: contents}),
        $element({id: `${id}-buttons`, appendChild:
          buttons.map((textContent, buttonIndex) => textContent &&
            $element({
              tag: 'button',
              buttonIndex,
              textContent,
              onclick: messageBox.listeners.button,
            })
          )
        }),
      ]}),
    ]});
  }

  function bindGlobalListeners() {
    blockScroll = blockScroll && {x: scrollX, y: scrollY};
    if (blockScroll) {
      window.addEventListener('scroll', messageBox.listeners.scroll);
    }
    window.addEventListener('keydown', messageBox.listeners.key);
  }

  function unbindAndRemoveSelf() {
    document.removeEventListener('keydown', messageBox.listeners.key);
    window.removeEventListener('scroll', messageBox.listeners.scroll);
    messageBox.element.remove();
    messageBox.element = null;
    messageBox.resolve = null;
  }
}
