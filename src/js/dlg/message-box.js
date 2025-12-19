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
  /** @typedef {HTMLElement & {_body: HTMLElement, _buttons: HTMLElement}} MessageBoxElement */
  /** @readonly
   * @type {MessageBoxElement} */
  el;
  /** @type {HTMLElement} */
  originalFocus;
  /** @type {boolean} */
  paused;
  // privates
  #blockScroll;
  #moving;
  #resolve;
  #resolveAsClosed;
  #clickX;
  #clickY;
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
    this.el = $create('#message-box', {className});
    this.el.appendChild($tag('div')).append(
      $create('#message-box-title.ellipsis', {on: {mousedown: this}}, title),
      $create('#message-box-close-icon',
        {on: {click: this.#resolveAsClosed = this.#resolveWith.bind(this, {button: -1})}},
        $create('i.i-close')),
      this.el._body =
      $create('#message-box-contents', tHTML(contents)),
      this.el._buttons =
      $create('#message-box-buttons', buttons.filter(Boolean).map((btn, buttonIndex) => {
        if (btn.localName !== 'button') btn = $create('button', btn);
        btn.buttonIndex = buttonIndex;
        btn.on('click', this.#resolveWith.bind(this, {button: buttonIndex}));
        return btn;
      })),
    );
  }

  /**
   * @typedef {{
   *   button?: Number,
   *   enter?: Boolean,
   *   esc?: Boolean,
   * }} MessageBoxResult
   */
  /**
   * @param {(elem: MessageBoxElement) => void} [onshow]
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
    if (el.matches('.note'))
      el.on('click', this);
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
      case 'click': return evt.target === this.el && this.#resolveAsClosed();
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
    if (!this.el.style.padding && this.el.matches('.note, .center, .center-dialog')) {
      const b = this.el.firstChild.getBoundingClientRect();
      this.el.style.padding = `${b.y | 0}px 0 0 ${b.x | 0}px`;
    }
    this.#clickX = evt.x - this.#offsetX;
    this.#clickY = evt.y - this.#offsetY;
  }

  /** @param {MouseEvent} evt */
  #onMouseMove(evt) {
    if (!evt.buttons) {
      this.#onMouseUp();
      return;
    }
    this.el.firstChild.style.transform = `translate(${
      this.#offsetX = clamp(evt.x, 30, innerWidth - 30) - this.#clickX
    }px,${
      this.#offsetY = clamp(evt.y, 30, innerHeight - 30) - this.#clickY
    }px)`;
  }

  #onMouseUp(evt) {
    if (evt && evt.button !== 0) return;
    window.off('mouseup', this);
    window.off('mousemove', this);
    this.#moving = false;
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
 * @param {MessageBoxParams & {onshow: (elem: MessageBoxElement) => void}} params
 * @returns {Promise<MessageBoxResult>} */
export function show(params) {
  return new MessageBox(params).open(params.onshow);
}
