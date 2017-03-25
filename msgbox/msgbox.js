'use strict';

function messageBox({title, contents, buttons, onclick}) {
  // keep the same reference to be able to remove the listener later
  messageBox.close = messageBox.close || close;
  if (messageBox.element) {
    messageBox.element.remove();
  }
  const id = 'message-box';
  const putAs = typeof contents == 'string' ? 'innerHTML' : 'appendChild';
  messageBox.element = $element({id, appendChild: [
    $element({id: `${id}-title`, innerHTML: title}),
    $element({id: `${id}-close-icon`, onclick: messageBox.close}),
    $element({id: `${id}-contents`, [putAs]: contents}),
    $element({id: `${id}-buttons`,
      onclick: relayButtonClick,
      appendChild: (buttons || []).map(textContent =>
        textContent && $element({tag: 'button', textContent}))
    }),
  ]});
  show();
  return messageBox.element;

  function show() {
    document.body.appendChild(messageBox.element);
    document.addEventListener('keydown', messageBox.close);
  }

  function close(event) {
    if ((!event
    || event.type == 'click'
    || event.keyCode == 27 && !event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey)
    && messageBox.element) {
      animateElement(messageBox.element, {className: 'fadeout', remove: true});
      document.removeEventListener('keydown', messageBox.close);
      $(`#${id}-buttons`).onclick = null;
      messageBox.element = null;
    }
  }

  function relayButtonClick(event) {
    const button = event.target.closest('button');
    if (button) {
      close();
      if (onclick) {
        onclick([...this.children].indexOf(button));
      }
    }
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
