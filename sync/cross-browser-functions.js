/* exported getRedirectUrlAuthFlow launchWebAuthFlow */
'use strict';

/**
 * @returns {String} returns a redirect URL to be used in |launchWebAuthFlow|
 */
function getRedirectUrlAuthFlow() {
  const browserApi = typeof browser === 'undefined' ? chrome : browser;
  return browserApi.identity.getRedirectURL();
}

/**
 * @param {Object} details based on chrome api
 * @param {string} details.url url that initiates the auth flow
 * @param {boolean} details.interactive if it is true a window will be displayed
 * @return {Promise} returns the url containing the token for extraction
 */
function launchWebAuthFlow(details) {
  if (typeof browser === 'undefined') {
    return new Promise(resolve => {
      chrome.identity.launchWebAuthFlow(details, resolve);
    });
  }
  return browser.identity.launchWebAuthFlow(details);
}
