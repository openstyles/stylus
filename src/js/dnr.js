export const DNR_ID_IDENTITY = 10;
export const DNR_ID_INSTALLER = 20;

export const DNR = chrome.declarativeNetRequest;
/**
 * @param {chrome.declarativeNetRequest.Rule[]} [addRules]
 * @param {number[]} [removeRuleIds]
 * @return {Promise<void>}
 */
export const updateDynamicRules = updateDNR.bind(DNR.updateDynamicRules);
/**
 * @param {chrome.declarativeNetRequest.Rule[]} addRules
 * @param {number[]} [removeRuleIds]
 * @return {Promise<void>}
 */
export const updateSessionRules = updateDNR.bind(DNR.updateSessionRules);

function updateDNR(
  addRules,
  removeRuleIds = addRules.map(r => r.id),
) {
  return this({addRules, removeRuleIds});
}

if (process.env.MV3 && !process.env.ZIP && process.env.DEBUG) {
  DNR.onRuleMatchedDebug?.addListener(console.log.bind(null, 'DNR'));
}
