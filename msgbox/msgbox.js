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
        if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
        && (event.keyCode == 13 || event.keyCode == 27)) {
          event.preventDefault();
          resolveWith(event.keyCode == 13 ? {enter: true} : {esc: true});
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
    const putAs = typeof contents == 'string' ? 'innerHTML' : 'appendChild';
    messageBox.element = $element({id, className, appendChild: [
      $element({appendChild: [
        $element({id: `${id}-title`, innerHTML: title}),
        $element({id: `${id}-close-icon`, onclick: messageBox.listeners.closeIcon}),
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

  function $element(opt) {
    const element = document.createElement(opt.tag || 'div');
    (opt.appendChild instanceof Array ? opt.appendChild : [opt.appendChild])
      .forEach(child => child && element.appendChild(child));
    delete opt.appendChild;
    delete opt.tag;
    return Object.assign(element, opt);
  }
}
