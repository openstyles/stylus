import browser from './browser';
import {apiHandler, unwrap} from './msg-base';
import {deepCopy, getOwnTab} from './toolbox';

export * from './msg-base';

const needsTab = [
  'updateIconBadge',
  'styleViaAPI',
];

export let bg = __ENTRY === 'background' ? self : chrome.extension.getBackgroundPage();

async function invokeAPI(path, args) {
  let tab = false;
  // Using a fake id for our Options frame as we want to fetch styles early
  const frameId = window === top ? 0 : 1;
  if (!needsTab.includes(path) || !frameId && (tab = await getOwnTab())) {
    const res = await bg.msg._execute('extension',
      bg.deepCopy({method: 'invokeAPI', path, args}),
      bg.deepCopy({url: location.href, tab, frameId}));
    return deepCopy(res);
  }
}

export function sendTab(tabId, data, options, target = 'tab') {
  return unwrap(browser.tabs.sendMessage(tabId, {data, target}, options));
}

if (__ENTRY !== 'background') {
  const {apply} = apiHandler;
  apiHandler.apply = async (fn, thisObj, args) => {
    if (bg === null) bg = await browser.runtime.getBackgroundPage().catch(() => {}) || false;
    const bgReady = bg?.bgReady;
    return bgReady && (bg.msg || await bgReady.all)
      ? invokeAPI(fn.name, args)
      : apply(fn, thisObj, args);
  };
}
