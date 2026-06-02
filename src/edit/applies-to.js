import {template} from '@/js/localization';
import {renderTargetIcons} from '@/js/target-icons';

export const C_CONTAINER = '.applies-to';
export const C_LIST = '.applies-to-list';
export const C_ITEM = '.applies-to-item';
export const C_TYPE = '.applies-type';
export const C_VALUE = '.applies-value';
export const tplAppliesTo = template.appliesTo;
export const tplAppliesToItem = tplAppliesTo.$(C_ITEM);

const ICON_THROTTLE_MS = 500;
let queue, timer;

tplAppliesToItem.remove();

/**
 * @param {Element | Element[] | NodeList} [what]
 * @param {boolean} [throttle]
 */
export function iconize(what, throttle) {
  if (timer)
    timer = clearTimeout(timer);
  if (what) {
    queue ??= new Set();
    if (what.forEach) what.forEach(queue.add, queue);
    else queue.add(what);
  }
  if (throttle)
    timer = setTimeout(iconize, ICON_THROTTLE_MS);
  if (queue) {
    renderTargetIcons(queue, C_VALUE, 'value');
    queue = null;
  }
}
