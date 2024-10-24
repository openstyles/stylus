import {chromeSync, LZ_KEY} from '/js/storage-util';
import {onStorageChanged} from '/js/util-webext';

export let value;

const key = LZ_KEY.usercssTemplate;

export async function load() {
  value ??= chromeSync.getLZValue(key);
  if (value.then) value = await value;
  return value;
}

onStorageChanged.addListener(changes => {
  if ((changes = changes[key])) {
    value = changes.newValue;
  }
});
