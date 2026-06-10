import {getLZValue, LZ_KEY} from '@/js/chrome-sync';
import {NOP} from '@/js/util';
import {onStorageChanged} from '@/js/util-webext';
import {buildMeta} from './usercss-manager';

/** @typedef {[string, ?string, UsercssData|false]} UsercssTemplate */
/** @type {UsercssTemplate} */
export let value;

const key = LZ_KEY.usercssTemplate;
const DEFAULT = `\
/* ==UserStyle==
@name           ${''/* just a visual reminder to keep trailing spaces */}
@namespace      github.com/openstyles/stylus
@version        1.0.0
@description    A new userstyle
@author         Me
==/UserStyle== */

`;

const parseTemplate = async (str = DEFAULT) => (value = [
  DEFAULT,
  str,
  await buildMeta(null, str).catch(NOP) || false,
]);

export const loadTemplate = () => (value ??= getLZValue(key).then(parseTemplate));

onStorageChanged.addListener(changes => {
  if (changes[key])
    value = null; // will be updated next time the editor needs it
});
