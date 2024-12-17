import {getLZValue, LZ_KEY, unLZ} from '@/js/chrome-sync';
import {onStorageChanged} from '@/js/util-webext';

export let value;

const key = LZ_KEY.usercssTemplate;

export async function load() {
  value ??= getLZValue(key);
  if (value.then) value = await value;
  return value;
}

onStorageChanged.addListener(changes => {
  if ((changes = changes[key])) {
    value = unLZ(changes.newValue);
  }
});
