export const DNR_ID_IDENTITY = 10;
export const DNR_ID_INSTALLER = 20;

/**
 * @param {chrome.declarativeNetRequest.Rule[]} addRules
 * @param {number[]} [removeRuleIds]
 * @return {Promise<void>}
 */
export const updateDNR = (
  addRules,
  removeRuleIds = addRules.map(r => r.id),
) => browser.declarativeNetRequest.updateDynamicRules({addRules, removeRuleIds});

if (process.env.MV3 && !process.env.ZIP) {
  chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(console.log.bind(null, 'DNR'));
}
