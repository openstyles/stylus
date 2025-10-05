import {$create} from '@/js/dom';
import {animateElement, closestFocusable, moveFocus} from '@/js/dom-util';
import {tHTML} from '@/js/localization';
import {clamp, t} from '@/js/util';
import './message-box.css';

/** @type {Set<MessageBox>} */
const boxes = new Set();

export function pauseAll(paused = true) {
  for (const b of boxes) b.paused = paused;
}

export class MessageBox {
  /** @readonly
   * @type {HTMLElement} */
  el = null;
  originalFocus = null;
  paused = false;
  #blockScroll = null;
  #moving = false;
  #resolve = null;
  #clickX = 0;
  #clickY = 0;
  #offsetX = 0;
  #offsetY = 0;
  /**
   * @typedef MessageBoxParams
   * @prop {String} title
   * @prop {String|Node|Object|Array<String|Node|Object>} contents
   *        a string gets parsed via tHTML,
   *        a non-string is passed as is to $create()
   * @prop {String} [className]
   *        CSS class name of the message box element
   * @prop {Array<String | WritableElementProps | AppendableElementGuts>} [buttons]
   *        anything $create() can handle
   * @prop {Boolean} [blockScroll]
   *        blocks the page scroll
   */
  /** @param {MessageBoxParams} params */
  constructor({
    title,
    contents,
    className = '',
    buttons = [],
    blockScroll,
  }) {
    this.#blockScroll = blockScroll;
    this.el =
      $create('div', {id: 'message-box', className}, [
        $create('div', [
          $create('#message-box-title.ellipsis', {on: {mousedown: this}}, title),
          $create('#message-box-close-icon',
            {on: {click: this.#resolveWith.bind(this, {button: -1})}},
            $create('i.i-close')),
          $create('#message-box-contents', tHTML(contents)),
          $create('#message-box-buttons', buttons.filter(Boolean).map((btn, buttonIndex) => {
            if (btn.localName !== 'button') btn = $create('button', btn);
            btn.buttonIndex = buttonIndex;
            btn.on('click', this.#resolveWith.bind(this, {button: buttonIndex}));
            return btn;
          })),
        ]),
      ]);
  }

  /**
   * @typedef {{
   *   button?: Number,
   *   enter?: Boolean,
   *   esc?: Boolean,
   * }} MessageBoxResult
   */
  /**
   * @param {(elem: HTMLElement) => void} [onshow]
   * @returns {Promise<MessageBoxResult>}
   * */
  open(onshow) {
    const el = this.el;
    document.body.appendChild(el);
    window.on('keydown', this, true);
    if (this.#blockScroll) {
      window.on('scroll', this, {passive: false});
      this.#blockScroll = {x: scrollX, y: scrollY};
    }
    boxes.delete(this);
    pauseAll();
    this.paused = false;
    boxes.add(this);
    // focus the first focusable child but skip the first external link which is usually `feedback`
    this.originalFocus = document.activeElement;
    if (moveFocus(el, 0)?.target === '_blank' && el.classList.contains('config-dialog'))
      moveFocus(el, 1);
    if (document.activeElement === this.originalFocus)
      document.body.focus();
    if (typeof onshow === 'function')
      onshow.call(this, el);
    return new Promise(resolve => {
      this.#resolve = resolve;
    });
  }

  async close(isAnimated) {
    if (!this.#resolve) // re-entry while waiting for closing animation
      return;
    if (this.el.contains(document.activeElement))
      this.originalFocus.focus();
    this.#resolve = this.originalFocus = null;
    window.off('keydown', this, true);
    window.off('scroll', this);
    window.off('mouseup', this);
    window.off('mousemove', this);
    boxes.delete(this);
    pauseAll(false);
    this.paused = true;
    if (isAnimated)
      await animateElement(this.el, 'fadeout');
    this.el.remove();
  }

  #resolveWith(value) {
    if (!this.#resolve) // re-entry while waiting for closing animation
      return;
    setTimeout(this.#resolve, 0, value);
    this.close(true);
  }

  /** @private */
  handleEvent(evt) {
    if (this.paused)
      return;
    switch (evt.type) {
      case 'keydown': return this.#onKey(evt);
      case 'mousedown': return this.#onMouseDown(evt);
      case 'mousemove': return this.#onMouseMove(evt);
      case 'mouseup': return this.#onMouseUp(evt);
      case 'scroll': return this.#onScroll(evt);
    }
  }

  #onKey(evt) {
    const {key, shiftKey, ctrlKey, altKey, metaKey, target} = evt;
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
        evt.preventDefault();
        evt.stopPropagation();
        break;
      case 'Tab':
        moveFocus(this.el, shiftKey ? -1 : 1);
        evt.preventDefault();
        return;
      default:
        return;
    }
    this.#resolveWith(key === 'Enter' ? {enter: true} : {esc: true});
  }

  #onMouseDown(evt) {
    if (evt.button)
      return;
    if (!this.#moving) {
      window.on('mouseup', this, {passive: true});
      window.on('mousemove', this, {passive: true});
      this.#moving = true;
    }
    this.#clickX = evt.clientX - this.#offsetX;
    this.#clickY = evt.clientY - this.#offsetY;
  }

  #onMouseUp(evt) {
    if (evt.button !== 0) return;
    window.off('mouseup', this);
    window.off('mousemove', this);
    this.#moving = false;
  }

  #onMouseMove(evt) {
    this.#offsetX = clamp(evt.clientX, 30, innerWidth - 30) - this.#clickX;
    this.#offsetY = clamp(evt.clientY, 30, innerHeight - 30) - this.#clickY;
    this.el.firstChild.style.transform = `translate(${this.#offsetX}px,${this.#offsetY}px)`;
  }

  #onScroll() {
    scrollTo(this.#blockScroll.x, this.#blockScroll.y);
  }
}

/**
 * @param {String|Node|Array<String|Node>} contents
 * @param {String} [className] like 'pre' for monospace font
 * @param {String} [title]
 * @returns {Promise<MessageBoxResult>}
 */
export function alert(contents, className, title) {
  return new MessageBox({
    title,
    contents,
    className: `center ${className || ''}`,
    buttons: [t('confirmClose')],
  }).open();
}

/**
 * @param {String|Node|Array<String|Node>} contents
 * @param {String} [className] like 'pre' for monospace font
 * @param {String} [title]
 * @returns {Promise<Boolean>} resolves to true when confirmed
 */
export async function confirm(contents, className, title) {
  const res = await new MessageBox({
    title,
    contents,
    className: `center ${className || ''}`,
    buttons: [t('confirmYes'), t('confirmNo')],
  }).open();
  return res.button === 0 || res.enter;
}

/**
 * @param {MessageBoxParams & {onshow: (elem: HTMLElement) => void}} params
 * @returns {Promise<MessageBoxResult>} */
export function show(params) {
  return new MessageBox(params).open(params.onshow);
}
