export const DNR_ID_IDENTITY = 1e6;
export const DNR_ID_INSTALLER = 1;

export const DNR = __.MV3 && chrome.declarativeNetRequest;
/**
 * @param {chrome.declarativeNetRequest.Rule[]} [addRules]
 * @param {number[]} [removeRuleIds]
 * @return {Promise<void>}
 */
export const updateDynamicRules = __.MV3 && updateDNR.bind(DNR.updateDynamicRules);
/**
 * @param {chrome.declarativeNetRequest.Rule[]} addRules
 * @param {number[]} [removeRuleIds]
 * @return {Promise<void>}
 */
export const updateSessionRules = __.MV3 && updateDNR.bind(DNR.updateSessionRules);

const getRuleId = r => r.id;
export const getRuleIds = rules => rules.map(getRuleId);

function updateDNR(
  addRules,
  removeRuleIds = getRuleIds(addRules),
) {
  return this({addRules, removeRuleIds});
}

if (__.MV3 && (__.DEBUG || __.DEV)) {
  DNR.onRuleMatchedDebug?.addListener(console.log.bind(null, 'DNR'));
}
